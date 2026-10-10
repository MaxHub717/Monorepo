import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';

export type CompetitionNotificationType =
  | 'SERIES_SCHEDULED'
  | 'SCHEDULE_CHANGED'
  | 'CHECK_IN_OPENED'
  | 'CHECK_IN_CLOSING'
  | 'MATCH_WINDOW_OPENED'
  | 'RESULTS_DEADLINE_APPROACHING'
  | 'RESULT_SUBMITTED'
  | 'SERIES_RESOLVED'
  | 'PLAYER_ELIMINATED'
  | 'PLAYER_ADVANCED'
  | 'NEXT_PHASE_GENERATED'
  | 'DISPUTE_OPENED'
  | 'DISPUTE_RESOLVED'
  | 'SEASON_COMPLETED';

const CRITICAL_EVENTS = new Set<CompetitionNotificationType>([
  'RESULT_SUBMITTED',
  'SERIES_RESOLVED',
  'PLAYER_ELIMINATED',
  'PLAYER_ADVANCED',
  'NEXT_PHASE_GENERATED',
  'DISPUTE_OPENED',
  'DISPUTE_RESOLVED',
  'SEASON_COMPLETED',
]);

export interface CompetitionNotificationInput {
  playerIds: string[];
  eventType: CompetitionNotificationType;
  eventKey: string;
  title: string;
  message: string;
  relatedEntity: string;
}

function jsonStringArray(value: Prisma.JsonValue | null | undefined): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string');
}

export async function createCompetitionNotifications(
  tx: Prisma.TransactionClient,
  input: CompetitionNotificationInput,
) {
  const playerIds = [...new Set(input.playerIds)];
  if (playerIds.length === 0) return { delivered: 0 };

  const profiles = await tx.playerProfile.findMany({
    where: { id: { in: playerIds } },
    select: { id: true, user_id: true },
  });
  const userIds = profiles.map((profile) => profile.user_id);
  const preferences = await tx.notificationPreference.findMany({
    where: { user_id: { in: userIds } },
    select: { user_id: true, competition_enabled: true },
  });
  const competitionEnabled = new Map(preferences.map((preference) => [
    preference.user_id,
    preference.competition_enabled,
  ]));
  const critical = CRITICAL_EVENTS.has(input.eventType);
  let delivered = 0;

  for (const profile of profiles) {
    if (!critical && competitionEnabled.get(profile.user_id) === false) continue;

    const eventKey = `${input.eventKey}:${profile.user_id}`;
    const inserted = await tx.notification.createMany({
      data: [{
        user_id: profile.user_id,
        title: input.title,
        message: input.message,
        category: 'COMPETITION',
        event_type: input.eventType,
        event_key: eventKey,
        priority: critical ? 'CRITICAL' : 'NORMAL',
        related_entity: input.relatedEntity,
      }],
      skipDuplicates: true,
    });
    if (inserted.count === 0) continue;

    await tx.auditLog.create({
      data: {
        entity_type: 'Notification',
        entity_id: eventKey,
        action: 'COMPETITION_NOTIFICATION_DELIVERED',
        after_state: {
          eventType: input.eventType,
          priority: critical ? 'CRITICAL' : 'NORMAL',
          userId: profile.user_id,
          relatedEntity: input.relatedEntity,
        },
      },
    });
    delivered += 1;
  }

  return { delivered };
}

@Injectable()
export class NotificationService {
  constructor(private readonly prisma: PrismaService) {}

  async listNotifications(userId?: string) {
    if (!userId) return [];
    return this.prisma.notification.findMany({
      where: { user_id: userId },
      orderBy: { created_at: 'desc' },
    });
  }

  async markAllRead(userId?: string) {
    if (!userId) return { updated: 0 };
    const res = await this.prisma.notification.updateMany({
      where: { user_id: userId, read: false },
      data: { read: true },
    });
    return { updated: res.count };
  }

  async getPreferences(userId: string) {
    const preferences = await this.prisma.notificationPreference.findUnique({
      where: { user_id: userId },
      select: { competition_enabled: true },
    });
    return { competitionEnabled: preferences?.competition_enabled ?? true };
  }

  async updatePreferences(userId: string, competitionEnabled: boolean) {
    const preferences = await this.prisma.notificationPreference.upsert({
      where: { user_id: userId },
      create: { user_id: userId, competition_enabled: competitionEnabled },
      update: { competition_enabled: competitionEnabled },
      select: { competition_enabled: true },
    });
    return { competitionEnabled: preferences.competition_enabled };
  }

  async createNotification(
    data: { userId: string; title: string; message: string; category?: string; relatedEntity?: string },
    tx?: Prisma.TransactionClient,
  ) {
    const client = tx ?? this.prisma;
    return client.notification.create({
      data: {
        user_id: data.userId,
        title: data.title,
        message: data.message,
        category: data.category ?? null,
        related_entity: data.relatedEntity ?? null,
      },
    });
  }

  @Cron(CronExpression.EVERY_MINUTE)
  async dispatchScheduledCompetitionNotifications() {
    const now = new Date();
    const closingSoon = new Date(now.getTime() + 15 * 60 * 1000);
    const deadlineSoon = new Date(now.getTime() + 60 * 60 * 1000);
    let cursor: string | undefined;
    let batch: Array<{
      id: string;
      phase_id: string;
      participant_player_ids: Prisma.JsonValue;
      series_number: number | null;
      status: string;
      check_in_opens_at: Date | null;
      check_in_closes_at: Date | null;
      match_window_start: Date | null;
      match_window_end: Date | null;
      results_deadline_at: Date | null;
      phase: { phase_number: number; name: string | null };
      season: { name: string };
    }>;

    do {
      batch = await this.prisma.series.findMany({
        where: {
          status: { in: ['SCHEDULED', 'IN_PROGRESS'] },
          phase: { schedule_locked: true },
          OR: [
            { status: 'SCHEDULED', check_in_opens_at: { lte: now }, check_in_closes_at: { gt: now } },
            { status: 'SCHEDULED', check_in_closes_at: { gt: now, lte: closingSoon } },
            { match_window_start: { lte: now }, match_window_end: { gt: now } },
            { results_deadline_at: { gt: now, lte: deadlineSoon } },
          ],
        },
        select: {
          id: true,
          phase_id: true,
          participant_player_ids: true,
          series_number: true,
          status: true,
          check_in_opens_at: true,
          check_in_closes_at: true,
          match_window_start: true,
          match_window_end: true,
          results_deadline_at: true,
          phase: { select: { phase_number: true, name: true } },
          season: { select: { name: true } },
        },
        orderBy: { id: 'asc' },
        take: 250,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      });

      for (const series of batch) {
        const playerIds = jsonStringArray(series.participant_player_ids);
        const phaseName = series.phase.name ?? `Phase ${series.phase.phase_number}`;
        const seriesName = `Series ${series.series_number ?? series.id}`;
        const baseKey = (type: CompetitionNotificationType, at: Date | null) =>
          `${type}:${series.id}:${at?.toISOString() ?? 'unscheduled'}`;
        const send = async (
          eventType: CompetitionNotificationType,
          at: Date | null,
          title: string,
          message: string,
        ) => {
          if (!at) return;
          await this.prisma.$transaction((tx) => createCompetitionNotifications(tx, {
            playerIds,
            eventType,
            eventKey: baseKey(eventType, at),
            title,
            message,
            relatedEntity: `Series:${series.id}`,
          }));
        };

        if (series.status === 'SCHEDULED'
          && series.check_in_opens_at && series.check_in_closes_at
          && series.check_in_opens_at <= now && series.check_in_closes_at > now) {
          await send('CHECK_IN_OPENED', series.check_in_opens_at, 'Series check-in is open',
            `Check-in for ${seriesName} in ${phaseName} is now open in ${series.season.name}.`);
        }
        if (series.status === 'SCHEDULED'
          && series.check_in_closes_at && series.check_in_closes_at > now
          && series.check_in_closes_at <= closingSoon) {
          await send('CHECK_IN_CLOSING', series.check_in_closes_at, 'Series check-in is closing soon',
            `Check-in for ${seriesName} in ${phaseName} closes at ${series.check_in_closes_at.toISOString()}.`);
        }
        if (series.match_window_start && series.match_window_end
          && series.match_window_start <= now && series.match_window_end > now) {
          await send('MATCH_WINDOW_OPENED', series.match_window_start, 'Series Match Window is open',
            `The Match Window for ${seriesName} in ${phaseName} is now open in ${series.season.name}.`);
        }
        if (series.results_deadline_at && series.results_deadline_at > now
          && series.results_deadline_at <= deadlineSoon) {
          await send('RESULTS_DEADLINE_APPROACHING', series.results_deadline_at, 'Series results deadline is approaching',
            `Submit the results for ${seriesName} in ${phaseName} by ${series.results_deadline_at.toISOString()}.`);
        }
      }
      cursor = batch.length === 250 ? batch[batch.length - 1]?.id : undefined;
    } while (cursor);
  }
}
