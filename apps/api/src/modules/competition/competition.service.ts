import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { createHash, randomUUID } from 'node:crypto';
import { PermissionName } from '../../common/authz/authz.types.js';
import { AuditService } from '../audit/audit.service.js';
import { createCompetitionNotifications } from '../notification/notification.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  buildPlayerFacingRules,
  DEFAULT_COMPETITION_RULES,
  adjustSeriesAppointment,
  assertCheckInAllowed,
  assertGameInActiveSeriesWindow,
  assertSeriesCanStart,
  assertSeriesResultSubmissionAllowed,
  assertSeriesScheduleCanLock,
  calculateSeasonCapacity,
  assessPhaseCompletion,
  calculatePhaseProgression,
  buildPhaseSequence,
  deriveSeriesOperationalState,
  planPhaseTransition,
  recordGameResult,
  resolveSeriesAdvancement,
  resolveSeriesResult,
  scheduleSeriesAutomatically,
  validateCompetitionRules,
  validateFinalPhaseWindow,
  validateSeriesSchedule,
  type SeriesGameResultInput,
  type SeriesScheduledWindow,
  type SeriesScheduleValidationInput,
} from './competition.domain.js';

const workspaceInclude = {
  league: { select: { name: true } },
  ruleset: { select: { rules: true } },
  phases: {
    orderBy: { phase_number: 'asc' as const },
    include: {
      plots: {
        orderBy: { created_at: 'asc' as const },
        include: {
          series: {
            orderBy: { series_number: 'asc' as const },
            include: {
              games: { orderBy: { game_number: 'asc' as const } },
              check_ins: { orderBy: { checked_in_at: 'asc' as const } },
            },
          },
        },
      },
    },
  },
} satisfies Prisma.SeasonInclude;

type CompetitionSeason = Prisma.SeasonGetPayload<{ include: typeof workspaceInclude }>;
type AuditActor = { id?: string; role?: string; requestId?: string; permissions?: PermissionName[] };
type RulesetActor = { id?: string; role?: string; requestId?: string };

function sortJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortJson);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, nested]) => [key, sortJson(nested)]));
  }
  return value;
}

function hashRules(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(sortJson(value))).digest('hex');
}

function jsonStringArray(value: Prisma.JsonValue | null | undefined): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string');
}

function getParticipants(series: {
  participant_player_ids: Prisma.JsonValue;
  games: Array<{ game_number: number; home_player_id: string | null; away_player_id: string | null }>;
}): string[] {
  const saved = jsonStringArray(series.participant_player_ids);
  if (saved.length === 2) return saved;
  const firstGame = [...series.games].sort((left, right) => left.game_number - right.game_number)[0];
  return [firstGame?.home_player_id, firstGame?.away_player_id]
    .filter((playerId): playerId is string => Boolean(playerId));
}

function getCurrentResultVerification<T extends { id?: string; result_version: number; status: string; reason?: string | null }>(
  game: { id?: string; result_version: number; result: string | null; status: string; result_verifications: T[] },
): T | undefined {
  const currentVersionEvents = game.result_verifications.filter((entry) => entry.result_version === game.result_version);
  const resolved = currentVersionEvents.find((entry) => entry.status !== 'PENDING');
  if (resolved) return resolved;
  if (currentVersionEvents.length === 0 && game.status === 'COMPLETED' && game.result !== null) {
    return { id: game.id ?? 'implicit-result-verification', result_version: game.result_version, status: 'APPROVED', reason: null } as T;
  }
  return currentVersionEvents[0];
}

function getSeriesAppointment(
  series: {
    id: string;
    phase_id: string;
    schedule_key: string | null;
    check_in_opens_at: Date | null;
    check_in_closes_at: Date | null;
    match_window_start: Date | null;
    match_window_end: Date | null;
    results_deadline_at: Date | null;
    match_window_timezone: string | null;
    games: Array<{ game_number: number }>;
    season: { competition_timezone: string };
  },
  playerIds: string[],
): SeriesScheduledWindow {
  if (!series.check_in_opens_at || !series.check_in_closes_at || !series.match_window_start
    || !series.match_window_end || !series.results_deadline_at) {
    throw new BadRequestException('The Series must have a complete schedule before Games can be managed.');
  }
  return {
    seriesId: series.id,
    phaseId: series.phase_id,
    playerIds,
    checkInOpensAt: series.check_in_opens_at,
    checkInClosesAt: series.check_in_closes_at,
    matchWindowStartAt: series.match_window_start,
    matchWindowEndAt: series.match_window_end,
    resultsDeadlineAt: series.results_deadline_at,
    timezone: series.match_window_timezone ?? series.season.competition_timezone,
    gameNumbers: [1, 2, 3],
  };
}

function assertGameParticipants(game: { home_player_id: string | null; away_player_id: string | null }, playerIds: string[]) {
  if (playerIds.length !== 2 || !game.home_player_id || !game.away_player_id
    || game.home_player_id === game.away_player_id
    || !((game.home_player_id === playerIds[0] && game.away_player_id === playerIds[1])
      || (game.home_player_id === playerIds[1] && game.away_player_id === playerIds[0]))) {
    throw new BadRequestException('Game participants do not match the Series participants.');
  }
}

function getSeriesRows(season: CompetitionSeason) {
  return season.phases.flatMap((phase) => phase.plots.flatMap((plot) => plot.series.map((series) => ({
    series,
    phase,
    plot,
    playerIds: getParticipants(series),
  }))));
}

function getValidationInput(season: CompetitionSeason): SeriesScheduleValidationInput {
  const rows = getSeriesRows(season);
  return {
    automatic: false,
    competitionTimezone: season.competition_timezone,
    seasonStartAt: season.start_date ?? new Date(0),
    seasonEndAt: season.end_date ?? new Date(0),
    phases: season.phases.map((phase) => ({
      id: phase.id,
      startAt: phase.start_at ?? new Date(0),
      endAt: phase.end_at ?? new Date(0),
    })),
    series: rows.map(({ series, phase, playerIds }) => ({ id: series.id, phaseId: phase.id, playerIds })),
    appointments: rows.map(({ series, phase, playerIds }) => ({
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
      gameNumbers: series.games.map((game) => game.game_number),
    })),
  };
}

@Injectable()
export class CompetitionService {
  constructor(private readonly prisma: PrismaService, private readonly auditService: AuditService) {}

  getDefaultRulesetTemplate() {
    return validateCompetitionRules(DEFAULT_COMPETITION_RULES);
  }

  async listRulesets(publishedOnly = false) {
    return this.prisma.competitionRuleset.findMany({
      where: publishedOnly ? { status: 'PUBLISHED' } : undefined,
      select: {
        id: true, name: true, version: true, description: true, status: true, rules_hash: true,
        published_at: true, supersedes_ruleset_id: true, created_at: true,
      },
      orderBy: [{ name: 'asc' }, { created_at: 'desc' }],
    });
  }

  async createRuleset(input: {
    name: string;
    version: string;
    description?: string;
    rules: Record<string, unknown>;
    supersedesRulesetId?: string;
  }, actor: RulesetActor) {
    const name = input.name.trim();
    const version = input.version.trim();
    if (!name || !version) throw new BadRequestException('Ruleset name and version are required.');
    const rules = validateCompetitionRules(input.rules);

    return this.prisma.$transaction(async (tx) => {
      if (input.supersedesRulesetId) {
        const previous = await tx.competitionRuleset.findUnique({ where: { id: input.supersedesRulesetId } });
        if (!previous || previous.status !== 'PUBLISHED' || previous.name !== name) {
          throw new BadRequestException('A new ruleset version must supersede a published version with the same name.');
        }
      }
      const ruleset = await tx.competitionRuleset.create({
        data: {
          name,
          version,
          description: input.description?.trim() || null,
          status: 'DRAFT',
          rules: rules as Prisma.InputJsonValue,
          supersedes_ruleset_id: input.supersedesRulesetId,
        },
      });
      await tx.auditLog.create({
        data: {
          entity_type: 'CompetitionRuleset', entity_id: ruleset.id, action: 'RULESET_DRAFT_CREATED',
          actor_id: actor.id, actor_role: actor.role, request_id: actor.requestId,
          after_state: { name, version, rules: rules as unknown as Prisma.InputJsonValue },
        },
      });
      return ruleset;
    });
  }

  async updateDraftRuleset(rulesetId: string, input: { name?: string; description?: string; rules?: Record<string, unknown> }, actor: RulesetActor) {
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.competitionRuleset.findUnique({ where: { id: rulesetId } });
      if (!existing) throw new NotFoundException('Ruleset not found.');
      if (existing.status !== 'DRAFT') throw new BadRequestException('Published rulesets are immutable; create a new version.');
      const nextRules = input.rules === undefined
        ? validateCompetitionRules(existing.rules)
        : validateCompetitionRules(input.rules);
      const updated = await tx.competitionRuleset.update({
        where: { id: rulesetId },
        data: {
          name: input.name === undefined ? undefined : input.name.trim(),
          description: input.description === undefined ? undefined : input.description.trim() || null,
          rules: nextRules as Prisma.InputJsonValue,
        },
      });
      await tx.auditLog.create({
        data: {
          entity_type: 'CompetitionRuleset', entity_id: rulesetId, action: 'RULESET_DRAFT_UPDATED',
          actor_id: actor.id, actor_role: actor.role, request_id: actor.requestId,
          before_state: { name: existing.name, description: existing.description, rules: existing.rules },
          after_state: { name: updated.name, description: updated.description, rules: nextRules as unknown as Prisma.InputJsonValue },
        },
      });
      return updated;
    });
  }

  async previewRuleset(rulesetId: string) {
    const ruleset = await this.prisma.competitionRuleset.findUnique({ where: { id: rulesetId } });
    if (!ruleset) throw new NotFoundException('Ruleset not found.');
    const rules = validateCompetitionRules(ruleset.rules);
    return {
      id: ruleset.id,
      status: ruleset.status,
      rules,
      rulesHash: hashRules(rules),
      playerFacing: buildPlayerFacingRules(rules, { name: ruleset.name, version: ruleset.version }),
    };
  }

  async publishRuleset(rulesetId: string, actor: RulesetActor) {
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.competitionRuleset.findUnique({ where: { id: rulesetId } });
      if (!existing) throw new NotFoundException('Ruleset not found.');
      if (existing.status !== 'DRAFT') throw new BadRequestException('Ruleset is already published and immutable.');
      const rules = validateCompetitionRules(existing.rules);
      const publishedAt = new Date();
      const rulesHash = hashRules(rules);
      const published = await tx.competitionRuleset.update({
        where: { id: rulesetId },
        data: {
          rules: rules as Prisma.InputJsonValue,
          rules_hash: rulesHash,
          status: 'PUBLISHED',
          published_at: publishedAt,
          published_by_id: actor.id,
        },
      });
      await tx.auditLog.create({
        data: {
          entity_type: 'CompetitionRuleset', entity_id: rulesetId, action: 'RULESET_PUBLISHED',
          actor_id: actor.id, actor_role: actor.role, request_id: actor.requestId,
          before_state: { status: existing.status },
          after_state: { name: published.name, version: published.version, status: published.status, rulesHash },
        },
      });
      return published;
    });
  }

  async getSeasonRules(seasonId: string) {
    const season = await this.prisma.season.findUnique({
      where: { id: seasonId },
      include: { ruleset: true },
    });
    if (!season) throw new NotFoundException('Season not found.');
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

  async getWorkspace(seasonId: string, canManageCompetitionExceptions = false) {
    const season = await this.prisma.season.findUnique({ where: { id: seasonId }, include: workspaceInclude });
    if (!season) throw new NotFoundException('Season not found');
    const rows = getSeriesRows(season);
    const serverTime = new Date();
    const playerIds = Array.from(new Set(rows.flatMap((row) => row.playerIds)));
    const profiles = playerIds.length > 0
      ? await this.prisma.playerProfile.findMany({ where: { id: { in: playerIds } }, select: { id: true, gamer_tag: true } })
      : [];
    const gamerTags = new Map(profiles.map((profile) => [profile.id, profile.gamer_tag]));
    const attendancePolicy = validateCompetitionRules(season.ruleset?.rules ?? DEFAULT_COMPETITION_RULES).checkIn.attendancePolicy as string;
    const validation = validateSeriesSchedule(getValidationInput(season));
    const currentPhase = season.phases.find((phase) => phase.status === 'ACTIVE')
      ?? [...season.phases].reverse().find((phase) => phase.status !== 'COMPLETED');
    const workloadPhases = season.phases.filter((phase) => phase.phase_number >= (currentPhase?.phase_number ?? 1));
    const capacity = season.start_date && season.end_date && workloadPhases.length > 0
      ? calculateSeasonCapacity({
          seasonStartAt: season.start_date,
          seasonEndAt: season.end_date,
          currentDate: new Date(),
          competitionTimezone: season.competition_timezone,
          currentPhaseNumber: workloadPhases[0].phase_number - 1,
          remainingPhases: workloadPhases.map((phase) => {
            const phaseRows = rows.filter((row) => row.phase.id === phase.id);
            return {
              phaseNumber: phase.phase_number,
              seriesCount: phaseRows.length,
              participantIdsBySeries: phaseRows.map((row) => row.playerIds),
            };
          }),
        })
      : null;

    return {
      season: {
        id: season.id,
        name: season.name,
        leagueName: season.league.name,
        status: season.status,
        startAt: season.start_date?.toISOString() ?? null,
        endAt: season.end_date?.toISOString() ?? null,
        timezone: season.competition_timezone,
      },
      serverTime: serverTime.toISOString(),
      currentPhaseId: currentPhase?.id ?? null,
      summary: {
        phaseCount: season.phases.length,
        plotCount: season.phases.reduce((sum, phase) => sum + phase.plots.length, 0),
        participantCount: new Set(rows.flatMap((row) => row.playerIds)).size,
        seriesCount: rows.length,
        completedSeriesCount: rows.filter(({ series }) => ['COMPLETED', 'ELIMINATED'].includes(series.status)).length,
        pendingSeriesCount: rows.filter(({ series }) => !['COMPLETED', 'ELIMINATED'].includes(series.status)).length,
        unresolvedSeriesCount: rows.filter(({ series }) => ['IN_PROGRESS', 'DISPUTED'].includes(series.status)).length,
        completedGameCount: rows.flatMap(({ series }) => series.games).filter((game) => game.status === 'COMPLETED').length,
        gameCount: rows.flatMap(({ series }) => series.games).length,
        conflictCount: validation.errors.filter((error) => error.code === 'OVERLAPPING_SERIES' || error.code === 'PARTICIPANT_DOUBLE_BOOKING').length,
      },
      validation,
      capacity,
      phases: season.phases.map((phase) => {
        const phaseSeries = phase.plots.flatMap((plot) => plot.series);
        const participantIds = jsonStringArray(phase.participating_player_ids).length > 0
          ? jsonStringArray(phase.participating_player_ids)
          : phase.plots.flatMap((plot) => jsonStringArray(plot.player_ids));
        const progression = calculatePhaseProgression({
          phaseStatus: phase.status,
          participantIds,
          plots: phase.plots.map((plot, plotIndex) => ({
            id: plot.id,
            name: plot.name ?? `Plot ${plotIndex + 1}`,
            playerIds: jsonStringArray(plot.player_ids),
          })),
          series: phaseSeries.map((series) => ({
            id: series.id,
            status: series.status,
            playerIds: getParticipants(series),
            winnerPlayerId: series.winner_player_id,
            eliminatedPlayerIds: jsonStringArray(series.eliminated_player_ids),
            games: series.games.map((game) => ({ status: game.status, result: game.result })),
          })),
        });
        const phaseValidationErrors = validation.errors.filter((error) =>
          phaseSeries.some((series) => series.id === error.seriesId));
        const scheduledCount = phaseSeries.filter((series) => series.match_window_start !== null).length;
        return {
          id: phase.id,
          number: phase.phase_number,
          type: phase.phase_type,
          name: phase.name ?? `Phase ${phase.phase_number}`,
          status: phase.status,
          startAt: phase.start_at?.toISOString() ?? null,
          endAt: phase.end_at?.toISOString() ?? null,
          scheduleLocked: phase.schedule_locked,
          participantCount: new Set(participantIds).size,
          progression: {
            ...progression,
            participants: progression.participants.map((participant) => ({
              ...participant,
              gamerTag: gamerTags.get(participant.playerId) ?? `Player ${participant.playerId.slice(0, 8)}`,
              plotNames: participant.plotIds.map((plotId) => phase.plots.find((plot) => plot.id === plotId)?.name ?? 'Plot'),
            })),
          },
          plotCount: phase.plots.length,
          seriesCount: phaseSeries.length,
          completedSeriesCount: phaseSeries.filter((series) => ['COMPLETED', 'ELIMINATED'].includes(series.status)).length,
          pendingSeriesCount: phaseSeries.filter((series) => !['COMPLETED', 'ELIMINATED'].includes(series.status)).length,
          completedGameCount: phaseSeries.flatMap((series) => series.games).filter((game) => game.status === 'COMPLETED').length,
          gameCount: phaseSeries.flatMap((series) => series.games).length,
          advancementStatus: progression.phaseFinalized ? 'FINALIZED' : 'PENDING',
          scheduleStatus: phase.schedule_locked
            ? 'LOCKED'
            : phaseValidationErrors.length > 0
              ? 'BLOCKED'
              : scheduledCount === phaseSeries.length && phaseSeries.length > 0
                ? 'SCHEDULED'
                : 'NOT_SCHEDULED',
          conflicts: phaseValidationErrors.filter((error) => error.code.includes('OVERLAP') || error.code.includes('DOUBLE_BOOKING')).length,
          validation: { valid: phaseValidationErrors.length === 0, blockers: phaseValidationErrors },
          plots: phase.plots.map((plot, plotIndex) => ({
            id: plot.id,
            name: plot.name ?? `Plot ${plotIndex + 1}`,
            participantIds: jsonStringArray(plot.player_ids),
            participantCount: jsonStringArray(plot.player_ids).length,
            series: plot.series.map((series) => {
              const seriesPlayerIds = getParticipants(series);
              const checkInByPlayerId = new Map(series.check_ins.map((checkIn) => [checkIn.player_id, checkIn]));
              const checkedInPlayerIds = seriesPlayerIds.filter((playerId) => checkInByPlayerId.has(playerId));
              let operationalState: ReturnType<typeof deriveSeriesOperationalState> | null = null;
              if (series.match_window_start && series.match_window_end
                && series.check_in_opens_at && series.check_in_closes_at && series.results_deadline_at) {
                try {
                  operationalState = deriveSeriesOperationalState({
                    seriesId: series.id,
                    phaseId: phase.id,
                    playerIds: seriesPlayerIds,
                    checkInOpensAt: series.check_in_opens_at,
                    checkInClosesAt: series.check_in_closes_at,
                    matchWindowStartAt: series.match_window_start,
                    matchWindowEndAt: series.match_window_end,
                    resultsDeadlineAt: series.results_deadline_at,
                    timezone: series.match_window_timezone ?? season.competition_timezone,
                    gameNumbers: [1, 2, 3],
                  }, serverTime);
                } catch {
                  operationalState = null;
                }
              }
              let canStart = false;
              if (series.match_window_start && series.match_window_end) {
                try {
                  assertSeriesCanStart({
                    status: series.status,
                    attendancePolicy,
                    participantIds: seriesPlayerIds,
                    checkedInPlayerIds,
                    matchWindowStartAt: series.match_window_start,
                    matchWindowEndAt: series.match_window_end,
                    serverTime,
                  });
                  canStart = true;
                } catch {
                  canStart = false;
                }
              }
              return {
                id: series.id,
                number: series.series_number,
                status: series.status,
                playerIds: seriesPlayerIds,
                checkIn: {
                  state: operationalState?.checkIn ?? 'NOT_SCHEDULED',
                  opensAt: series.check_in_opens_at?.toISOString() ?? null,
                  closesAt: series.check_in_closes_at?.toISOString() ?? null,
                  canManageExceptions: canManageCompetitionExceptions,
                  exceptionAllowed: canManageCompetitionExceptions
                    && series.status === 'SCHEDULED'
                    && series.match_window_end !== null
                    && serverTime < series.match_window_end,
                  attendancePolicy,
                  checkedInCount: checkedInPlayerIds.length,
                  participants: seriesPlayerIds.map((playerId) => {
                    const checkIn = checkInByPlayerId.get(playerId);
                    return {
                      playerId,
                      gamerTag: gamerTags.get(playerId) ?? `Player ${playerId.slice(0, 8)}`,
                      status: checkIn ? 'CHECKED_IN' : 'NOT_CHECKED_IN',
                      checkedInAt: checkIn?.checked_in_at.toISOString() ?? null,
                      isException: checkIn?.is_exception ?? false,
                      exceptionReason: checkIn?.exception_reason ?? null,
                    };
                  }),
                },
                execution: {
                  status: series.status === 'IN_PROGRESS' ? 'IN_PROGRESS' : canStart ? 'READY' : 'NOT_READY',
                  canStart,
                },
                matchWindowStartAt: series.match_window_start?.toISOString() ?? null,
                matchWindowEndAt: series.match_window_end?.toISOString() ?? null,
                checkInOpensAt: series.check_in_opens_at?.toISOString() ?? null,
                checkInClosesAt: series.check_in_closes_at?.toISOString() ?? null,
                resultsDeadlineAt: series.results_deadline_at?.toISOString() ?? null,
                timezone: series.match_window_timezone,
                winnerPlayerId: series.winner_player_id,
                eliminationOutcome: series.elimination_outcome,
                games: series.games.map((game) => ({
                  id: game.id,
                  number: game.game_number,
                  status: game.status,
                  result: game.result,
                  winnerPlayerId: game.winner_player_id,
                })),
              };
            }),
          })),
        };
      }),
    };
  }

  async getSeriesExecutionWorkspace(seriesId: string, canOverrideCompetitionResults = false) {
    const series = await this.prisma.series.findUnique({
      where: { id: seriesId },
      include: {
        season: { select: { id: true, name: true, competition_timezone: true } },
        phase: { select: { id: true, phase_number: true, name: true, status: true, schedule_locked: true } },
        plot: { select: { id: true, name: true } },
        games: {
          orderBy: { game_number: 'asc' },
          include: { result_verifications: { orderBy: [{ created_at: 'desc' }, { id: 'desc' }] } },
        },
        check_ins: { orderBy: { checked_in_at: 'asc' } },
      },
    });
    if (!series) throw new NotFoundException('Series not found.');

    const serverTime = new Date();
    const participantIds = getParticipants(series);
    const allPlayerIds = Array.from(new Set([
      ...participantIds,
      ...series.games.flatMap((game) => [game.home_player_id, game.away_player_id])
        .filter((playerId): playerId is string => Boolean(playerId)),
    ]));
    const profiles = allPlayerIds.length > 0
      ? await this.prisma.playerProfile.findMany({ where: { id: { in: allPlayerIds } }, select: { id: true, gamer_tag: true } })
      : [];
    const gamerTags = new Map(profiles.map((profile) => [profile.id, profile.gamer_tag]));
    const checkedInIds = new Set(series.check_ins.map((checkIn) => checkIn.player_id));
    const checkedInPlayerIds = participantIds.filter((playerId) => checkedInIds.has(playerId));
    const appointment = getSeriesAppointment(series, participantIds);
    let operationalState: ReturnType<typeof deriveSeriesOperationalState> | null = null;
    try {
      operationalState = deriveSeriesOperationalState(appointment, serverTime);
    } catch {
      operationalState = null;
    }
    const gameResults: SeriesGameResultInput[] = series.games.map((game) => ({
      gameNumber: game.game_number,
      homePlayerId: game.home_player_id ?? '',
      awayPlayerId: game.away_player_id ?? '',
      status: game.status,
      result: game.result,
      winnerPlayerId: game.winner_player_id,
    }));
    let resultSummary: ReturnType<typeof resolveSeriesResult> | null = null;
    if (series.games.length === 3) {
      try {
        resultSummary = resolveSeriesResult(gameResults);
      } catch {
        resultSummary = null;
      }
    }

    const activeGame = series.games.find((game) => game.status === 'IN_PROGRESS') ?? null;
    const matchWindowActive = operationalState?.matchWindow === 'ACTIVE';
    const bothParticipantsCheckedIn = participantIds.length === 2
      && participantIds.every((playerId) => checkedInIds.has(playerId));
    const seriesGamesComplete = series.games.length === 3
      && series.games.every((game) => game.status === 'COMPLETED' && game.result !== null);
    const seriesGamesVerified = series.games.length === 3 && series.games.every((game) => {
      const verification = game.result_verifications.find((entry) => entry.result_version === game.result_version);
      return verification?.status === 'APPROVED' || verification?.status === 'OVERRIDDEN';
    });

    return {
      serverTime: serverTime.toISOString(),
      season: { id: series.season.id, name: series.season.name },
      phase: {
        id: series.phase.id,
        number: series.phase.phase_number,
        name: series.phase.name ?? `Phase ${series.phase.phase_number}`,
        status: series.phase.status,
        scheduleLocked: series.phase.schedule_locked,
      },
      plot: { id: series.plot.id, name: series.plot.name ?? 'Plot' },
      series: {
        id: series.id,
        number: series.series_number,
        status: series.status,
        resultState: series.status === 'COMPLETED'
          ? 'RESOLVED'
          : series.status === 'ELIMINATED'
            ? 'ELIMINATED'
            : seriesGamesComplete && !seriesGamesVerified
              ? 'AWAITING_VERIFICATION'
            : resultSummary?.resolutionState ?? 'INCOMPLETE',
        winnerPlayerId: series.winner_player_id,
        winnerGamerTag: series.winner_player_id ? gamerTags.get(series.winner_player_id) ?? null : null,
        canComplete: series.status === 'IN_PROGRESS' && seriesGamesComplete && seriesGamesVerified,
      },
      participants: participantIds.map((playerId) => ({
        id: playerId,
        gamerTag: gamerTags.get(playerId) ?? `Player ${playerId.slice(0, 8)}`,
        checkedIn: checkedInIds.has(playerId),
      })),
      matchWindow: {
        startsAt: series.match_window_start?.toISOString() ?? null,
        endsAt: series.match_window_end?.toISOString() ?? null,
        timezone: series.match_window_timezone ?? series.season.competition_timezone,
        state: operationalState?.matchWindow ?? 'NOT_SCHEDULED',
        remainingMs: series.match_window_end && operationalState?.matchWindow !== 'UPCOMING'
          ? Math.max(0, series.match_window_end.getTime() - serverTime.getTime())
          : null,
        resultSubmissionState: operationalState?.results ?? 'NOT_SCHEDULED',
      },
      checkIn: {
        state: operationalState?.checkIn ?? 'NOT_SCHEDULED',
        opensAt: series.check_in_opens_at?.toISOString() ?? null,
        closesAt: series.check_in_closes_at?.toISOString() ?? null,
        checkedInCount: checkedInPlayerIds.length,
        requiredCount: 2,
      },
      currentScore: activeGame
        ? { gameNumber: activeGame.game_number, home: activeGame.home_score ?? 0, away: activeGame.away_score ?? 0 }
        : null,
      seriesScore: resultSummary
        ? { homeWins: resultSummary.homeWins, awayWins: resultSummary.awayWins, draws: resultSummary.draws }
        : null,
      games: series.games.map((game, index) => {
        const verification = getCurrentResultVerification(game);
        const verificationStatus = verification?.status ?? (game.result === null ? 'NONE' : 'PENDING');
        const gameParticipantsValid = participantIds.length === 2
          && Boolean(game.home_player_id && game.away_player_id)
          && ((game.home_player_id === participantIds[0] && game.away_player_id === participantIds[1])
            || (game.home_player_id === participantIds[1] && game.away_player_id === participantIds[0]));
        const priorGamesComplete = series.games.slice(0, index)
          .every((prior) => prior.status === 'COMPLETED' && prior.result !== null);
        return {
          id: game.id,
          number: game.game_number,
          status: game.status,
          homePlayerId: game.home_player_id,
          homeGamerTag: game.home_player_id ? gamerTags.get(game.home_player_id) ?? null : null,
          awayPlayerId: game.away_player_id,
          awayGamerTag: game.away_player_id ? gamerTags.get(game.away_player_id) ?? null : null,
          homeScore: game.home_score ?? 0,
          awayScore: game.away_score ?? 0,
          result: game.result,
          verificationStatus,
          verificationReason: verification?.reason ?? null,
          winnerPlayerId: game.winner_player_id,
          startedAt: game.started_at?.toISOString() ?? null,
          completedAt: game.completed_at?.toISOString() ?? null,
          canStart: series.status === 'IN_PROGRESS' && game.status === 'PENDING'
            && activeGame === null && priorGamesComplete && gameParticipantsValid
            && series.phase.schedule_locked && bothParticipantsCheckedIn && matchWindowActive,
          canUpdateScore: series.status === 'IN_PROGRESS' && game.status === 'IN_PROGRESS'
            && activeGame?.id === game.id && matchWindowActive,
          canRecordResult: series.status === 'IN_PROGRESS' && game.status === 'IN_PROGRESS'
            && activeGame?.id === game.id && operationalState?.results === 'OPEN',
          canVerifyResult: series.status === 'IN_PROGRESS' && game.status === 'COMPLETED'
            && verificationStatus === 'PENDING',
          canOverrideResult: canOverrideCompetitionResults
            && series.status === 'IN_PROGRESS' && game.status === 'COMPLETED' && game.result !== null,
        };
      }),
    };
  }

  async startGame(seriesId: string, gameId: string, actor: AuditActor) {
    const serverTime = new Date();
    return this.prisma.$transaction(async (tx) => {
      const series = await tx.series.findUnique({
        where: { id: seriesId },
        include: {
          season: { select: { competition_timezone: true } },
          phase: { select: { schedule_locked: true } },
          games: { orderBy: { game_number: 'asc' } },
          check_ins: true,
        },
      });
      if (!series) throw new NotFoundException('Series not found.');
      if (series.status !== 'IN_PROGRESS') throw new BadRequestException('The Series must be started before a Game can begin.');
      if (!series.phase.schedule_locked) throw new BadRequestException('The Phase schedule must be locked before Game execution.');
      const playerIds = getParticipants(series);
      if (playerIds.length !== 2 || playerIds.some((playerId) => !series.check_ins.some((checkIn) => checkIn.player_id === playerId))) {
        throw new BadRequestException('Both Series participants must be checked in before Game execution.');
      }
      const gameIndex = series.games.findIndex((game) => game.id === gameId);
      if (gameIndex < 0) throw new NotFoundException('Game not found in this Series.');
      const game = series.games[gameIndex];
      if (game.status !== 'PENDING') throw new BadRequestException('Only a pending Game can be started.');
      if (series.games.some((entry) => entry.status === 'IN_PROGRESS')) {
        throw new BadRequestException('Only one Game may be in progress within a Series.');
      }
      if (series.games.slice(0, gameIndex).some((entry) => entry.status !== 'COMPLETED' || entry.result === null)) {
        throw new BadRequestException('Games must be played in order; resolve each earlier Game first.');
      }
      assertGameParticipants(game, playerIds);
      try {
        assertGameInActiveSeriesWindow({
          appointment: getSeriesAppointment(series, playerIds),
          activeSeriesId: seriesId,
          game: { id: game.id, seriesId, gameNumber: game.game_number },
          serverTime,
        });
      } catch (error) {
        throw new BadRequestException(error instanceof Error ? error.message : 'The Game cannot start now.');
      }

      const transition = await tx.game.updateMany({
        where: { id: gameId, series_id: seriesId, status: 'PENDING' },
        data: { status: 'IN_PROGRESS', started_at: serverTime },
      });
      if (transition.count !== 1) throw new BadRequestException('The Game was started by another operator. Refresh the Series workspace.');
      await tx.auditLog.create({
        data: {
          entity_type: 'Game',
          entity_id: gameId,
          action: 'GAME_STARTED',
          actor_id: actor.id,
          actor_role: actor.role,
          request_id: actor.requestId,
          after_state: { seriesId, gameNumber: game.game_number, status: 'IN_PROGRESS', startedAt: serverTime.toISOString() },
        },
      });
      return { id: gameId, seriesId, gameNumber: game.game_number, status: 'IN_PROGRESS' as const, startedAt: serverTime.toISOString() };
    });
  }

  async updateGameScore(seriesId: string, gameId: string, input: { homeScore: number; awayScore: number }, actor: AuditActor) {
    const serverTime = new Date();
    if (!Number.isInteger(input.homeScore) || input.homeScore < 0 || !Number.isInteger(input.awayScore) || input.awayScore < 0) {
      throw new BadRequestException('Game scores must be non-negative integers.');
    }
    return this.prisma.$transaction(async (tx) => {
      const series = await tx.series.findUnique({
        where: { id: seriesId },
        include: {
          season: { select: { competition_timezone: true } },
          phase: { select: { schedule_locked: true } },
          games: { orderBy: { game_number: 'asc' } },
        },
      });
      if (!series) throw new NotFoundException('Series not found.');
      if (series.status !== 'IN_PROGRESS' || !series.phase.schedule_locked) {
        throw new BadRequestException('Only a locked, in-progress Series can update a Game score.');
      }
      const game = series.games.find((entry) => entry.id === gameId);
      if (!game) throw new NotFoundException('Game not found in this Series.');
      if (game.status !== 'IN_PROGRESS') throw new BadRequestException('Scores can only change for the active Game.');
      assertGameParticipants(game, getParticipants(series));
      try {
        assertGameInActiveSeriesWindow({
          appointment: getSeriesAppointment(series, getParticipants(series)),
          activeSeriesId: seriesId,
          game: { id: game.id, seriesId, gameNumber: game.game_number },
          serverTime,
        });
      } catch (error) {
        throw new BadRequestException(error instanceof Error ? error.message : 'The Game score cannot be changed now.');
      }

      const nextResultVersion = game.result_version + 1;
      const transition = await tx.game.updateMany({
        where: { id: gameId, series_id: seriesId, status: 'IN_PROGRESS', result_version: game.result_version },
        data: {
          home_score: input.homeScore,
          away_score: input.awayScore,
          result_version: nextResultVersion,
        },
      });
      if (transition.count !== 1) throw new BadRequestException('The active Game changed while the score was being saved. Refresh and retry.');
      const updated = await tx.game.findUnique({ where: { id: gameId } });
      if (!updated) throw new NotFoundException('Game not found.');
      await tx.gameResultAudit.create({
        data: {
          game_id: gameId,
          result_version: nextResultVersion,
          action: 'GAME_SCORE_UPDATED',
          result: null,
          winner_player_id: null,
          home_score: input.homeScore,
          away_score: input.awayScore,
          actor_id: actor.id,
          actor_role: actor.role,
          before_state: { status: game.status, homeScore: game.home_score, awayScore: game.away_score } as Prisma.InputJsonValue,
          after_state: { status: 'IN_PROGRESS', homeScore: input.homeScore, awayScore: input.awayScore } as Prisma.InputJsonValue,
          request_id: actor.requestId,
        },
      });
      await tx.auditLog.create({
        data: {
          entity_type: 'Game',
          entity_id: gameId,
          action: 'GAME_SCORE_UPDATED',
          actor_id: actor.id,
          actor_role: actor.role,
          request_id: actor.requestId,
          before_state: { homeScore: game.home_score, awayScore: game.away_score },
          after_state: { homeScore: updated.home_score, awayScore: updated.away_score },
        },
      });
      return updated;
    });
  }

  async completeGame(
    seriesId: string,
    gameId: string,
    input: { result: 'HOME_WIN' | 'AWAY_WIN' | 'DRAW' | 'UNRESOLVED'; homeScore: number; awayScore: number; reason?: string },
    actor: AuditActor,
  ) {
    const serverTime = new Date();
    const reason = input.reason?.trim() ?? '';
    if (!Number.isInteger(input.homeScore) || input.homeScore < 0 || !Number.isInteger(input.awayScore) || input.awayScore < 0) {
      throw new BadRequestException('Game scores must be non-negative integers.');
    }
    if ((input.result === 'HOME_WIN' && input.homeScore <= input.awayScore)
      || (input.result === 'AWAY_WIN' && input.awayScore <= input.homeScore)
      || (input.result === 'DRAW' && input.homeScore !== input.awayScore)) {
      throw new BadRequestException('The final score must agree with the selected Game result.');
    }
    if (input.result === 'UNRESOLVED' && !reason) throw new BadRequestException('A reason is required for an unresolved Game result.');

    return this.prisma.$transaction(async (tx) => {
      const series = await tx.series.findUnique({
        where: { id: seriesId },
        include: {
          season: { select: { competition_timezone: true } },
          phase: { select: { schedule_locked: true } },
          games: { orderBy: { game_number: 'asc' } },
        },
      });
      if (!series) throw new NotFoundException('Series not found.');
      if (series.status !== 'IN_PROGRESS' || !series.phase.schedule_locked) {
        throw new BadRequestException('Only a locked, in-progress Series can complete a Game.');
      }
      const game = series.games.find((entry) => entry.id === gameId);
      if (!game) throw new NotFoundException('Game not found in this Series.');
      if (game.status !== 'IN_PROGRESS') throw new BadRequestException('Only the active Game can receive a result.');
      assertGameParticipants(game, getParticipants(series));
      try {
        assertSeriesResultSubmissionAllowed(getSeriesAppointment(series, getParticipants(series)), serverTime);
      } catch (error) {
        throw new BadRequestException(error instanceof Error ? error.message : 'The Game result window is closed.');
      }

      let recorded: ReturnType<typeof recordGameResult>;
      try {
        recorded = recordGameResult({
          game: {
            gameNumber: game.game_number,
            homePlayerId: game.home_player_id!,
            awayPlayerId: game.away_player_id!,
            status: game.status,
            result: game.result,
            winnerPlayerId: game.winner_player_id,
            completedAt: game.completed_at?.toISOString() ?? null,
            resultRecordedAt: game.result_recorded_at?.toISOString() ?? null,
            resultRecordedById: game.result_recorded_by_id,
            resultVersion: game.result_version,
          },
          result: input.result,
          recordedAt: serverTime,
          recordedById: actor.id,
          reason,
        });
      } catch (error) {
        throw new BadRequestException(error instanceof Error ? error.message : 'The Game result is invalid.');
      }
      const transition = await tx.game.updateMany({
        where: { id: gameId, series_id: seriesId, status: 'IN_PROGRESS', result_version: game.result_version },
        data: {
          status: 'COMPLETED',
          result: input.result,
          winner_player_id: recorded.game.winnerPlayerId,
          home_score: input.homeScore,
          away_score: input.awayScore,
          completed_at: serverTime,
          result_recorded_at: serverTime,
          result_recorded_by_id: actor.id,
          result_reason: reason || null,
          result_version: recorded.game.resultVersion,
        },
      });
      if (transition.count !== 1) throw new BadRequestException('The Game result was recorded by another operator. Refresh the Series workspace.');
      await tx.gameResultAudit.create({
        data: {
          game_id: gameId,
          result_version: recorded.game.resultVersion,
          action: recorded.audit.action,
          result: input.result,
          winner_player_id: recorded.game.winnerPlayerId,
          home_score: input.homeScore,
          away_score: input.awayScore,
          actor_id: actor.id,
          actor_role: actor.role,
          reason: reason || null,
          before_state: recorded.audit.beforeState as Prisma.InputJsonValue,
          after_state: {
            ...recorded.audit.afterState,
            homeScore: input.homeScore,
            awayScore: input.awayScore,
          } as Prisma.InputJsonValue,
          request_id: actor.requestId,
        },
      });
      await tx.gameResultVerification.create({
        data: {
          game_id: gameId,
          result_version: recorded.game.resultVersion,
          status: 'PENDING',
          actor_id: actor.id,
          actor_role: actor.role,
          reason: 'Awaiting operator verification.',
        },
      });
      await createCompetitionNotifications(tx, {
        playerIds: getParticipants(series),
        eventType: 'RESULT_SUBMITTED',
        eventKey: `result-submitted:${gameId}:${recorded.game.resultVersion}`,
        title: 'Game result submitted',
        message: `A result was submitted for Game ${game.game_number} in Series ${series.series_number ?? series.id}.`,
        relatedEntity: `Series:${seriesId}`,
      });
      const aggregateGames: SeriesGameResultInput[] = series.games.map((entry) => entry.id === gameId
        ? {
            gameNumber: entry.game_number,
            homePlayerId: entry.home_player_id ?? '',
            awayPlayerId: entry.away_player_id ?? '',
            status: 'COMPLETED',
            result: input.result,
            winnerPlayerId: recorded.game.winnerPlayerId,
          }
        : {
            gameNumber: entry.game_number,
            homePlayerId: entry.home_player_id ?? '',
            awayPlayerId: entry.away_player_id ?? '',
            status: entry.status,
            result: entry.result,
            winnerPlayerId: entry.winner_player_id,
          });
      let aggregate: ReturnType<typeof resolveSeriesResult>;
      try {
        aggregate = resolveSeriesResult(aggregateGames);
      } catch (error) {
        throw new BadRequestException(error instanceof Error ? error.message : 'The Series score could not be aggregated.');
      }
      await tx.series.update({
        where: { id: seriesId },
        data: {
          completed_game_count: aggregate.completedGameCount,
          home_win_count: aggregate.homeWins,
          away_win_count: aggregate.awayWins,
          draw_count: aggregate.draws,
          unresolved_game_count: aggregate.unresolvedGames,
          resolution_state: aggregate.resolutionState,
        },
      });
      const updated = await tx.game.findUnique({ where: { id: gameId } });
      if (!updated) throw new NotFoundException('Game not found.');
      return updated;
    });
  }

  async verifyGameResult(
    seriesId: string,
    gameId: string,
    input: { status: 'APPROVED' | 'REJECTED' | 'CORRECTION_REQUESTED'; reason?: string },
    actor: AuditActor,
  ) {
    const reason = input.reason?.trim() ?? '';
    if (input.status !== 'APPROVED' && !reason) {
      throw new BadRequestException('A reason is required to reject a result or request a correction.');
    }

    return this.prisma.$transaction(async (tx) => {
      const series = await tx.series.findUnique({
        where: { id: seriesId },
        include: {
          phase: { select: { schedule_locked: true, phase_number: true } },
          games: {
            orderBy: { game_number: 'asc' },
            include: { result_verifications: { orderBy: [{ created_at: 'desc' }, { id: 'desc' }] } },
          },
        },
      });
      if (!series) throw new NotFoundException('Series not found.');
      if (series.status !== 'IN_PROGRESS' || !series.phase.schedule_locked) {
        throw new BadRequestException('Only results in a locked, in-progress Series can be verified.');
      }
      const game = series.games.find((entry) => entry.id === gameId);
      if (!game) throw new NotFoundException('Game not found in this Series.');
      if (game.status !== 'COMPLETED' || game.result === null) {
        throw new BadRequestException('Only a submitted Game result can be verified.');
      }
      const currentVerification = getCurrentResultVerification(game);
      if (!currentVerification || currentVerification.status !== 'PENDING') {
        if (input.status === 'APPROVED' && ['APPROVED', 'OVERRIDDEN'].includes(currentVerification?.status ?? '')) {
          return { id: currentVerification?.id, status: currentVerification?.status, alreadyVerified: true };
        }
        throw new BadRequestException('Only a pending Game result can be verified.');
      }

      const beforeState = {
        resultVersion: game.result_version,
        status: currentVerification.status,
        result: game.result,
        winnerPlayerId: game.winner_player_id,
        homeScore: game.home_score,
        awayScore: game.away_score,
      };
      if (input.status !== 'APPROVED') {
        const reopened = await tx.game.updateMany({
          where: { id: gameId, series_id: seriesId, status: 'COMPLETED', result_version: game.result_version },
          data: {
            status: 'IN_PROGRESS',
            result: null,
            winner_player_id: null,
            completed_at: null,
            result_recorded_at: null,
            result_recorded_by_id: null,
            result_reason: null,
          },
        });
        if (reopened.count !== 1) throw new BadRequestException('The Game result changed while it was being verified. Refresh and retry.');
      }
      const verification = await tx.gameResultVerification.create({
        data: {
          game_id: gameId,
          result_version: game.result_version,
          status: input.status,
          actor_id: actor.id,
          actor_role: actor.role,
          reason: reason || null,
        },
      });
      if (input.status !== 'APPROVED') {
        const gamesForAggregation: SeriesGameResultInput[] = series.games.map((entry) => entry.id === gameId
          ? {
              gameNumber: entry.game_number,
              homePlayerId: entry.home_player_id ?? '',
              awayPlayerId: entry.away_player_id ?? '',
              status: 'IN_PROGRESS',
              result: null,
              winnerPlayerId: null,
            }
          : {
              gameNumber: entry.game_number,
              homePlayerId: entry.home_player_id ?? '',
              awayPlayerId: entry.away_player_id ?? '',
              status: entry.status,
              result: entry.result,
              winnerPlayerId: entry.winner_player_id,
            });
        const aggregate = resolveSeriesResult(gamesForAggregation);
        await tx.series.update({
          where: { id: seriesId },
          data: {
            completed_game_count: aggregate.completedGameCount,
            home_win_count: aggregate.homeWins,
            away_win_count: aggregate.awayWins,
            draw_count: aggregate.draws,
            unresolved_game_count: aggregate.unresolvedGames,
            resolution_state: aggregate.resolutionState,
          },
        });
      }
      await tx.auditLog.create({
        data: {
          entity_type: 'Game',
          entity_id: gameId,
          action: `GAME_RESULT_${input.status}`,
          actor_id: actor.id,
          actor_role: actor.role,
          request_id: actor.requestId,
          reason: reason || null,
          before_state: beforeState,
          after_state: {
            resultVersion: game.result_version,
            status: input.status,
            gameStatus: input.status === 'APPROVED' ? 'COMPLETED' : 'IN_PROGRESS',
            result: game.result,
            winnerPlayerId: game.winner_player_id,
            homeScore: game.home_score,
            awayScore: game.away_score,
          },
        },
      });
      return { id: verification.id, status: verification.status, alreadyVerified: false };
    });
  }

  async overrideGameResult(
    seriesId: string,
    gameId: string,
    input: {
      result: 'HOME_WIN' | 'AWAY_WIN' | 'DRAW' | 'UNRESOLVED';
      homeScore: number;
      awayScore: number;
      reason: string;
      evidenceUrl?: string;
      reference?: string;
    },
    actor: AuditActor,
  ) {
    const serverTime = new Date();
    const reason = input.reason?.trim() ?? '';
    if (!reason) throw new BadRequestException('A reason is required to override a Game result.');
    if (!actor.id) throw new BadRequestException('An authenticated actor is required to override a Game result.');
    const reference = input.reference?.trim() || actor.requestId;
    if (!reference) throw new BadRequestException('An override reference or request correlation ID is required.');
    if (!Number.isInteger(input.homeScore) || input.homeScore < 0 || !Number.isInteger(input.awayScore) || input.awayScore < 0) {
      throw new BadRequestException('Game scores must be non-negative integers.');
    }
    if ((input.result === 'HOME_WIN' && input.homeScore <= input.awayScore)
      || (input.result === 'AWAY_WIN' && input.awayScore <= input.homeScore)
      || (input.result === 'DRAW' && input.homeScore !== input.awayScore)) {
      throw new BadRequestException('The final score must agree with the selected Game result.');
    }

    return this.prisma.$transaction(async (tx) => {
      const series = await tx.series.findUnique({
        where: { id: seriesId },
        include: {
          phase: { select: { schedule_locked: true, phase_number: true } },
          games: {
            orderBy: { game_number: 'asc' },
            include: { result_verifications: { orderBy: [{ created_at: 'desc' }, { id: 'desc' }] } },
          },
        },
      });
      if (!series) throw new NotFoundException('Series not found.');
      if (series.status !== 'IN_PROGRESS' || !series.phase.schedule_locked) {
        throw new BadRequestException('Only a locked, in-progress Series can receive a result override.');
      }
      const game = series.games.find((entry) => entry.id === gameId);
      if (!game) throw new NotFoundException('Game not found in this Series.');
      if (game.status !== 'COMPLETED' || game.result === null) {
        throw new BadRequestException('Only a completed Game result can be overridden.');
      }
      assertGameParticipants(game, getParticipants(series));

      const beforeState = {
        resultVersion: game.result_version,
        result: game.result,
        winnerPlayerId: game.winner_player_id,
        homeScore: game.home_score,
        awayScore: game.away_score,
        resultReason: game.result_reason,
      };
      const winnerPlayerId = input.result === 'HOME_WIN'
        ? game.home_player_id
        : input.result === 'AWAY_WIN'
          ? game.away_player_id
          : null;
      const nextResultVersion = game.result_version + 1;
      const update = await tx.game.updateMany({
        where: { id: gameId, series_id: seriesId, status: 'COMPLETED', result_version: game.result_version },
        data: {
          result: input.result,
          winner_player_id: winnerPlayerId,
          home_score: input.homeScore,
          away_score: input.awayScore,
          result_recorded_at: serverTime,
          result_recorded_by_id: actor.id,
          result_reason: reason,
          result_version: nextResultVersion,
        },
      });
      if (update.count !== 1) throw new BadRequestException('The Game result changed before the override was applied. Refresh and retry.');

      const afterState = {
        resultVersion: nextResultVersion,
        result: input.result,
        winnerPlayerId,
        homeScore: input.homeScore,
        awayScore: input.awayScore,
        resultReason: reason,
      };
      await tx.gameResultAudit.create({
        data: {
          game_id: gameId,
          result_version: nextResultVersion,
          action: 'RESULT_OVERRIDDEN',
          result: input.result,
          winner_player_id: winnerPlayerId,
          home_score: input.homeScore,
          away_score: input.awayScore,
          actor_id: actor.id,
          actor_role: actor.role,
          reason,
          before_state: beforeState as Prisma.InputJsonValue,
          after_state: {
            ...afterState,
            evidenceUrl: input.evidenceUrl?.trim() || null,
            reference,
            overriddenAt: serverTime.toISOString(),
          } as Prisma.InputJsonValue,
          request_id: actor.requestId,
        },
      });
      const verification = await tx.gameResultVerification.create({
        data: {
          game_id: gameId,
          result_version: nextResultVersion,
          status: 'OVERRIDDEN',
          actor_id: actor.id,
          actor_role: actor.role,
          reason,
        },
      });
      const aggregateGames: SeriesGameResultInput[] = series.games.map((entry) => entry.id === gameId
        ? {
            gameNumber: entry.game_number,
            homePlayerId: entry.home_player_id ?? '',
            awayPlayerId: entry.away_player_id ?? '',
            status: 'COMPLETED',
            result: input.result,
            winnerPlayerId,
          }
        : {
            gameNumber: entry.game_number,
            homePlayerId: entry.home_player_id ?? '',
            awayPlayerId: entry.away_player_id ?? '',
            status: entry.status,
            result: entry.result,
            winnerPlayerId: entry.winner_player_id,
          });
      const aggregate = resolveSeriesResult(aggregateGames);
      await tx.series.update({
        where: { id: seriesId },
        data: {
          completed_game_count: aggregate.completedGameCount,
          home_win_count: aggregate.homeWins,
          away_win_count: aggregate.awayWins,
          draw_count: aggregate.draws,
          unresolved_game_count: aggregate.unresolvedGames,
          resolution_state: aggregate.resolutionState,
        },
      });
      await tx.auditLog.create({
        data: {
          entity_type: 'Game',
          entity_id: gameId,
          action: 'GAME_RESULT_OVERRIDDEN',
          actor_id: actor.id,
          actor_role: actor.role,
          action_source: 'ADMIN_OVERRIDE',
          reason,
          request_id: actor.requestId,
          correlation_id: reference,
          before_state: beforeState as Prisma.InputJsonValue,
          after_state: {
            ...afterState,
            verificationId: verification.id,
            evidenceUrl: input.evidenceUrl?.trim() || null,
            reference,
            seriesRecalculation: {
              completedGameCount: aggregate.completedGameCount,
              homeWins: aggregate.homeWins,
              awayWins: aggregate.awayWins,
              draws: aggregate.draws,
              unresolvedGames: aggregate.unresolvedGames,
              resolutionState: aggregate.resolutionState,
            },
            overriddenAt: serverTime.toISOString(),
          } as Prisma.InputJsonValue,
        },
      });
      return { id: gameId, resultVersion: nextResultVersion, result: input.result, winnerPlayerId, verificationStatus: 'OVERRIDDEN' as const };
    });
  }

  async completeSeries(seriesId: string, actor: AuditActor) {
    const serverTime = new Date();
    return this.prisma.$transaction(async (tx) => {
      const series = await tx.series.findUnique({
        where: { id: seriesId },
        include: {
          phase: { select: { schedule_locked: true, phase_number: true } },
          games: {
            orderBy: { game_number: 'asc' },
            include: { result_verifications: { orderBy: [{ created_at: 'desc' }, { id: 'desc' }] } },
          },
        },
      });
      if (!series) throw new NotFoundException('Series not found.');
      if (series.status === 'COMPLETED' || series.status === 'ELIMINATED') {
        return { id: seriesId, status: series.status, alreadyCompleted: true };
      }
      if (series.status !== 'IN_PROGRESS' || !series.phase.schedule_locked) {
        throw new BadRequestException('Only a locked, in-progress Series can be completed.');
      }
      if (series.games.length !== 3 || series.games.some((game) => game.status !== 'COMPLETED' || game.result === null)) {
        throw new BadRequestException('A Series cannot be completed until all three Games have resolved results.');
      }
      const allResultsVerified = series.games.every((game) => {
        const latest = getCurrentResultVerification(game);
        return latest?.status === 'APPROVED' || latest?.status === 'OVERRIDDEN';
      });
      if (!allResultsVerified) {
        throw new BadRequestException('Every current Game result must be approved or overridden before Series resolution.');
      }

      const games: SeriesGameResultInput[] = series.games.map((game) => ({
        gameNumber: game.game_number,
        homePlayerId: game.home_player_id ?? '',
        awayPlayerId: game.away_player_id ?? '',
        status: game.status,
        result: game.result,
        winnerPlayerId: game.winner_player_id,
      }));
      let advancement: ReturnType<typeof resolveSeriesAdvancement>;
      try {
        advancement = resolveSeriesAdvancement({ seriesId, games, actorId: actor.id, resolvedAt: serverTime });
      } catch (error) {
        throw new BadRequestException(error instanceof Error ? error.message : 'Series results are invalid.');
      }
      if (!advancement.audit || advancement.state === 'PENDING') {
        throw new BadRequestException('All three Games must resolve before Series advancement can be finalized.');
      }
      const finalStatus = advancement.state === 'ADVANCED' ? 'COMPLETED' : 'ELIMINATED';
      const eliminatedPlayerId = advancement.eliminatedPlayerIds.length === 1
        ? advancement.eliminatedPlayerIds[0]
        : null;
      const transition = await tx.series.updateMany({
        where: { id: seriesId, status: 'IN_PROGRESS' },
        data: {
          status: finalStatus,
          completed_game_count: advancement.summary.completedGameCount,
          home_win_count: advancement.summary.homeWins,
          away_win_count: advancement.summary.awayWins,
          draw_count: advancement.summary.draws,
          unresolved_game_count: advancement.summary.unresolvedGames,
          resolution_state: advancement.summary.resolutionState,
          elimination_outcome: advancement.audit.outcome,
          winner_player_id: advancement.advancingPlayerId,
          eliminated_player_id: eliminatedPlayerId,
          eliminated_player_ids: advancement.eliminatedPlayerIds as Prisma.InputJsonValue,
          resolution_reason: advancement.reason,
        },
      });
      if (transition.count !== 1) throw new BadRequestException('The Series was completed by another operator. Refresh its current state.');
      await tx.seriesResolutionAudit.create({
        data: {
          series_id: seriesId,
          idempotency_key: advancement.audit.idempotencyKey,
          outcome: advancement.audit.outcome,
          advancing_player_id: advancement.advancingPlayerId,
          eliminated_player_ids: advancement.eliminatedPlayerIds as Prisma.InputJsonValue,
          resolution_reason: advancement.reason,
          game_results: advancement.audit.gameResults as Prisma.InputJsonValue,
          before_state: advancement.audit.beforeState as Prisma.InputJsonValue,
          after_state: advancement.audit.afterState as Prisma.InputJsonValue,
          actor_id: actor.id,
        },
      });
      await tx.auditLog.create({
        data: {
          entity_type: 'Series',
          entity_id: seriesId,
          action: finalStatus === 'COMPLETED' ? 'SERIES_ADVANCEMENT_FINALIZED' : 'SERIES_ELIMINATION_FINALIZED',
          actor_id: actor.id,
          actor_role: actor.role,
          request_id: actor.requestId,
          before_state: { status: series.status },
          after_state: {
            status: finalStatus,
            winnerPlayerId: advancement.advancingPlayerId,
            eliminatedPlayerIds: advancement.eliminatedPlayerIds,
            completedGameCount: advancement.summary.completedGameCount,
          },
        },
      });
      const seriesLabel = `Series ${series.series_number ?? series.id}`;
      const phaseLabel = `Phase ${series.phase.phase_number ?? 1}`;
      const participantIds = getParticipants(series);
      await createCompetitionNotifications(tx, {
        playerIds: participantIds,
        eventType: 'SERIES_RESOLVED',
        eventKey: `series-resolved:${seriesId}`,
        title: 'Series resolved',
        message: `${seriesLabel} in ${phaseLabel} has been resolved.`,
        relatedEntity: `Series:${seriesId}`,
      });
      if (advancement.advancingPlayerId) {
        await createCompetitionNotifications(tx, {
          playerIds: [advancement.advancingPlayerId],
          eventType: 'PLAYER_ADVANCED',
          eventKey: `player-advanced:${seriesId}:${advancement.advancingPlayerId}`,
          title: 'You advanced',
          message: `You advanced from ${seriesLabel} in ${phaseLabel}.`,
          relatedEntity: `Series:${seriesId}`,
        });
      }
      if (advancement.eliminatedPlayerIds.length > 0) {
        await createCompetitionNotifications(tx, {
          playerIds: advancement.eliminatedPlayerIds,
          eventType: 'PLAYER_ELIMINATED',
          eventKey: `player-eliminated:${seriesId}`,
          title: 'You were eliminated',
          message: `Your competition in ${seriesLabel}, ${phaseLabel}, has ended.`,
          relatedEntity: `Series:${seriesId}`,
        });
      }
      return {
        id: seriesId,
        status: finalStatus,
        winnerPlayerId: advancement.advancingPlayerId,
        eliminatedPlayerIds: advancement.eliminatedPlayerIds,
        resultState: advancement.summary.resolutionState,
        alreadyCompleted: false,
      };
    });
  }

  async recordSeriesCheckIn(
    seriesId: string,
    playerId: string,
    input: { isException?: boolean; reason?: string; evidenceUrl?: string },
    actor: AuditActor,
  ) {
    const serverTime = new Date();
    const isException = input.isException === true;
    const reason = input.reason?.trim() ?? '';
    if (isException && !reason) throw new BadRequestException('exception reason is required.');
    if (isException && !actor.permissions?.includes(PermissionName.MANAGE_COMPETITION_EXCEPTIONS)) {
      throw new ForbiddenException('The MANAGE_COMPETITION_EXCEPTIONS permission is required.');
    }
    if (isException && !actor.id) throw new BadRequestException('An authenticated actor is required for a check-in exception.');

    return this.prisma.$transaction(async (tx) => {
      const series = await tx.series.findUnique({
        where: { id: seriesId },
        include: { season: { include: { ruleset: true } }, phase: true, games: true, check_ins: true },
      });
      if (!series) throw new NotFoundException('Series not found.');
      const playerIds = getParticipants(series);
      if (playerIds.length !== 2 || !playerIds.includes(playerId)) {
        throw new BadRequestException('The selected Player is not a participant in this Series.');
      }
      const player = await tx.playerProfile.findUnique({ where: { id: playerId }, select: { id: true, gamer_tag: true } });
      if (!player) throw new BadRequestException('The selected Series participant could not be identified.');
      if (!series.check_in_opens_at || !series.check_in_closes_at || !series.match_window_start || !series.match_window_end || !series.results_deadline_at) {
        throw new BadRequestException('The Series must have a complete schedule before check-in.');
      }
      if (!series.phase.schedule_locked) throw new BadRequestException('The Phase schedule must be locked before check-in.');

      const existing = await tx.seriesCheckIn.findUnique({
        where: { series_id_player_id: { series_id: seriesId, player_id: playerId } },
      });
      if (existing) return { ...existing, alreadyCheckedIn: true };
      const scheduledCheckIn = series.check_ins?.find((checkIn) => checkIn.player_id === playerId);
      if (scheduledCheckIn) return {
        id: scheduledCheckIn.id ?? `${seriesId}:${playerId}`,
        series_id: seriesId,
        player_id: playerId,
        checked_in_at: scheduledCheckIn.checked_in_at ?? serverTime,
        checked_in_by_id: scheduledCheckIn.checked_in_by_id ?? actor.id,
        is_exception: scheduledCheckIn.is_exception ?? false,
        exception_reason: scheduledCheckIn.exception_reason ?? null,
        alreadyCheckedIn: true,
      };
      if (series.status !== 'SCHEDULED') {
        throw new BadRequestException('Check-in is only available for a scheduled Series.');
      }
      if (isException && serverTime >= series.match_window_end) {
        throw new BadRequestException('A check-in exception cannot be recorded after the Match Window ends.');
      }

      if (!isException) {
        try {
          assertCheckInAllowed({
            seriesId,
            phaseId: series.phase_id,
            playerIds,
            checkInOpensAt: series.check_in_opens_at,
            checkInClosesAt: series.check_in_closes_at,
            matchWindowStartAt: series.match_window_start,
            matchWindowEndAt: series.match_window_end,
            resultsDeadlineAt: series.results_deadline_at,
            timezone: series.match_window_timezone ?? series.season.competition_timezone,
            gameNumbers: [1, 2, 3],
          }, serverTime);
        } catch (error) {
          throw new BadRequestException(error instanceof Error ? error.message : 'Series check-in is not open.');
        }
      }

      const inserted = await tx.seriesCheckIn.createMany({
        data: {
          series_id: seriesId,
          player_id: playerId,
          checked_in_at: serverTime,
          checked_in_by_id: actor.id,
          is_exception: isException,
          exception_reason: isException ? reason : null,
        },
        skipDuplicates: true,
      });
      if (inserted.count === 0) {
        const duplicate = await tx.seriesCheckIn.findUnique({
          where: { series_id_player_id: { series_id: seriesId, player_id: playerId } },
        });
        if (duplicate) return { ...duplicate, alreadyCheckedIn: true };
        throw new BadRequestException('The participant check-in could not be recorded.');
      }
      const checkIn = await tx.seriesCheckIn.findUnique({
        where: { series_id_player_id: { series_id: seriesId, player_id: playerId } },
      });
      if (!checkIn) throw new BadRequestException('The participant check-in could not be confirmed.');
      await tx.auditLog.create({
        data: {
          entity_type: 'Series',
          entity_id: seriesId,
          action: isException ? 'SERIES_CHECK_IN_EXCEPTION_RECORDED' : 'SERIES_PARTICIPANT_CHECKED_IN',
          actor_id: actor.id,
          actor_role: actor.role,
          action_source: isException ? 'OPERATOR_EXCEPTION' : 'OPERATOR_CHECK_IN',
          reason: isException ? reason : null,
          request_id: actor.requestId,
          correlation_id: actor.requestId,
          before_state: { isCheckedIn: false, seriesStatus: series.status },
          after_state: {
            checkInId: checkIn.id,
            playerId,
            gamerTag: player.gamer_tag,
            checkedInAt: serverTime.toISOString(),
            isException,
            evidenceUrl: input.evidenceUrl?.trim() || null,
          },
        },
      });
      return { ...checkIn, alreadyCheckedIn: false };
    });
  }

  async startSeries(seriesId: string, actor: AuditActor) {
    const serverTime = new Date();
    return this.prisma.$transaction(async (tx) => {
      const series = await tx.series.findUnique({
        where: { id: seriesId },
        include: { season: { include: { ruleset: true } }, phase: true, games: true, check_ins: true },
      });
      if (!series) throw new NotFoundException('Series not found.');
      if (!series.match_window_start || !series.match_window_end) {
        throw new BadRequestException('The Series must have a scheduled Match Window before it can start.');
      }
      if (!series.phase.schedule_locked) throw new BadRequestException('The Phase schedule must be locked before Series execution.');
      const playerIds = getParticipants(series);
      const attendancePolicy = validateCompetitionRules(series.season.ruleset?.rules ?? DEFAULT_COMPETITION_RULES).checkIn.attendancePolicy as string;
      try {
        assertSeriesCanStart({
          status: series.status,
          attendancePolicy,
          participantIds: playerIds,
          checkedInPlayerIds: series.check_ins.map((checkIn) => checkIn.player_id),
          matchWindowStartAt: series.match_window_start,
          matchWindowEndAt: series.match_window_end,
          serverTime,
        });
      } catch (error) {
        throw new BadRequestException(error instanceof Error ? error.message : 'Series cannot start.');
      }

      const transition = await tx.series.updateMany({
        where: { id: seriesId, status: 'SCHEDULED' },
        data: { status: 'IN_PROGRESS' },
      });
      if (transition.count !== 1) throw new BadRequestException('The Series was started by another operator. Refresh and review its current status.');
      await tx.auditLog.create({
        data: {
          entity_type: 'Series',
          entity_id: seriesId,
          action: 'SERIES_STARTED',
          actor_id: actor.id,
          actor_role: actor.role,
          request_id: actor.requestId,
          before_state: { status: series.status },
          after_state: {
            status: 'IN_PROGRESS',
            startedAt: serverTime.toISOString(),
            checkedInPlayerIds: series.check_ins.map((checkIn) => checkIn.player_id),
          },
        },
      });
      return { id: seriesId, status: 'IN_PROGRESS' as const };
    });
  }

  async generateNextPhase(phaseId: string, actor: AuditActor) {
    return this.prisma.$transaction(async (tx) => {
      const phase = await tx.phase.findUnique({
        where: { id: phaseId },
        include: {
          season: { select: { id: true, name: true, start_date: true, end_date: true, competition_timezone: true } },
          plots: {
            orderBy: { created_at: 'asc' },
            include: {
              series: {
                orderBy: { series_number: 'asc' },
                include: {
                  games: { orderBy: { game_number: 'asc' } },
                  resolution_audits: true,
                },
              },
            },
          },
        },
      });
      if (!phase) throw new NotFoundException('Phase not found.');
      if (phase.status !== 'COMPLETED') throw new BadRequestException('Only a completed Phase can generate the next Phase.');
      if (phase.phase_type === 'FINAL') throw new BadRequestException('The final Phase cannot generate a subsequent Phase.');

      const existingTransition = await tx.phaseTransitionAudit.findUnique({ where: { from_phase_id: phase.id } });
      if (existingTransition) throw new BadRequestException('The next Phase has already been generated for this Phase.');

      const series = phase.plots.flatMap((plot) => plot.series);
      if (series.length === 0) throw new BadRequestException('A completed Phase must have Series before generating the next Phase.');

      const participantIds = jsonStringArray(phase.participating_player_ids).length > 0
        ? jsonStringArray(phase.participating_player_ids)
        : phase.plots.flatMap((plot) => jsonStringArray(plot.player_ids));
      const validatedSeries = series.map((entry) => {
        const games = entry.games.map((game) => {
          const homePlayerId = game.home_player_id?.trim();
          const awayPlayerId = game.away_player_id?.trim();
          if (!homePlayerId || !awayPlayerId || homePlayerId === awayPlayerId) {
            throw new BadRequestException(
              `Series ${entry.id} Game ${game.game_number} must have two distinct valid participant IDs before Phase transition.`,
            );
          }
          return {
            gameNumber: game.game_number,
            homePlayerId,
            awayPlayerId,
            status: game.status,
            result: game.result,
            winnerPlayerId: game.winner_player_id,
          };
        });
        return {
          id: entry.id,
          status: entry.status as 'COMPLETED' | 'ELIMINATED',
          games,
          advancement: resolveSeriesAdvancement({ seriesId: entry.id, games }),
        };
      });

      const transition = planPhaseTransition({
        seasonId: phase.season_id,
        seasonStart: phase.season.start_date ?? new Date(0),
        seasonEnd: phase.season.end_date ?? new Date(0),
        transitionAt: new Date(),
        nextPhaseId: randomUUID(),
        actorId: actor.id ?? null,
        seedOrder: participantIds,
        currentPhase: {
          id: phase.id,
          phaseNumber: phase.phase_number,
          status: phase.status,
          endAt: phase.end_at,
          plotCount: phase.plots.length,
          previousPlots: phase.plots.map((plot) => ({ playerIds: jsonStringArray(plot.player_ids) })),
        },
        series: validatedSeries,
      });

      const nextPhase = await tx.phase.create({
        data: {
          id: transition.nextPhase.id,
          season_id: phase.season_id,
          phase_number: transition.nextPhase.phaseNumber,
          phase_type: transition.nextPhase.phaseType,
          name: transition.nextPhase.phaseType === 'FINAL' ? 'Final' : `Phase ${transition.nextPhase.phaseNumber}`,
          start_at: new Date(transition.nextPhase.startAt),
          end_at: new Date(transition.nextPhase.endAt),
          status: 'DRAFT',
          participating_player_ids: transition.nextPhase.participatingPlayerIds,
          schedule_locked: false,
        },
      });

      const plotIdMap = new Map<string, string>();
      for (const plot of transition.plots) {
        const createdPlot = await tx.plot.create({
          data: {
            phase_id: nextPhase.id,
            name: plot.name,
            status: plot.status,
            player_ids: plot.playerIds,
          },
        });
        plotIdMap.set(plot.id, createdPlot.id);
      }

      const createdSeriesByKey = new Map<string, string>();
      for (const generatedSeries of transition.series) {
        const plotId = plotIdMap.get(generatedSeries.plotId);
        if (!plotId) throw new BadRequestException(`A generated Series is missing a Plot assignment: ${generatedSeries.seriesKey}`);

        const createdSeries = await tx.series.create({
          data: {
            season_id: phase.season_id,
            phase_id: nextPhase.id,
            plot_id: plotId,
            series_number: generatedSeries.seriesNumber,
            status: 'DRAFT',
            participant_player_ids: generatedSeries.players,
            expected_game_count: 3,
            completed_game_count: 0,
            resolution_state: 'UNRESOLVED',
          },
        });
        createdSeriesByKey.set(generatedSeries.seriesKey, createdSeries.id);

        for (const game of generatedSeries.games) {
          await tx.game.create({
            data: {
              series_id: createdSeries.id,
              game_number: game.gameNumber,
              home_player_id: game.homePlayerId,
              away_player_id: game.awayPlayerId,
              result: game.result,
              status: 'PENDING',
            },
          });
        }
      }

      await tx.phaseTransitionAudit.create({
        data: {
          from_phase_id: phase.id,
          to_phase_id: nextPhase.id,
          idempotency_key: transition.transitionIdempotencyKey,
          advancement_pool: transition.advancementPool,
          eliminated_player_ids: transition.eliminatedPlayerIds,
          source_series_ids: transition.audit.sourceSeriesIds,
          phase_window: transition.audit.phaseWindow,
          actor_id: actor.id ?? null,
          transitioned_at: new Date(transition.audit.transitionedAt),
        },
      });
      await createCompetitionNotifications(tx, {
        playerIds: transition.nextPhase.participatingPlayerIds,
        eventType: 'NEXT_PHASE_GENERATED',
        eventKey: `next-phase-generated:${nextPhase.id}`,
        title: 'Next Phase generated',
        message: `${transition.nextPhase.phaseType === 'FINAL' ? 'Final Phase' : `Phase ${transition.nextPhase.phaseNumber}`} has been generated for ${phase.season.name}.`,
        relatedEntity: `Phase:${nextPhase.id}`,
      });

      const seasonPhases = await tx.phase.findMany({
        where: { season_id: phase.season_id },
        orderBy: { phase_number: 'asc' },
        include: { plots: { include: { series: { include: { games: true } } } } },
      });

      const scheduled = scheduleSeriesAutomatically({
        competitionTimezone: phase.season.competition_timezone,
        seasonStartAt: phase.season.start_date ?? new Date(0),
        seasonEndAt: phase.season.end_date ?? new Date(0),
        currentDate: new Date(),
        currentPhaseNumber: phase.phase_number,
        phases: seasonPhases.map((entry) => ({
          id: entry.id,
          phaseNumber: entry.phase_number,
          startAt: entry.start_at ?? new Date(0),
          endAt: entry.end_at ?? new Date(0),
        })),
        series: seasonPhases.flatMap((entry) => entry.plots.flatMap((plot) => plot.series.map((seriesEntry) => ({
          id: seriesEntry.id,
          phaseId: seriesEntry.phase_id,
          playerIds: getParticipants(seriesEntry),
        })))),
      });

      if (!scheduled.feasible) {
        throw new BadRequestException(`The next Phase cannot be scheduled: ${scheduled.capacity.blockers.map((blocker) => blocker.message).join(' ')}`);
      }

      await tx.auditLog.create({
        data: {
          entity_type: 'CompetitionPhase',
          entity_id: phase.id,
          action: 'PHASE_TRANSITION_GENERATED',
          actor_id: actor.id,
          actor_role: actor.role,
          request_id: actor.requestId,
          before_state: { phaseId: phase.id, phaseNumber: phase.phase_number },
          after_state: {
            nextPhaseId: nextPhase.id,
            nextPhaseNumber: nextPhase.phase_number,
            advancementPool: transition.advancementPool,
            scheduledSeriesCount: scheduled.scheduledSeries.filter((entry) => entry.phaseId === nextPhase.id).length,
          },
        },
      });

      return {
        fromPhaseId: phase.id,
        nextPhase: {
          id: nextPhase.id,
          phaseNumber: nextPhase.phase_number,
          phaseType: nextPhase.phase_type,
          status: nextPhase.status,
          startAt: nextPhase.start_at?.toISOString() ?? null,
          endAt: nextPhase.end_at?.toISOString() ?? null,
          participatingPlayerIds: transition.nextPhase.participatingPlayerIds,
        },
        advancementPool: transition.advancementPool,
        eliminatedPlayerIds: transition.eliminatedPlayerIds,
        plots: transition.plots,
        seriesCount: transition.series.length,
      };
    });
  }

  async generatePhaseTransition(phaseId: string, actor: AuditActor) {
    return this.generateNextPhase(phaseId, actor);
  }

  async generateSchedule(seasonId: string, actor: AuditActor) {
    const result = await this.prisma.$transaction(async (tx) => {
      const season = await tx.season.findUnique({ where: { id: seasonId }, include: workspaceInclude });
      if (!season) throw new NotFoundException('Season not found');
      if (season.status !== 'ROSTER_LOCKED') throw new BadRequestException('Lock the participant roster before generating a competition schedule.');
      if (!season.start_date || !season.end_date) throw new BadRequestException('Season dates are required before schedule generation.');
      if (season.phases.some((phase) => phase.schedule_locked)) throw new BadRequestException('A locked Phase schedule cannot be regenerated.');
      const rows = getSeriesRows(season);
      if (rows.length === 0) throw new BadRequestException('Generate canonical Phases, Plots, and Series before scheduling.');
      if (rows.some(({ series }) => series.check_ins.length > 0)) {
        throw new BadRequestException('Schedules cannot be regenerated after participant check-in has started.');
      }
      if (rows.some(({ series }) => !['DRAFT', 'SCHEDULED'].includes(series.status))) {
        throw new BadRequestException('Schedules cannot be regenerated after Series execution or resolution has started.');
      }
      if (rows.some((row) => row.playerIds.length !== 2)) {
        throw new BadRequestException('Every Series must have two participants before scheduling.');
      }
      const generated = scheduleSeriesAutomatically({
        competitionTimezone: season.competition_timezone,
        seasonStartAt: season.start_date,
        seasonEndAt: season.end_date,
        currentDate: new Date(),
        currentPhaseNumber: Math.max(0, season.phases[0].phase_number - 1),
        phases: season.phases.map((phase) => {
          if (!phase.start_at || !phase.end_at) throw new BadRequestException(`Phase ${phase.phase_number} requires dates before scheduling.`);
          return { id: phase.id, phaseNumber: phase.phase_number, startAt: phase.start_at, endAt: phase.end_at };
        }),
        series: rows.map(({ series, phase, playerIds }) => ({ id: series.id, phaseId: phase.id, playerIds })),
      });
      if (!generated.feasible) {
        const blockers = generated.capacity.blockers.map((blocker) => blocker.message).join(' ');
        throw new BadRequestException(`Season capacity blocks schedule generation. ${blockers}`);
      }
      const seriesById = new Map(rows.map(({ series }) => [series.id, series]));
      for (const appointment of generated.scheduledSeries) {
        const series = seriesById.get(appointment.seriesId);
        const phase = season.phases.find((entry) => entry.id === appointment.phaseId);
        await tx.series.update({
          where: { id: appointment.seriesId },
          data: {
            participant_player_ids: appointment.playerIds,
            schedule_key: appointment.scheduleKey,
            check_in_opens_at: new Date(appointment.checkInOpensAt),
            check_in_closes_at: new Date(appointment.checkInClosesAt),
            match_window_start: new Date(appointment.matchWindowStartAt),
            match_window_end: new Date(appointment.matchWindowEndAt),
            match_window_timezone: appointment.timezone,
            results_deadline_at: new Date(appointment.resultsDeadlineAt),
            status: series?.status === 'DRAFT' ? 'SCHEDULED' : undefined,
          },
        });
        await createCompetitionNotifications(tx, {
          playerIds: appointment.playerIds,
          eventType: 'SERIES_SCHEDULED',
          eventKey: `series-scheduled:${appointment.scheduleKey}`,
          title: 'Series scheduled',
          message: `Series ${series?.series_number ?? appointment.seriesId} in Phase ${phase?.phase_number ?? 1} has been scheduled for ${appointment.matchWindowStartAt}.`,
          relatedEntity: `Series:${appointment.seriesId}`,
        });
      }
      return generated;
    });
    await this.auditService.writeLog({
      entityType: 'Season', entityId: seasonId, action: 'COMPETITION_SCHEDULE_GENERATED',
      actorId: actor.id, actorRole: actor.role, requestId: actor.requestId,
      afterState: { appointments: result.scheduledSeries.length, capacity: result.capacity },
    });
    return result;
  }

  async validateSchedule(seasonId: string) {
    const season = await this.prisma.season.findUnique({ where: { id: seasonId }, include: workspaceInclude });
    if (!season) throw new NotFoundException('Season not found');
    return validateSeriesSchedule(getValidationInput(season));
  }

  async completePhase(phaseId: string, actor: AuditActor) {
    return this.prisma.$transaction(async (tx) => {
      const phase = await tx.phase.findUnique({
        where: { id: phaseId },
        include: {
          season: { select: { start_date: true, end_date: true } },
          plots: {
            orderBy: { created_at: 'asc' },
            include: {
              series: {
                orderBy: { series_number: 'asc' },
                include: {
                  games: {
                    orderBy: { game_number: 'asc' },
                    include: { result_verifications: { orderBy: [{ created_at: 'desc' }, { id: 'desc' }] } },
                  },
                  resolution_audits: true,
                },
              },
            },
          },
        },
      });
      if (!phase) throw new NotFoundException('Phase not found.');
      if (phase.status === 'COMPLETED') throw new BadRequestException('Phase has already been completed.');
      if (phase.status !== 'ACTIVE') throw new BadRequestException('Only an active Phase can be completed.');

      const series = phase.plots.flatMap((plot) => plot.series);
      const participantIds = jsonStringArray(phase.participating_player_ids).length > 0
        ? jsonStringArray(phase.participating_player_ids)
        : phase.plots.flatMap((plot) => jsonStringArray(plot.player_ids));
      const unresolvedDisputes = await tx.dispute.findMany({
        where: {
          phase_id: phaseId,
          status: { in: ['SUBMITTED', 'UNDER_REVIEW', 'ESCALATED'] },
        },
        select: { id: true },
      });
      const pendingPenaltyEffects = await tx.penalty.findMany({
        where: {
          OR: [
            { phase_id: phaseId },
            { season_id: phase.season_id, scope_type: 'SEASON' },
            ...(participantIds.length > 0 ? [{ player_id: { in: participantIds } }] : []),
          ],
          effect_type: { not: 'NONE' },
          effect_status: { notIn: ['APPLIED', 'EXPIRED', 'REVOKED'] },
          status: { notIn: ['EXPIRED', 'REVOKED'] },
        },
        select: { id: true },
      });
      const configuration = phase.configuration && typeof phase.configuration === 'object' && !Array.isArray(phase.configuration)
        ? phase.configuration as Record<string, unknown>
        : {};
      const blockOnUnresolvedDisputes = typeof configuration.blockOnUnresolvedDisputes === 'boolean'
        ? configuration.blockOnUnresolvedDisputes
        : true;
      const assessmentInput = {
        participantIds,
        plots: phase.plots.map((plot, index) => ({
          id: plot.id,
          name: plot.name ?? `Plot ${index + 1}`,
          playerIds: jsonStringArray(plot.player_ids),
        })),
        series: series.map((entry) => ({
          id: entry.id,
          status: entry.status,
          playerIds: getParticipants(entry),
          winnerPlayerId: entry.winner_player_id,
          eliminatedPlayerIds: jsonStringArray(entry.eliminated_player_ids),
          advancementFinalized: entry.resolution_audits.some((audit) =>
            (entry.status === 'COMPLETED'
              && audit.outcome === 'WINNER_ADVANCES'
              && audit.advancing_player_id === entry.winner_player_id)
            || (entry.status === 'ELIMINATED' && audit.outcome === 'BOTH_ELIMINATED')),
          games: entry.games.map((game) => ({
            status: game.status,
            result: game.result,
            currentVerificationStatus: getCurrentResultVerification(game)?.status ?? null,
          })),
        })),
        blockOnUnresolvedDisputes,
        unresolvedDisputeCount: unresolvedDisputes.length,
        unappliedPenaltyCount: pendingPenaltyEffects.length,
        nextPhaseRequired: phase.phase_type !== 'FINAL',
        nextPhaseTimingFeasible: true,
      };
      const preliminary = assessPhaseCompletion(assessmentInput);
      let nextPhaseTimingReason: string | null = null;
      const needsNextPhase = phase.phase_type !== 'FINAL'
        && preliminary.progression.advancementEligiblePlayerIds.length >= 2;
      if (needsNextPhase) {
        const seasonStart = phase.season.start_date;
        const seasonEnd = phase.season.end_date;
        if (!seasonStart || !seasonEnd) {
          nextPhaseTimingReason = 'Season start and end dates are required to qualify advancement.';
        } else {
          const timingStart = new Date(Math.max(
            Date.now(),
            phase.end_at?.getTime() ?? Date.now(),
          ));
          try {
            buildPhaseSequence({
              approvedFieldSize: preliminary.progression.advancementEligiblePlayerIds.length,
              seasonStart: timingStart,
              seasonEnd,
            });
          } catch (error) {
            nextPhaseTimingReason = error instanceof Error
              ? error.message
              : 'The next Phase cannot fit within the remaining season window.';
          }
        }
      }
      const assessment = assessPhaseCompletion({
        ...assessmentInput,
        nextPhaseTimingFeasible: nextPhaseTimingReason === null,
        nextPhaseTimingReason,
      });
      if (!assessment.ready) {
        throw new BadRequestException({
          message: 'Phase cannot be completed until every completion requirement is satisfied.',
          blockers: assessment.blockers,
        });
      }

      const completedAt = new Date();
      const updated = await tx.phase.updateMany({
        where: { id: phaseId, status: phase.status },
        data: { status: 'COMPLETED', completed_at: completedAt },
      });
      if (updated.count !== 1) {
        throw new BadRequestException('Phase state changed while completion was being finalized. Refresh and retry.');
      }
      await tx.auditLog.create({
        data: {
          entity_type: 'CompetitionPhase',
          entity_id: phaseId,
          action: 'PHASE_COMPLETION_FINALIZED',
          actor_id: actor.id,
          actor_role: actor.role,
          request_id: actor.requestId,
          before_state: { status: phase.status },
          after_state: {
            status: 'COMPLETED',
            completedAt: completedAt.toISOString(),
            advancementEligiblePlayerIds: assessment.progression.advancementEligiblePlayerIds,
            eliminatedPlayerIds: assessment.progression.participants
              .filter((participant) => participant.eliminations > 0)
              .map((participant) => participant.playerId),
            sourceSeriesIds: series.map((entry) => entry.id).sort(),
            unresolvedDisputeCount: unresolvedDisputes.length,
            unappliedPenaltyCount: pendingPenaltyEffects.length,
            nextPhaseTimingFeasible: true,
          },
        },
      });
      return {
        phaseId,
        status: 'COMPLETED',
        completedAt: completedAt.toISOString(),
        advancementEligiblePlayerIds: assessment.progression.advancementEligiblePlayerIds,
        progression: assessment.progression,
        nextPhaseTimingFeasible: true,
      };
    });
  }

  async adjustSchedule(seriesId: string, input: { matchWindowStartAt: string; reason?: string }, actor: AuditActor) {
    const result = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.series.findUnique({
        where: { id: seriesId },
        include: {
          season: true,
          phase: true,
          check_ins: true,
          games: { select: { game_number: true, home_player_id: true, away_player_id: true } },
        },
      });
      if (!existing) throw new NotFoundException('Series not found');
      if (existing.phase.schedule_locked) throw new BadRequestException('Locked Series schedules are read-only.');
      if (existing.check_ins.length > 0) throw new BadRequestException('A Series schedule cannot change after participant check-in has started.');
      if (!['DRAFT', 'SCHEDULED'].includes(existing.status)) throw new BadRequestException('Executed or resolved Series schedules cannot be adjusted.');
      const season = await tx.season.findUnique({ where: { id: existing.season_id }, include: workspaceInclude });
      if (!season) throw new NotFoundException('Season not found');
      const validationInput = getValidationInput(season);
      const adjusted = adjustSeriesAppointment({
        input: validationInput,
        seriesId,
        matchWindowStartAt: input.matchWindowStartAt,
      });
      const updated = await tx.series.update({
        where: { id: seriesId },
        data: {
          check_in_opens_at: new Date(adjusted.appointment.checkInOpensAt),
          check_in_closes_at: new Date(adjusted.appointment.checkInClosesAt),
          match_window_start: new Date(adjusted.appointment.matchWindowStartAt),
          match_window_end: new Date(adjusted.appointment.matchWindowEndAt),
          results_deadline_at: new Date(adjusted.appointment.resultsDeadlineAt),
          match_window_timezone: adjusted.appointment.timezone,
        },
      });
      await createCompetitionNotifications(tx, {
        playerIds: getParticipants(existing),
        eventType: 'SCHEDULE_CHANGED',
        eventKey: `schedule-changed:${seriesId}:${adjusted.appointment.matchWindowStartAt}`,
        title: 'Series schedule changed',
        message: `The Match Window for Series ${existing.series_number ?? seriesId} in Phase ${existing.phase.phase_number} has changed to ${adjusted.appointment.matchWindowStartAt}.`,
        relatedEntity: `Series:${seriesId}`,
      });
      return { updated, validation: adjusted.validation };
    });
    await this.auditService.writeLog({
      entityType: 'Series', entityId: seriesId, action: 'COMPETITION_SERIES_SCHEDULE_ADJUSTED',
      actorId: actor.id, actorRole: actor.role, requestId: actor.requestId,
      reason: input.reason, afterState: result.updated,
    });
    return result;
  }

  async lockSchedule(seasonId: string, actor: AuditActor) {
    const lockedPhases = await this.prisma.$transaction(async (tx) => {
      const season = await tx.season.findUnique({ where: { id: seasonId }, include: workspaceInclude });
      if (!season) throw new NotFoundException('Season not found');
      if (season.phases.length === 0) throw new BadRequestException('A schedule cannot be locked without canonical Phases.');
      if (getSeriesRows(season).length === 0) throw new BadRequestException('A schedule cannot be locked without Series.');
      const report = validateSeriesSchedule(getValidationInput(season));
      try {
        assertSeriesScheduleCanLock(report);
      } catch (error) {
        throw new BadRequestException(error instanceof Error ? error.message : 'Schedule validation failed.');
      }
      if (season.phases.some((phase) => phase.schedule_locked)) {
        throw new BadRequestException('Schedule is already locked.');
      }
      await tx.phase.updateMany({ where: { season_id: seasonId }, data: { schedule_locked: true } });
      await tx.auditLog.create({
        data: {
          entity_type: 'Season', entity_id: seasonId, action: 'COMPETITION_SCHEDULE_LOCKED',
          actor_id: actor.id, actor_role: actor.role, request_id: actor.requestId,
          after_state: { phaseIds: season.phases.map((phase) => phase.id) },
        },
      });
      return season.phases.map((phase) => phase.id);
    });
    return { scheduleLocked: true, phaseIds: lockedPhases };
  }
}