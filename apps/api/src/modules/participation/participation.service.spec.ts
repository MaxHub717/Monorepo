import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ParticipationService } from './participation.service.js';

const createPrismaMock = () => ({
  season: { findUnique: vi.fn() },
  division: { findUnique: vi.fn() },
  playerProfile: { findUnique: vi.fn() },
  divisionParticipant: {
    findUnique: vi.fn(),
    count: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    findMany: vi.fn(),
  },
  $transaction: vi.fn(),
});

const createOutboxMock = () => ({ enqueueEvent: vi.fn() });

describe('ParticipationService', () => {
  let service: ParticipationService;
  let prisma: ReturnType<typeof createPrismaMock>;
  let outbox: ReturnType<typeof createOutboxMock>;

  beforeEach(() => {
    prisma = createPrismaMock();
    outbox = createOutboxMock();
    service = new ParticipationService(prisma as any, outbox as any);
    prisma.$transaction.mockImplementation(async (callback: any) => callback(prisma));
  });

  it('registers a verified player during the registration window', async () => {
    prisma.season.findUnique.mockResolvedValue({ id: 'season-id', status: 'REGISTRATION_OPEN', registration_close_at: null });
    prisma.division.findUnique.mockResolvedValue({ id: 'division-id', season_id: 'season-id', active: true, capacity: null });
    prisma.playerProfile.findUnique.mockResolvedValue({
      id: 'player-id',
      user_id: 'user-id',
      verification_status: 'VERIFIED',
      player_status: 'REGISTERED',
    });
    prisma.divisionParticipant.findUnique.mockResolvedValue(null);
    prisma.divisionParticipant.create.mockResolvedValue({ id: 'participant-id' });
    outbox.enqueueEvent.mockResolvedValue({});

    const result = await service.register('season-id', 'division-id', { playerId: 'player-id' }, { id: 'user-id', role: 'PLAYER' });

    expect(result).toEqual({ id: 'participant-id' });
    expect(prisma.divisionParticipant.create).toHaveBeenCalledWith({
      data: {
        season_id: 'season-id',
        division_id: 'division-id',
        player_id: 'player-id',
        seed: undefined,
        status: 'ACTIVE',
      },
      include: { player: true, division: true },
    });
  });

  it('rejects an unverified player', async () => {
    prisma.season.findUnique.mockResolvedValue({ id: 'season-id', status: 'REGISTRATION_OPEN', registration_close_at: null });
    prisma.division.findUnique.mockResolvedValue({ id: 'division-id', season_id: 'season-id', active: true, capacity: null });
    prisma.playerProfile.findUnique.mockResolvedValue({
      id: 'player-id',
      user_id: 'user-id',
      verification_status: 'UNVERIFIED',
      player_status: 'REGISTERED',
    });

    await expect(
      service.register('season-id', 'division-id', { playerId: 'player-id' }, { id: 'user-id', role: 'PLAYER' }),
    ).rejects.toThrow('Player must be verified before entering a season');
  });

  it('allows an eligible player to withdraw before the roster is locked', async () => {
    prisma.divisionParticipant.findUnique.mockResolvedValue({
      id: 'participant-id',
      status: 'ACTIVE',
      season: { status: 'REGISTRATION_CLOSED' },
      player: { user_id: 'user-id' },
    });
    prisma.divisionParticipant.update.mockResolvedValue({ id: 'participant-id', status: 'WITHDRAWN' });
    outbox.enqueueEvent.mockResolvedValue({});

    const result = await service.withdraw('season-id', 'player-id', { id: 'user-id', role: 'PLAYER' });

    expect(result).toEqual({ id: 'participant-id', status: 'WITHDRAWN' });
    expect(prisma.divisionParticipant.update).toHaveBeenCalledWith({
      where: { id: 'participant-id' },
      data: { status: 'WITHDRAWN', withdrawn_at: expect.any(Date) },
    });
  });
});
