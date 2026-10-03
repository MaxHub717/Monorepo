import { describe, expect, it, vi, beforeEach } from 'vitest';
import { MatchService, CreateMatchDto, SubmitMatchResultDto } from './match.service.js';

const createPrismaMock = () => ({
  season: { findUnique: vi.fn() },
  division: { findUnique: vi.fn() },
  matchWeek: { findUnique: vi.fn() },
  divisionParticipant: { findMany: vi.fn() },
  clubMember: { findFirst: vi.fn() },
  match: { create: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
  matchStatusTransition: { create: vi.fn() },
  fixture: { create: vi.fn(), findFirst: vi.fn() },
  matchParticipant: { createMany: vi.fn() },
  matchResult: { create: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
  $transaction: vi.fn(),
});

const createOutboxMock = () => ({ enqueueEvent: vi.fn() });

describe('MatchService', () => {
  let matchService: MatchService;
  let prismaMock: ReturnType<typeof createPrismaMock>;
  let outboxMock: ReturnType<typeof createOutboxMock>;

  beforeEach(() => {
    prismaMock = createPrismaMock();
    outboxMock = createOutboxMock();
    matchService = new MatchService(prismaMock as any, outboxMock as any);
    prismaMock.$transaction.mockImplementation(async (callback: any) => callback(prismaMock));
  });

  it('creates a player-vs-player match and enqueues a match.created event', async () => {
    prismaMock.season.findUnique.mockResolvedValue({ id: 'season-id', status: 'ACTIVE' });
    prismaMock.division.findUnique.mockResolvedValue({ id: 'division-id', season_id: 'season-id', active: true });
    prismaMock.divisionParticipant.findMany.mockResolvedValue([
      { player_id: 'home-id', division_id: 'division-id', status: 'ACTIVE' },
      { player_id: 'away-id', division_id: 'division-id', status: 'ACTIVE' },
    ]);
    prismaMock.fixture.create.mockResolvedValue({ id: 'fixture-id' });
    prismaMock.fixture.findFirst.mockResolvedValue(null);
    prismaMock.match.create.mockResolvedValue({ id: 'match-id' });
    prismaMock.matchParticipant.createMany.mockResolvedValue(undefined);
    outboxMock.enqueueEvent.mockResolvedValue({});

    const dto: CreateMatchDto = {
      seasonId: 'season-id',
      divisionId: 'division-id',
      homePlayerId: 'home-id',
      awayPlayerId: 'away-id',
    };

    const result = await matchService.createMatch(dto);
    expect(result).toEqual({ id: 'match-id' });
    expect(prismaMock.matchParticipant.createMany).toHaveBeenCalledWith({
      data: [
        { match_id: 'match-id', player_id: 'home-id', role: 'HOME' },
        { match_id: 'match-id', player_id: 'away-id', role: 'AWAY' },
      ],
    });
    expect(outboxMock.enqueueEvent).toHaveBeenCalledWith(
      prismaMock,
      expect.objectContaining({ eventName: 'match.created', aggregateType: 'Match' }),
    );
  });

  it('throws when home and away players are the same', async () => {
    const dto: CreateMatchDto = {
      seasonId: 'season-id',
      divisionId: 'division-id',
      homePlayerId: 'same-id',
      awayPlayerId: 'same-id',
    };

    await expect(matchService.createMatch(dto)).rejects.toThrow('Home and away players must be different');
  });

  const buildMatch = () => ({
    id: 'match-id',
    status: 'IN_PROGRESS',
    division_id: 'division-id',
    fixture: {
      home_player_id: 'home-id',
      away_player_id: 'away-id',
      home_player: { user_id: 'home-user-id' },
      away_player: { user_id: 'away-user-id' },
    },
    result: null,
  });

  it('allows a match participant to submit a result and records the authenticated actor', async () => {
    prismaMock.match.findUnique.mockResolvedValue(buildMatch());
    prismaMock.matchResult.create.mockResolvedValue({ id: 'result-id' });
    prismaMock.matchResult.findUnique.mockResolvedValue({ id: 'result-id' });
    prismaMock.match.update.mockImplementation(async ({ data }: any) => ({ id: 'match-id', ...data }));
    outboxMock.enqueueEvent.mockResolvedValue({});

    const dto: SubmitMatchResultDto = {
      matchId: 'match-id',
      homeScore: 2,
      awayScore: 1,
    };

    const result = await matchService.submitMatchResult(dto, {
      id: 'home-user-id',
      roles: ['PLAYER'],
    });

    expect(result).toEqual({
      result: { id: 'result-id' },
      match: { id: 'match-id', status: 'RESULT_SUBMITTED' },
    });
    expect(prismaMock.matchResult.create).toHaveBeenCalledWith({
      data: {
        match_id: 'match-id',
        home_score: 2,
        away_score: 1,
        winner_player_id: 'home-id',
      },
    });
    expect(outboxMock.enqueueEvent).toHaveBeenCalledWith(
      prismaMock,
      expect.objectContaining({
        eventName: 'match.result.submitted',
        actorId: 'home-user-id',
        metadata: expect.objectContaining({ submittedBy: 'home-user-id' }),
      }),
    );
  });

  it('allows an operator to submit a result', async () => {
    prismaMock.match.findUnique.mockResolvedValue(buildMatch());
    prismaMock.matchResult.create.mockResolvedValue({ id: 'result-id' });
    prismaMock.matchResult.findUnique.mockResolvedValue({ id: 'result-id' });
    prismaMock.match.update.mockImplementation(async ({ data }: any) => ({ id: 'match-id', ...data }));
    outboxMock.enqueueEvent.mockResolvedValue({});

    const result = await matchService.submitMatchResult(
      { matchId: 'match-id', homeScore: 2, awayScore: 1 },
      { id: 'operator-user-id', roles: ['OPERATOR'], operatorProfile: { assigned_division_id: 'division-id' } },
    );

    expect(result.match.status).toBe('RESULT_SUBMITTED');
    expect(outboxMock.enqueueEvent).toHaveBeenCalledWith(
      prismaMock,
      expect.objectContaining({ actorId: 'operator-user-id' }),
    );
  });

  it('allows a club manager to submit a result for a player in their active club', async () => {
    prismaMock.match.findUnique.mockResolvedValue(buildMatch());
    prismaMock.clubMember.findFirst.mockResolvedValue({ id: 'manager-membership-id' });
    prismaMock.matchResult.create.mockResolvedValue({ id: 'result-id' });
    prismaMock.matchResult.findUnique.mockResolvedValue({ id: 'result-id' });
    prismaMock.match.update.mockImplementation(async ({ data }: any) => ({ id: 'match-id', ...data }));
    outboxMock.enqueueEvent.mockResolvedValue({});

    const result = await matchService.submitMatchResult(
      { matchId: 'match-id', homeScore: 0, awayScore: 0 },
      { id: 'manager-user-id', roles: ['CLUB_MANAGER'] },
    );

    expect(result.match.status).toBe('RESULT_SUBMITTED');
    expect(prismaMock.clubMember.findFirst).toHaveBeenCalled();
  });

  it('records a valid transition with actor, timestamp, and outbox event', async () => {
    const checkInOpensAt = new Date(Date.now() - 60_000);
    const checkInClosesAt = new Date(Date.now() + 60 * 60_000);
    prismaMock.match.findUnique.mockResolvedValue({
      id: 'match-id',
      division_id: 'division-id',
      status: 'SCHEDULED',
      fixture: { check_in_opens_at: checkInOpensAt, check_in_closes_at: checkInClosesAt },
      result: null,
    });
    prismaMock.match.update.mockImplementation(async ({ data }: any) => ({ id: 'match-id', ...data }));
    outboxMock.enqueueEvent.mockResolvedValue({});

    const result = await matchService.transitionMatch(
      'match-id',
      'CHECK_IN_OPEN' as any,
      { id: 'operator-id', roles: ['OPERATOR'], operatorProfile: { assigned_division_id: 'division-id' } },
    );

    expect(result.status).toBe('CHECK_IN_OPEN');
    expect(prismaMock.matchStatusTransition.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        match_id: 'match-id',
        from_status: 'SCHEDULED',
        to_status: 'CHECK_IN_OPEN',
        actor_id: 'operator-id',
        transitioned_at: expect.any(Date),
      }),
    });
    expect(outboxMock.enqueueEvent).toHaveBeenCalledWith(
      prismaMock,
      expect.objectContaining({ eventName: 'match.status.transitioned', actorId: 'operator-id' }),
    );
  });

  it('rejects an invalid transition and an Operator outside the match division', async () => {
    prismaMock.match.findUnique.mockResolvedValue({
      id: 'match-id',
      division_id: 'division-id',
      status: 'SCHEDULED',
      fixture: {},
      result: null,
    });

    await expect(matchService.transitionMatch('match-id', 'IN_PROGRESS' as any, {
      id: 'hq-id',
      roles: ['HQ_ADMIN'],
    })).rejects.toThrow('Invalid match transition from SCHEDULED to IN_PROGRESS');
    await expect(matchService.transitionMatch('match-id', 'CANCELLED' as any, {
      id: 'operator-id',
      roles: ['OPERATOR'],
      operatorProfile: { assigned_division_id: 'other-division' },
    }, 'Cancelled by operator')).rejects.toThrow('outside the assigned division');

    expect(prismaMock.match.update).not.toHaveBeenCalled();
    expect(prismaMock.matchStatusTransition.create).not.toHaveBeenCalled();
  });

  it('completes a result through the state machine with an actor-attributed transition', async () => {
    prismaMock.match.findUnique.mockResolvedValue({
      id: 'match-id',
      division_id: 'division-id',
      status: 'RESULT_SUBMITTED',
      result: { id: 'result-id', confirmed_at: null },
    });
    prismaMock.matchResult.update.mockResolvedValue({ id: 'result-id', confirmed_at: new Date() });
    prismaMock.match.update.mockImplementation(async ({ data }: any) => ({ id: 'match-id', ...data }));
    outboxMock.enqueueEvent.mockResolvedValue({});

    const result = await matchService.confirmMatchResult('match-id', {
      id: 'commissioner-id',
      roles: ['COMMISSIONER'],
      correlationId: 'request-id',
    });

    expect(result.match.status).toBe('COMPLETED');
    expect(prismaMock.matchStatusTransition.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        from_status: 'RESULT_SUBMITTED',
        to_status: 'COMPLETED',
        actor_id: 'commissioner-id',
        correlation_id: 'request-id',
        transitioned_at: expect.any(Date),
      }),
    });
    expect(outboxMock.enqueueEvent).toHaveBeenCalledWith(
      prismaMock,
      expect.objectContaining({ eventName: 'match.result.confirmed', actorId: 'commissioner-id' }),
    );
  });

  it('rejects an authenticated user who is not a participant or authorized staff member', async () => {
    prismaMock.match.findUnique.mockResolvedValue(buildMatch());
    prismaMock.clubMember.findFirst.mockResolvedValue(null);

    await expect(
      matchService.submitMatchResult(
        { matchId: 'match-id', homeScore: 2, awayScore: 1 },
        { id: 'attacker-user-id', roles: ['PLAYER'] },
      ),
    ).rejects.toThrow('Only match participants, their club manager, or an operator may submit a match result');

    expect(prismaMock.matchResult.create).not.toHaveBeenCalled();
    expect(prismaMock.match.update).not.toHaveBeenCalled();
  });
});
