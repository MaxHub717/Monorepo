import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  Prisma,
  DivisionType,
  CompetitionFormat,
} from '@prisma/client';
import {
  CreateSeasonDto,
  CreateDivisionDto,
  UpdateDivisionDto,
} from './dto/season.dto.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { OutboxService } from '../events/outbox.service.js';
import { AuditService } from '../audit/audit.service.js';
import { createCompetitionNotifications } from '../notification/notification.service.js';
import { eligiblePlayerProfileWhere } from '../participation/eligibility.js';
import {
  resolveCompetitionParticipantCount,
  selectCompetitionParticipants,
} from './competition-field.js';
import {
  buildPlayerFacingRules,
  validateCompetitionRules,
  validateSeriesSchedule,
  type SeriesScheduleValidationInput,
} from '../competition/competition.domain.js';

function asPlayerIds(value: Prisma.JsonValue | null | undefined): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function buildCanonicalScheduleValidationInput(season: any, phases: any[]): SeriesScheduleValidationInput {
  const rows = phases.flatMap((phase) => phase.plots.flatMap((plot: any) => plot.series.map((series: any) => {
    const savedPlayers = asPlayerIds(series.participant_player_ids);
    const firstGame = series.games[0];
    const playerIds = savedPlayers.length === 2
      ? savedPlayers
      : [firstGame?.home_player_id, firstGame?.away_player_id].filter((playerId): playerId is string => Boolean(playerId));
    return { phase, plot, series, playerIds };
  })));
  return {
    automatic: false,
    competitionTimezone: season.competition_timezone,
    seasonStartAt: season.start_date ?? new Date(0),
    seasonEndAt: season.end_date ?? new Date(0),
    phases: phases.map((phase) => ({
      id: phase.id,
      startAt: phase.start_at ?? new Date(0),
      endAt: phase.end_at ?? new Date(0),
    })),
    series: rows.map(({ phase, series, playerIds }) => ({ id: series.id, phaseId: phase.id, playerIds })),
    appointments: rows.map(({ phase, series, playerIds }) => ({
      seriesId: series.id,
      phaseId: phase.id,
      playerIds,
      scheduleKey: series.schedule_key,
      checkInOpensAt: series.check_in_opens_at,
      checkInClosesAt: series.check_in_closes_at,
      matchWindowStartAt: series.match_window_start,
      matchWindowEndAt: series.match_window_end,
      resultsDeadlineAt: series.results_deadline_at,
      timezone: series.match_window_timezone,
      gameNumbers: series.games.map((game: any) => game.game_number),
    })),
  };
}

@Injectable()
export class SeasonService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly outbox: OutboxService,
    private readonly auditService: AuditService,
  ) {}

  private readonly validTransitions: Record<string, string[]> = {
    DRAFT: ['REGISTRATION_OPEN', 'ARCHIVED'],
    REGISTRATION_OPEN: ['REGISTRATION_CLOSED', 'ARCHIVED'],
    REGISTRATION_CLOSED: ['ROSTER_LOCKED', 'ARCHIVED'],
    ROSTER_LOCKED: ['ACTIVE', 'ARCHIVED'],
    ACTIVE: ['PLAYOFFS', 'COMPLETED', 'ARCHIVED'],
    PLAYOFFS: ['COMPLETED', 'ARCHIVED'],
    COMPLETED: ['ARCHIVED'],
    ARCHIVED: [],
  };

  async listSeasons() {
    return this.prisma.season.findMany({
      select: {
        id: true,
        name: true,
        description: true,
        status: true,
        start_date: true,
        end_date: true,
        registration_open_at: true,
        registration_close_at: true,
        league: { select: { id: true, name: true, status: true } },
        divisions: {
          select: { id: true, name: true, type: true, format: true, capacity: true, active: true },
        },
      },
      orderBy: { created_at: 'desc' },
    });
  }

  async getOverview(seasonId: string) {
    const season = await this.prisma.season.findUnique({
      where: { id: seasonId },
      include: {
        league: { select: { id: true, name: true, status: true } },
        ruleset: true,
        divisions: {
          include: {
            _count: { select: { participants: true, fixtures: true, matches: true, standings_rows: true } },
          },
          orderBy: { name: 'asc' },
        },
        _count: { select: { divisions: true, participants: true, matches: true, standings_rows: true } },
      },
    });
    if (!season) throw new NotFoundException('Season not found');

    const [fixtureCount, pendingResultCount, disputeCount, penaltyCount, confirmedMatchCount] = await Promise.all([
      this.prisma.fixture.count({ where: { division: { season_id: seasonId } } }),
      this.prisma.match.count({ where: { season_id: seasonId, status: { in: ['AWAITING_RESULT', 'RESULT_SUBMITTED', 'SUBMISSION_PENDING', 'UNDER_REVIEW'] } } }),
      this.prisma.dispute.count({ where: { match: { season_id: seasonId }, status: { in: ['SUBMITTED', 'UNDER_REVIEW', 'ESCALATED'] } } }),
      this.prisma.penalty.count({ where: { match: { season_id: seasonId }, status: { in: ['PROPOSED', 'UNDER_REVIEW', 'APPROVED'] } } }),
      this.prisma.match.count({ where: { season_id: seasonId, status: { in: ['COMPLETED', 'CONFIRMED', 'ARCHIVED'] } } }),
    ]);

    const readiness = await this.getTransitionReadiness(seasonId, season.status);

    const nextAction = {
      DRAFT: { label: 'Open registration', endpoint: 'publish', reason: 'Complete configuration before accepting participants.' },
      REGISTRATION_OPEN: { label: 'Close registration', endpoint: 'close-registration', reason: 'Finalize the participant pool when registration ends.' },
      REGISTRATION_CLOSED: { label: 'Lock roster', endpoint: 'lock-roster', reason: 'Verify eligible participants before generating Phases and Series.' },
      ROSTER_LOCKED: { label: 'Activate season', endpoint: 'activate', reason: 'Ensure canonical Phase schedules are validated and locked.' },
      ACTIVE: { label: 'Start playoffs', endpoint: 'start-playoffs', reason: 'Move forward after all current Phase Series are resolved.' },
      PLAYOFFS: { label: 'Complete season', endpoint: 'complete', reason: 'Finalize the champion and season record.' },
      COMPLETED: { label: 'Archive season', endpoint: 'archive', reason: 'Make the completed season historical and read-only.' },
      ARCHIVED: null,
    }[season.status];

    return {
      id: season.id,
      name: season.name,
      description: season.description,
      status: season.status,
      start_date: season.start_date,
      end_date: season.end_date,
      registration_open_at: season.registration_open_at,
      registration_close_at: season.registration_close_at,
      league: season.league,
      ruleset: season.ruleset ? {
        id: season.ruleset.id,
        name: season.ruleset_name ?? season.ruleset.name,
        version: season.ruleset_version ?? season.ruleset.version,
        status: season.ruleset.status,
        publishedAt: season.ruleset.published_at,
        rulesHash: season.ruleset.rules_hash,
      } : null,
      playerFacingRules: season.ruleset
        ? buildPlayerFacingRules(validateCompetitionRules(season.ruleset.rules), {
            name: season.ruleset_name ?? season.ruleset.name,
            version: season.ruleset_version ?? season.ruleset.version,
          })
        : null,
      counts: {
        participants: season._count.participants,
        divisions: season._count.divisions,
        fixtures: fixtureCount,
        matches: season._count.matches,
        pendingResults: pendingResultCount,
        disputes: disputeCount,
        penalties: penaltyCount,
        confirmedMatches: confirmedMatchCount,
      },
      divisions: season.divisions,
      nextAction,
      readiness,
    };
  }

  private async getTransitionReadiness(seasonId: string, status: string) {
    const divisions = await this.prisma.division.findMany({
      where: { season_id: seasonId, active: true },
      select: {
        id: true,
        name: true,
        participants: {
          where: { status: 'ACTIVE', player: { is: eligiblePlayerProfileWhere } },
          select: { player_id: true },
        },
      },
    });
    const issues: string[] = [];
    if (['DRAFT', 'REGISTRATION_OPEN', 'REGISTRATION_CLOSED', 'ROSTER_LOCKED'].includes(status) && !divisions.length) {
      issues.push('At least one active participant group is required.');
    }
    if (status === 'DRAFT' && !(await this.hasValidSeasonDates(seasonId))) {
      issues.push('Season start and end dates are required before registration opens.');
    }
    if (status === 'REGISTRATION_CLOSED') {
      for (const division of divisions) {
        if (division.participants.length < 2) issues.push(`${division.name} needs at least two eligible active participants.`);
      }
    }
    if (status === 'ROSTER_LOCKED') {
      const readiness = await this.getCanonicalScheduleReadiness(seasonId, this.prisma);
      issues.push(...readiness.issues);
    }
    if (status === 'ACTIVE') {
      const phases = await this.prisma.phase.findMany({
        where: { season_id: seasonId, phase_type: { not: 'FINAL' } },
        include: { plots: { include: { series: { select: { status: true } } } } },
      });
      if (!phases.length || phases.some((phase) => phase.plots.flatMap((plot) => plot.series)
        .some((series) => !['COMPLETED', 'ELIMINATED'].includes(series.status)))) {
        issues.push('All current Phase Series must be resolved before advancing to playoffs.');
      }
    }
    if (status === 'PLAYOFFS') {
      const finalPhases = await this.prisma.phase.findMany({
        where: { season_id: seasonId, phase_type: 'FINAL' },
        include: { plots: { include: { series: { select: { status: true } } } } },
      });
      if (!finalPhases.length || finalPhases.some((phase) => phase.status !== 'COMPLETED'
        || phase.plots.flatMap((plot) => plot.series).some((series) => !['COMPLETED', 'ELIMINATED'].includes(series.status)))) {
        issues.push('The Final Phase and all of its Series must be resolved before completing the Season.');
      }
    }
    return { canAdvance: issues.length === 0, issues };
  }

  private async getCanonicalScheduleReadiness(seasonId: string, client: any) {
    const season = await client.season.findUnique({ where: { id: seasonId } });
    const phases = await client.phase.findMany({
      where: { season_id: seasonId },
      orderBy: { phase_number: 'asc' },
      include: { plots: { include: { series: { include: { games: true } } } } },
    });
    const issues: string[] = [];
    if (!season?.start_date || !season.end_date) issues.push('Season start and end dates are required before scheduling.');
    if (!phases.length) issues.push('Generate the canonical Phase structure before activating this Season.');
    if (phases.some((phase: any) => !phase.schedule_locked)) {
      issues.push('Every Phase schedule must be validated and locked before Season activation.');
    }
    const rows = phases.flatMap((phase: any) => phase.plots.flatMap((plot: any) => plot.series.map((series: any) => ({ phase, plot, series }))));
    if (!rows.length) issues.push('Generate Series for every Phase before activating this Season.');
    if (season && phases.length && rows.length) {
      const validationInput = buildCanonicalScheduleValidationInput(season, phases);
      const report = validateSeriesSchedule(validationInput);
      if (!report.valid) issues.push(...report.errors.map((error) => `${error.seriesId}: ${error.message}`));
    }
    return { canAdvance: issues.length === 0, issues };
  }

  private async hasValidSeasonDates(seasonId: string) {
    const season = await this.prisma.season.findUnique({ where: { id: seasonId }, select: { start_date: true, end_date: true } });
    return Boolean(season?.start_date && season.end_date && season.end_date > season.start_date);
  }

  async createSeason(
    dto: CreateSeasonDto,
    actor?: { id?: string; role?: string; requestId?: string; correlationId?: string },
  ) {
    const startDate = new Date(dto.startDate);
    const endDate = new Date(dto.endDate);
    if (endDate <= startDate) {
      throw new BadRequestException('Season end date must be after start date');
    }
    this.assertNoLegacyFixtureConfig(dto, 'createSeason');
    this.validateSchedulingConfig({
      capacity: dto.divisionCapacity,
      registrationCapacity: dto.registrationCapacity,
      competitionParticipantCount: dto.competitionParticipantCount,
      matchWindowStartMinutes: dto.matchWindowStartMinutes,
      matchWindowEndMinutes: dto.matchWindowEndMinutes,
    });

    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const league = await tx.league.findFirst({
        where: { id: dto.leagueId, status: 'ACTIVE', deleted_at: null },
        select: { id: true },
      });
      if (!league) throw new NotFoundException('Active league not found');

      const ruleset = dto.rulesetId
        ? await tx.competitionRuleset.findUnique({ where: { id: dto.rulesetId } })
        : await tx.competitionRuleset.findFirst({ where: { status: 'PUBLISHED' }, orderBy: { published_at: 'desc' } });
      if (!ruleset || ruleset.status !== 'PUBLISHED') {
        throw new BadRequestException('Choose a published Competition Ruleset before creating a Season.');
      }
      const publishedRules = validateCompetitionRules(ruleset.rules);

      const season = await tx.season.create({
        // A season is always created inside an active permanent league.
        data: {
          league_id: dto.leagueId,
          name: dto.name.trim(),
          description: dto.description?.trim() || null,
          status: 'DRAFT',
          start_date: startDate,
          end_date: endDate,
          ruleset_id: ruleset.id,
          ruleset_name: ruleset.name,
          ruleset_version: ruleset.version,
          competition_config: { rules: publishedRules, rulesHash: ruleset.rules_hash } as Prisma.InputJsonValue,
        },
      });

      const division = await tx.division.create({
        data: {
          season_id: season.id,
          name: dto.divisionName?.trim() || 'Division 1',
          type: (dto.divisionType as DivisionType | undefined) ?? DivisionType.AMATEUR,
          format: (dto.divisionFormat as CompetitionFormat | undefined) ?? CompetitionFormat.ROUND_ROBIN_SINGLE,
          capacity: dto.divisionCapacity ?? null,
          registration_capacity: dto.registrationCapacity ?? null,
          competition_participant_count: dto.competitionParticipantCount ?? null,
          scheduling_period_days: dto.schedulingPeriodDays ?? 7,
          matches_per_participant: dto.matchesPerParticipant ?? 1,
          match_window_start_minutes: dto.matchWindowStartMinutes ?? null,
          match_window_end_minutes: dto.matchWindowEndMinutes ?? null,
          match_window_timezone: dto.matchWindowTimezone?.trim() || 'UTC',
          concurrent_matches: dto.concurrentMatches ?? 1,
          description: 'Default player division',
        },
      });

      await tx.auditLog.create({
        data: {
          entity_type: 'Season',
          entity_id: season.id,
          action: 'SEASON_RULESET_ATTACHED',
          actor_id: actor?.id,
          actor_role: actor?.role,
          request_id: actor?.requestId,
          after_state: {
            rulesetId: ruleset.id,
            rulesetName: ruleset.name,
            rulesetVersion: ruleset.version,
            rulesHash: ruleset.rules_hash,
          },
        },
      });


      await this.outbox.enqueueEvent(tx, {
        eventName: 'season.created',
        aggregateType: 'Season',
        aggregateId: season.id,
        actorId: actor?.id,
        actorRole: actor?.role,
        correlationId: actor?.correlationId ?? actor?.requestId,
        metadata: { season },
      });

      return season;
    });
  }

  async getPlayerFacingRules(seasonId: string) {
    const season = await this.prisma.season.findUnique({ where: { id: seasonId }, include: { ruleset: true } });
    if (!season) throw new NotFoundException('Season not found');
    if (!season.ruleset) {
      return { available: false, seasonId, rulesetName: season.ruleset_name, rulesetVersion: season.ruleset_version, playerFacing: null };
    }
    const rules = validateCompetitionRules(season.ruleset.rules);
    return {
      available: true,
      seasonId,
      rulesetId: season.ruleset.id,
      rulesetName: season.ruleset_name ?? season.ruleset.name,
      rulesetVersion: season.ruleset_version ?? season.ruleset.version,
      rulesHash: season.ruleset.rules_hash,
      publishedAt: season.ruleset.published_at?.toISOString() ?? null,
      playerFacing: buildPlayerFacingRules(rules, {
        name: season.ruleset_name ?? season.ruleset.name,
        version: season.ruleset_version ?? season.ruleset.version,
      }),
    };
  }

  private async changeStatus(
    tx: Prisma.TransactionClient,
    seasonId: string,
    newStatus: string,
    actor?: { id?: string; role?: string; correlationId?: string },
    metadata?: unknown,
  ) {
    const season = await tx.season.findUnique({ where: { id: seasonId } });
    if (!season) throw new NotFoundException('Season not found');

    const allowed = this.validTransitions[season.status] ?? [];
    if (!allowed.includes(newStatus)) {
      throw new BadRequestException(`Invalid season transition from ${season.status} to ${newStatus}`);
    }

    if (newStatus === 'REGISTRATION_OPEN') {
      if (!season.start_date || !season.end_date) {
        throw new BadRequestException('Season start and end dates are required');
      }
      if (season.end_date <= season.start_date) {
        throw new BadRequestException('Season end date must be after start date');
      }
    }

    if (newStatus === 'ROSTER_LOCKED') {
      const divisions = await tx.division.findMany({
        where: { season_id: seasonId, active: true },
        select: { id: true, name: true },
      });
      if (!divisions.length) throw new BadRequestException('Season must have at least one active division');

      for (const division of divisions) {
        const count = await tx.divisionParticipant.count({
          where: { season_id: seasonId, division_id: division.id, status: 'ACTIVE' },
        });
        if (count < 2) {
          throw new BadRequestException(`Division ${division.name} requires at least two active players before roster lock`);
        }
      }
    }

    if (newStatus === 'ACTIVE') {
      if (season.status !== 'ROSTER_LOCKED') {
        throw new BadRequestException('Season roster must be locked before activation');
      }
      const readiness = await this.getCanonicalScheduleReadiness(seasonId, tx);
      if (!readiness.canAdvance) {
        throw new BadRequestException(`Canonical competition schedule is not ready for activation: ${readiness.issues.join(' ')}`);
      }
    }

    if (newStatus === 'PLAYOFFS') {
      const phases = await tx.phase.findMany({
        where: { season_id: seasonId, phase_type: { not: 'FINAL' } },
        include: { plots: { include: { series: { select: { status: true } } } } },
      });
      const unresolved = phases.flatMap((phase: any) => phase.plots.flatMap((plot: any) => plot.series))
        .filter((series: any) => !['COMPLETED', 'ELIMINATED'].includes(series.status));
      if (!phases.length || unresolved.length > 0) {
        throw new BadRequestException('All current Phase Series must be resolved before advancing to playoffs.');
      }
    }

    if (newStatus === 'COMPLETED') {
      if (season.status !== 'PLAYOFFS') throw new BadRequestException('Season must be in playoffs before it can be completed');
      const finalPhases = await tx.phase.findMany({
        where: { season_id: seasonId, phase_type: 'FINAL' },
        include: {
          plots: {
            include: {
              series: {
                include: {
                  games: {
                    include: { result_verifications: { orderBy: [{ created_at: 'desc' }, { id: 'desc' }] } },
                  },
                },
              },
            },
          },
        },
      });
      const finalSeries = finalPhases.flatMap((phase: any) => phase.plots.flatMap((plot: any) => plot.series));
      const unresolved = finalSeries.filter((series: any) => !['COMPLETED', 'ELIMINATED'].includes(series.status));
      if (!finalPhases.length || unresolved.length > 0 || finalPhases.some((phase: any) => phase.status !== 'COMPLETED')) {
        throw new BadRequestException('Resolve and complete the Final Phase before completing the Season.');
      }

      const incompleteGames = finalSeries.flatMap((series: any) => series.games)
        .filter((game: any) => game.status !== 'COMPLETED' || game.result === null);
      if (incompleteGames.length > 0) {
        throw new BadRequestException('Every Final Phase Game must be resolved before the Season can be completed.');
      }

      const unverifiedGames = finalSeries.flatMap((series: any) => series.games)
        .filter((game: any) => {
          const resultVerifications = Array.isArray((game as any).result_verifications)
            ? (game as any).result_verifications
            : [];
          const currentVersionEvents = resultVerifications.filter((entry: any) => entry.result_version === game.result_version);
          const latest = currentVersionEvents.find((entry: any) => entry.status !== 'PENDING') ?? currentVersionEvents[0];
          return !latest || !['APPROVED', 'OVERRIDDEN'].includes(latest.status);
        });
      if (unverifiedGames.length > 0) {
        throw new BadRequestException('Final Phase results must be approved or overridden before a champion can be declared.');
      }

      const championCandidates = Array.from(new Set(
        finalSeries
          .filter((series: any) => series.status === 'COMPLETED' && series.winner_player_id)
          .map((series: any) => series.winner_player_id)
          .filter((playerId: unknown): playerId is string => typeof playerId === 'string' && !!playerId),
      ));
      if (championCandidates.length !== 1) {
        throw new BadRequestException('A single champion must be identified from the Final Phase before Season completion.');
      }
      const championPlayerId = championCandidates[0];

      const unresolvedDisputes = await tx.dispute.findMany({
        where: {
          OR: [
            { phase_id: finalPhases[0].id, status: { in: ['SUBMITTED', 'UNDER_REVIEW', 'ESCALATED'] } },
            { series_id: { in: finalSeries.map((series: any) => series.id) }, status: { in: ['SUBMITTED', 'UNDER_REVIEW', 'ESCALATED'] } },
            { player_id: championPlayerId, status: { in: ['SUBMITTED', 'UNDER_REVIEW', 'ESCALATED'] } },
          ],
        },
        select: { id: true },
      });
      if (unresolvedDisputes.length > 0) {
        throw new BadRequestException('Resolve all disputes affecting the Final Phase or champion before completing the Season.');
      }

      const pendingPenalties = await tx.penalty.findMany({
        where: {
          OR: [
            { phase_id: finalPhases[0].id, effect_status: { notIn: ['APPLIED', 'EXPIRED', 'REVOKED'] }, status: { notIn: ['EXPIRED', 'REVOKED'] } },
            { season_id: seasonId, scope_type: 'SEASON', effect_status: { notIn: ['APPLIED', 'EXPIRED', 'REVOKED'] }, status: { notIn: ['EXPIRED', 'REVOKED'] } },
            { player_id: championPlayerId, effect_status: { notIn: ['APPLIED', 'EXPIRED', 'REVOKED'] }, status: { notIn: ['EXPIRED', 'REVOKED'] } },
          ],
        },
        select: { id: true },
      });
      if (pendingPenalties.length > 0) {
        throw new BadRequestException('Resolve all applicable penalties before completing the Season.');
      }

      const champion = await tx.playerProfile.findUnique({
        where: { id: championPlayerId },
        select: { id: true, gamer_tag: true },
      });
      const seasonCompletion = {
        championPlayerId,
        championGamerTag: champion?.gamer_tag ?? null,
        finalPhaseId: finalPhases[0].id,
        finalSeasonStatus: 'COMPLETED',
        completedAt: new Date().toISOString(),
      };
      const existingConfig = season.competition_config && typeof season.competition_config === 'object' && !Array.isArray(season.competition_config)
        ? season.competition_config as Record<string, unknown>
        : {};
      (metadata as Record<string, unknown> | undefined) ??= {};
      (metadata as Record<string, unknown>).seasonCompletion = seasonCompletion;
      (metadata as Record<string, unknown>).publicResult = {
        championPlayerId,
        championGamerTag: champion?.gamer_tag ?? null,
        status: 'COMPLETED',
        completedAt: seasonCompletion.completedAt,
      };
      const config = { ...existingConfig, seasonCompletion, publicResult: (metadata as Record<string, unknown>).publicResult };
      if (season.competition_config !== config) {
        metadata = { ...(metadata as Record<string, unknown>), config };
      }
    }

    const updateData: Prisma.SeasonUpdateInput = { status: newStatus as Prisma.SeasonUpdateInput['status'] };
    if (newStatus === 'COMPLETED') {
      updateData.competition_config = (metadata as Record<string, unknown>)?.config ?? metadata ?? undefined;
    }
    if (newStatus === 'REGISTRATION_OPEN') {
      updateData.registration_open_at = new Date();
      if (!season.registration_close_at && season.start_date) {
        const close = new Date(season.start_date);
        close.setDate(close.getDate() - 1);
        updateData.registration_close_at = close;
      }
    }
    if (newStatus === 'REGISTRATION_CLOSED') updateData.registration_close_at = new Date();

    const updated = await tx.season.update({ where: { id: seasonId }, data: updateData });

    await this.outbox.enqueueEvent(tx, {
      eventName: `season.${newStatus.toLowerCase()}`,
      aggregateType: 'Season',
      aggregateId: seasonId,
      actorId: actor?.id,
      actorRole: actor?.role,
      correlationId: actor?.correlationId,
      metadata: metadata ?? { before: season, after: updated },
    });
    if (newStatus === 'COMPLETED') {
      const completion = (metadata as Record<string, unknown> | undefined)?.seasonCompletion as
        { championGamerTag?: string | null } | undefined;
      const finalSeries = await tx.series.findMany({
        where: { phase: { season_id: seasonId, phase_type: 'FINAL' } },
        select: { id: true, participant_player_ids: true },
      });
      await createCompetitionNotifications(tx, {
        playerIds: finalSeries.flatMap((series) => asPlayerIds(series.participant_player_ids)),
        eventType: 'SEASON_COMPLETED',
        eventKey: `season-completed:${seasonId}`,
        title: 'Season completed',
        message: `${season.name} has completed${completion?.championGamerTag ? `; ${completion.championGamerTag} is the champion` : ''}.`,
        relatedEntity: `Season:${seasonId}`,
      });
    }

    try {
      await this.auditService.writeLog({
        entityType: 'Season',
        entityId: seasonId,
        action: `transition:${season.status}->${newStatus}`,
        actorId: actor?.id,
        actorRole: actor?.role,
        beforeState: season,
        afterState: updated,
        correlationId: actor?.correlationId,
        requestId: actor?.correlationId,
      });
    } catch {
      // Audit failure must not roll back the business transition.
    }

    return updated;
  }

  async publishSeason(seasonId: string, actor?: { id?: string; role?: string; correlationId?: string }) {
    return this.prisma.$transaction((tx) => this.changeStatus(tx, seasonId, 'REGISTRATION_OPEN', actor));
  }

  async closeRegistration(seasonId: string, actor?: { id?: string; role?: string; correlationId?: string }) {
    return this.prisma.$transaction((tx) => this.changeStatus(tx, seasonId, 'REGISTRATION_CLOSED', actor));
  }

  async lockRoster(seasonId: string, actor?: { id?: string; role?: string; correlationId?: string }) {
    return this.prisma.$transaction((tx) => this.changeStatus(tx, seasonId, 'ROSTER_LOCKED', actor));
  }

  async activateSeason(seasonId: string, actor?: { id?: string; role?: string; correlationId?: string }) {
    return this.prisma.$transaction(
      (tx) => this.changeStatus(tx, seasonId, 'ACTIVE', actor),
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  async startPlayoffs(seasonId: string, actor?: { id?: string; role?: string; correlationId?: string }) {
    return this.prisma.$transaction((tx) => this.changeStatus(tx, seasonId, 'PLAYOFFS', actor));
  }

  async completeSeason(seasonId: string, actor?: { id?: string; role?: string; correlationId?: string }) {
    return this.prisma.$transaction((tx) => this.changeStatus(tx, seasonId, 'COMPLETED', actor));
  }

  async archiveSeason(seasonId: string, actor?: { id?: string; role?: string; correlationId?: string }) {
    return this.prisma.$transaction((tx) => this.changeStatus(tx, seasonId, 'ARCHIVED', actor));
  }

  async createDivision(
    seasonId: string,
    data: {
      name: string;
      type?: string;
      format?: string;
      capacity?: number;
      registrationCapacity?: number;
      competitionParticipantCount?: number;
      schedulingPeriodDays?: number;
      matchesPerParticipant?: number;
      matchWindowStartMinutes?: number;
      matchWindowEndMinutes?: number;
      matchWindowTimezone?: string;
      concurrentMatches?: number;
      active?: boolean;
    },
    actor?: { id?: string; role?: string; correlationId?: string },
  ) {
    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const season = await tx.season.findUnique({ where: { id: seasonId } });
      if (!season) throw new NotFoundException('Season not found');
      if (!['DRAFT', 'REGISTRATION_OPEN'].includes(season.status)) {
        throw new BadRequestException('Divisions can only be changed before registration closes');
      }
      if (data.capacity !== undefined && data.capacity < 2) {
        throw new BadRequestException('Division capacity must be at least 2 when specified');
      }
      this.assertNoLegacyFixtureConfig(data, 'createDivision');
      this.validateSchedulingConfig(data);

      const division = await tx.division.create({
        data: {
          season_id: seasonId,
          name: data.name.trim(),
          type: (data.type as DivisionType | undefined) ?? DivisionType.AMATEUR,
          format:
            (data.format as CompetitionFormat | undefined) ??
            CompetitionFormat.ROUND_ROBIN_SINGLE,
          capacity: data.capacity ?? null,
          registration_capacity: data.registrationCapacity ?? null,
          competition_participant_count: data.competitionParticipantCount ?? null,
          scheduling_period_days: data.schedulingPeriodDays ?? 7,
          matches_per_participant: data.matchesPerParticipant ?? 1,
          match_window_start_minutes: data.matchWindowStartMinutes ?? null,
          match_window_end_minutes: data.matchWindowEndMinutes ?? null,
          match_window_timezone: data.matchWindowTimezone?.trim() || 'UTC',
          concurrent_matches: data.concurrentMatches ?? 1,
          active: data.active ?? true,
        },
      });


      await this.outbox.enqueueEvent(tx, {
        eventName: 'division.created',
        aggregateType: 'Division',
        aggregateId: division.id,
        actorId: actor?.id,
        actorRole: actor?.role,
        correlationId: actor?.correlationId,
        metadata: { division },
      });

      return division;
    });
  }

  async updateDivision(
    divisionId: string,
    data: {
      name?: string;
      capacity?: number | null;
      registrationCapacity?: number | null;
      competitionParticipantCount?: number | null;
      schedulingPeriodDays?: number;
      matchesPerParticipant?: number;
      matchWindowStartMinutes?: number | null;
      matchWindowEndMinutes?: number | null;
      matchWindowTimezone?: string;
      concurrentMatches?: number;
      active?: boolean;
      type?: string;
      format?: string;
    },
    actor?: { id?: string; role?: string; correlationId?: string },
  ) {
    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const before = await tx.division.findUnique({ where: { id: divisionId }, include: { season: true } });
      if (!before) throw new NotFoundException('Division not found');
      if (!['DRAFT', 'REGISTRATION_OPEN'].includes(before.season.status)) {
        throw new BadRequestException('Divisions can only be changed before registration closes');
      }
      if (data.format !== undefined && data.format !== before.format) {
        const fixtureCount = await tx.fixture.count({ where: { division_id: divisionId } });
        if (fixtureCount > 0) {
          throw new BadRequestException('Competition format cannot be changed after fixtures have been created');
        }
      }
      if (data.capacity !== undefined && data.capacity !== null && data.capacity < 2) {
        throw new BadRequestException('Division capacity must be at least 2 when specified');
      }
      this.assertNoLegacyFixtureConfig(data, 'updateDivision');
      this.validateSchedulingConfig(data, before);

      const updated = await tx.division.update({
        where: { id: divisionId },
        data: {
          name: data.name?.trim() ?? before.name,
          capacity: data.capacity === undefined ? before.capacity : data.capacity,
          registration_capacity: data.registrationCapacity === undefined ? before.registration_capacity : data.registrationCapacity,
          competition_participant_count: data.competitionParticipantCount === undefined ? before.competition_participant_count : data.competitionParticipantCount,
          scheduling_period_days: data.schedulingPeriodDays ?? before.scheduling_period_days,
          matches_per_participant: data.matchesPerParticipant ?? before.matches_per_participant,
          match_window_start_minutes: data.matchWindowStartMinutes === undefined ? before.match_window_start_minutes : data.matchWindowStartMinutes,
          match_window_end_minutes: data.matchWindowEndMinutes === undefined ? before.match_window_end_minutes : data.matchWindowEndMinutes,
          match_window_timezone: data.matchWindowTimezone?.trim() ?? before.match_window_timezone,
          concurrent_matches: data.concurrentMatches ?? before.concurrent_matches,
          active: data.active ?? before.active,
          type: (data.type as DivisionType | undefined) ?? before.type,
          format: (data.format as CompetitionFormat | undefined) ?? before.format,
        },
      });

      await this.outbox.enqueueEvent(tx, {
        eventName: 'division.updated',
        aggregateType: 'Division',
        aggregateId: divisionId,
        actorId: actor?.id,
        actorRole: actor?.role,
        correlationId: actor?.correlationId,
        metadata: { before, after: updated },
      });

      return updated;
    });
  }

  async deactivateDivision(divisionId: string, actor?: { id?: string; role?: string; correlationId?: string }) {
    return this.updateDivision(divisionId, { active: false }, actor);
  }

  private assertNoLegacyFixtureConfig(
    data: {
      schedulingPeriodDays?: number;
      matchesPerParticipant?: number;
      matchWindowStartMinutes?: number | null;
      matchWindowEndMinutes?: number | null;
      matchWindowTimezone?: string;
      concurrentMatches?: number;
    },
    operation: string,
  ) {
    const legacyKeys: string[] = [];
    if (data.schedulingPeriodDays !== undefined) legacyKeys.push('schedulingPeriodDays');
    if (data.matchesPerParticipant !== undefined) legacyKeys.push('matchesPerParticipant');
    if (data.concurrentMatches !== undefined) legacyKeys.push('concurrentMatches');
    if (data.matchWindowStartMinutes !== undefined) legacyKeys.push('matchWindowStartMinutes');
    if (data.matchWindowEndMinutes !== undefined) legacyKeys.push('matchWindowEndMinutes');
    if (data.matchWindowTimezone !== undefined) legacyKeys.push('matchWindowTimezone');
    if (legacyKeys.length > 0) {
      throw new BadRequestException(
        `legacy Fixture density configuration is retired for ${operation}. Use canonical Phase/Plot/Series/Game rulesets and scheduling only.`,
      );
    }
  }

  private validateSchedulingConfig(
    data: {
      capacity?: number | null;
      registrationCapacity?: number | null;
      competitionParticipantCount?: number | null;
      matchWindowStartMinutes?: number | null;
      matchWindowEndMinutes?: number | null;
    },
    existing?: {
      capacity: number | null;
      registration_capacity: number | null;
      competition_participant_count: number | null;
      match_window_start_minutes: number | null;
      match_window_end_minutes: number | null;
    },
  ) {
    const capacity = data.capacity === undefined ? existing?.capacity : data.capacity;
    const registrationCapacity = data.registrationCapacity === undefined ? existing?.registration_capacity : data.registrationCapacity;
    const competitionParticipantCount = data.competitionParticipantCount === undefined ? existing?.competition_participant_count : data.competitionParticipantCount;
    const windowStart = data.matchWindowStartMinutes === undefined ? existing?.match_window_start_minutes : data.matchWindowStartMinutes;
    const windowEnd = data.matchWindowEndMinutes === undefined ? existing?.match_window_end_minutes : data.matchWindowEndMinutes;

    if (capacity !== null && capacity !== undefined && capacity < 2) throw new BadRequestException('Division capacity must be at least 2');
    if (registrationCapacity !== null && registrationCapacity !== undefined && registrationCapacity < 2) throw new BadRequestException('Registration capacity must be at least 2');
    if (competitionParticipantCount !== null && competitionParticipantCount !== undefined && competitionParticipantCount < 2) throw new BadRequestException('Competition participant count must be at least 2');
    if (capacity !== null && capacity !== undefined && competitionParticipantCount !== null && competitionParticipantCount !== undefined && competitionParticipantCount > capacity) throw new BadRequestException('Competition participant count cannot exceed division capacity');
    if (registrationCapacity !== null && registrationCapacity !== undefined && capacity !== null && capacity !== undefined && registrationCapacity < capacity) throw new BadRequestException('Registration capacity cannot be lower than division capacity');
    if (windowStart !== null && windowStart !== undefined && (windowStart < 0 || windowStart >= 1440)) throw new BadRequestException('Match window start must be between 00:00 and 23:59');
    if (windowEnd !== null && windowEnd !== undefined && (windowEnd < 1 || windowEnd > 1440)) throw new BadRequestException('Match window end must be between 00:01 and 24:00');
    if (windowStart !== null && windowStart !== undefined && windowEnd !== null && windowEnd !== undefined && windowEnd <= windowStart) throw new BadRequestException('Match window end must be after its start');
  }
}
