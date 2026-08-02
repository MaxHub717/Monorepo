import { describe, expect, it, vi, beforeEach } from 'vitest';
import { MatchService, CreateMatchDto, SubmitMatchResultDto } from './match.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { OutboxService } from '../events/outbox.service.js';

const createPrismaMock = () => ({
  match: { create: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
  fixture: { create: vi.fn() },
  matchParticipant: { createMany: vi.fn() },
  matchResult: { create: vi.fn(), update: vi.fn() },
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
  });

  it('creates a match and enqueues a match.created outbox event', async () => {
    const dto: CreateMatchDto = {
      seasonId: 'season-id',
      divisionId: 'division-id',
      homeClubId: 'home-id',
      awayClubId: 'away-id',
    };
    const fixture = { id: 'fixture-id' };
    const match = { id: 'match-id' };

    prismaMock.$transaction.mockImplementation(async (callback: any) => callback(prismaMock));
    prismaMock.fixture.create.mockResolvedValue(fixture);
    prismaMock.match.create.mockResolvedValue(match);
    prismaMock.matchParticipant.createMany.mockResolvedValue(undefined);
    outboxMock.enqueueEvent.mockResolvedValue({});

    const result = await matchService.createMatch(dto);
    expect(result).toEqual(match);
    expect(outboxMock.enqueueEvent).toHaveBeenCalledWith(prismaMock, expect.objectContaining({
      eventName: 'match.created',
      aggregateType: 'Match',
      aggregateId: match.id,
    }));
  });

  it('throws when home and away clubs are the same', async () => {
    const dto: CreateMatchDto = {
      seasonId: 'season-id',
      divisionId: 'division-id',
      homeClubId: 'same-id',
      awayClubId: 'same-id',
    };

    await expect(matchService.createMatch(dto)).rejects.toThrow('Home and away clubs must be different');
  });

  it('submits match results and enqueues a match.result.submitted outbox event', async () => {
    const dto: SubmitMatchResultDto = {
      matchId: 'match-id',
      homeScore: 2,
      awayScore: 1,
      submittedById: 'user-id',
    };
    const match = { id: 'match-id', status: 'SCHEDULED', fixture: { home_club_id: 'home-id', away_club_id: 'away-id' } };
    const resultCreate = { id: 'result-id' };
    const updatedMatch = { id: 'match-id', status: 'SUBMISSION_PENDING' };

    prismaMock.match.findUnique.mockResolvedValue(match);
    prismaMock.$transaction.mockImplementation(async (callback: any) => callback(prismaMock));
    prismaMock.matchResult.create.mockResolvedValue(resultCreate);
    prismaMock.match.update.mockResolvedValue(updatedMatch);
    outboxMock.enqueueEvent.mockResolvedValue({});

    const result = await matchService.submitMatchResult(dto);
    expect(result).toEqual({ result: resultCreate, match: updatedMatch });
    expect(outboxMock.enqueueEvent).toHaveBeenCalledWith(prismaMock, expect.objectContaining({
      eventName: 'match.result.submitted',
      aggregateType: 'Match',
      aggregateId: match.id,
    }));
  });
});
