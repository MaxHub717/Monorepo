import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';

const activeSeasonStatuses = ['REGISTRATION_OPEN', 'REGISTRATION_CLOSED', 'ROSTER_LOCKED', 'ACTIVE', 'PLAYOFFS'] as const;
const unresolvedDisputeStatuses = ['SUBMITTED', 'UNDER_REVIEW', 'ESCALATED'] as const;
const pendingPenaltyStatuses = ['PROPOSED', 'UNDER_REVIEW', 'APPROVED'] as const;
const pendingResultStatuses = ['SUBMISSION_PENDING', 'UNDER_REVIEW'] as const;
const activeMatchStatuses = ['CHECK_IN_OPEN', 'CHECK_IN_CLOSED', 'IN_PROGRESS'] as const;

@Injectable()
export class AdminDashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async getOverview() {
    const [activeSeasons, registrationOpen, participantCount, fixtureCount, pendingResults, activeMatches, openDisputes, pendingPenalties, recentAudit] = await Promise.all([
      this.prisma.season.findMany({
        where: { status: { in: [...activeSeasonStatuses] } },
        include: {
          divisions: {
            where: { active: true },
            include: { participants: { where: { status: 'ACTIVE' }, select: { id: true } } },
          },
          _count: { select: { matches: true, participants: true } },
        },
        orderBy: [{ status: 'asc' }, { start_date: 'asc' }],
      }),
      this.prisma.season.count({ where: { status: 'REGISTRATION_OPEN' } }),
      this.prisma.divisionParticipant.count({ where: { status: 'ACTIVE' } }),
      this.prisma.fixture.count(),
      this.prisma.match.count({ where: { status: { in: [...pendingResultStatuses] } } }),
      this.prisma.match.count({ where: { status: { in: [...activeMatchStatuses] } } }),
      this.prisma.dispute.count({ where: { status: { in: [...unresolvedDisputeStatuses] } } }),
      this.prisma.penalty.count({ where: { status: { in: [...pendingPenaltyStatuses] } } }),
      this.prisma.auditLog.findMany({
        take: 8,
        orderBy: { created_at: 'desc' },
        select: { id: true, entity_type: true, entity_id: true, action: true, actor_role: true, created_at: true },
      }),
    ]);

    const closedRegistrationSeasons = activeSeasons.filter((season) => season.status === 'REGISTRATION_CLOSED').length;
    const alerts = [
      ...(pendingResults > 0 ? [{ type: 'RESULTS', title: 'Results awaiting verification', count: pendingResults, href: '/results' }] : []),
      ...(openDisputes > 0 ? [{ type: 'DISPUTES', title: 'Disputes need review', count: openDisputes, href: '/disputes' }] : []),
      ...(pendingPenalties > 0 ? [{ type: 'PENALTIES', title: 'Penalties need a decision', count: pendingPenalties, href: '/penalties' }] : []),
      ...(closedRegistrationSeasons > 0 ? [{ type: 'ROSTER', title: 'Seasons are ready for roster review', count: closedRegistrationSeasons, href: '/seasons' }] : []),
    ];

    return {
      metrics: { activeSeasons: activeSeasons.length, registrationOpen, participants: participantCount, fixtures: fixtureCount, pendingResults, activeMatches, openDisputes, pendingPenalties },
      activeSeasons: activeSeasons.map((season) => ({
        id: season.id,
        name: season.name,
        status: season.status,
        startDate: season.start_date,
        endDate: season.end_date,
        participantCount: season._count.participants,
        matchCount: season._count.matches,
        divisionCount: season.divisions.length,
      })),
      alerts,
      recentActivity: recentAudit,
    };
  }
}