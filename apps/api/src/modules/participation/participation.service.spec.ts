import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ParticipationService } from './participation.service.js';
import { AdminParticipationService } from './admin-participation.service.js';

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

  it('rejects registration when the season is closed', async () => {
    prisma.season.findUnique.mockResolvedValue({ id: 'season-id', status: 'REGISTRATION_CLOSED', registration_close_at: null });

    await expect(service.register('season-id', 'division-id', { playerId: 'player-id' }, { id: 'user-id', role: 'PLAYER' }))
      .rejects.toThrow('Player registration is not open for this season');
  });

  it('rejects a division that does not belong to the selected season', async () => {
    prisma.season.findUnique.mockResolvedValue({ id: 'season-id', status: 'REGISTRATION_OPEN', registration_close_at: null });
    prisma.division.findUnique.mockResolvedValue({ id: 'division-id', season_id: 'another-season', active: true, registration_capacity: null });

    await expect(service.register('season-id', 'division-id', { playerId: 'player-id' }, { id: 'user-id', role: 'PLAYER' }))
      .rejects.toThrow('Division is not active in this season');
  });

  it('rejects duplicate registrations for the same active division', async () => {
    prisma.season.findUnique.mockResolvedValue({ id: 'season-id', status: 'REGISTRATION_OPEN', registration_close_at: null });
    prisma.division.findUnique.mockResolvedValue({ id: 'division-id', season_id: 'season-id', active: true, registration_capacity: null });
    prisma.playerProfile.findUnique.mockResolvedValue({ id: 'player-id', user_id: 'user-id', verification_status: 'VERIFIED', player_status: 'REGISTERED' });
    prisma.divisionParticipant.findUnique.mockResolvedValue({ id: 'participant-id', division_id: 'division-id', status: 'ACTIVE' });

    await expect(service.register('season-id', 'division-id', { playerId: 'player-id' }, { id: 'user-id', role: 'PLAYER' }))
      .rejects.toThrow('Player is already registered in this division');
  });

  it('rejects registration when active participants fill the division', async () => {
    prisma.season.findUnique.mockResolvedValue({ id: 'season-id', status: 'REGISTRATION_OPEN', registration_close_at: null });
    prisma.division.findUnique.mockResolvedValue({ id: 'division-id', season_id: 'season-id', active: true, registration_capacity: 2 });
    prisma.playerProfile.findUnique.mockResolvedValue({ id: 'player-id', user_id: 'user-id', verification_status: 'VERIFIED', player_status: 'REGISTERED' });
    prisma.divisionParticipant.findUnique.mockResolvedValue(null);
    prisma.divisionParticipant.count.mockResolvedValue(2);

    await expect(service.register('season-id', 'division-id', { playerId: 'player-id' }, { id: 'user-id', role: 'PLAYER' }))
      .rejects.toThrow('Division has reached its registration capacity');
    expect(prisma.divisionParticipant.count).toHaveBeenCalledWith({
      where: { division_id: 'division-id', status: 'ACTIVE' },
    });
  });

  it('rechecks capacity before reactivating a withdrawn registration', async () => {
    prisma.season.findUnique.mockResolvedValue({ id: 'season-id', status: 'REGISTRATION_OPEN', registration_close_at: null });
    prisma.division.findUnique.mockResolvedValue({ id: 'division-id', season_id: 'season-id', active: true, registration_capacity: 2 });
    prisma.playerProfile.findUnique.mockResolvedValue({ id: 'player-id', user_id: 'user-id', verification_status: 'VERIFIED', player_status: 'REGISTERED' });
    prisma.divisionParticipant.findUnique.mockResolvedValue({ id: 'participant-id', division_id: 'division-id', status: 'WITHDRAWN' });
    prisma.divisionParticipant.count.mockResolvedValue(2);

    await expect(service.register('season-id', 'division-id', { playerId: 'player-id' }, { id: 'user-id', role: 'PLAYER' }))
      .rejects.toThrow('Division has reached its registration capacity');
    expect(prisma.divisionParticipant.update).not.toHaveBeenCalled();
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

  it('resolves the authenticated player identity for self-registration', async () => {
    prisma.season.findUnique.mockResolvedValue({ id: 'season-id', status: 'REGISTRATION_OPEN', registration_close_at: null });
    prisma.division.findUnique.mockResolvedValue({ id: 'division-id', season_id: 'season-id', active: true, registration_capacity: null, capacity: null });
    prisma.playerProfile.findUnique.mockResolvedValue({
      id: 'player-id',
      user_id: 'user-id',
      verification_status: 'VERIFIED',
      player_status: 'REGISTERED',
    });
    prisma.divisionParticipant.findUnique.mockResolvedValue(null);
    prisma.divisionParticipant.count.mockResolvedValue(0);
    prisma.divisionParticipant.create.mockResolvedValue({ id: 'participant-id', player: { id: 'player-id' }, division: { id: 'division-id' } });
    outbox.enqueueEvent.mockResolvedValue({});

    const result = await service.registerForUser('season-id', 'division-id', 'user-id', undefined, { id: 'user-id', role: 'PLAYER' });

    expect(prisma.playerProfile.findUnique).toHaveBeenCalledWith({
      where: { user_id: 'user-id' },
      select: { id: true },
    });
    expect(prisma.divisionParticipant.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        season_id: 'season-id',
        division_id: 'division-id',
        player_id: 'player-id',
        status: 'ACTIVE',
      }),
    }));
    expect(result).toEqual({ id: 'participant-id', player: { id: 'player-id' }, division: { id: 'division-id' } });
  });

  it('makes the same confirmed participant record visible to the admin participant list', async () => {
    const participant = {
      id: 'participant-shared',
      season_id: 'season-id',
      division_id: 'division-id',
      player_id: 'player-id',
      status: 'ACTIVE',
      player: { id: 'player-id', gamer_tag: 'VerifiedPlayer' },
      division: { id: 'division-id', name: 'Division One' },
    };
    prisma.season.findUnique.mockResolvedValue({ id: 'season-id', status: 'REGISTRATION_OPEN', registration_close_at: null });
    prisma.division.findUnique.mockResolvedValue({ id: 'division-id', season_id: 'season-id', active: true, registration_capacity: null });
    prisma.playerProfile.findUnique.mockResolvedValue({
      id: 'player-id',
      user_id: 'user-id',
      verification_status: 'VERIFIED',
      player_status: 'REGISTERED',
    });
    prisma.divisionParticipant.findUnique.mockResolvedValue(null);
    prisma.divisionParticipant.create.mockResolvedValue(participant);
    prisma.divisionParticipant.findMany.mockResolvedValue([participant]);
    outbox.enqueueEvent.mockResolvedValue({});

    const registered = await service.registerForUser('season-id', 'division-id', 'user-id', undefined, { id: 'user-id', role: 'PLAYER' });
    const gamerRegistrations = await service.listForUser('user-id');
    const adminService = new AdminParticipationService(prisma as any, outbox as any, {} as any);
    const adminParticipants = await adminService.listParticipants('season-id');

    expect(registered.id).toBe('participant-shared');
    expect(gamerRegistrations).toEqual([participant]);
    expect(prisma.divisionParticipant.findMany).toHaveBeenNthCalledWith(1, expect.objectContaining({ where: { player_id: 'player-id' } }));
    expect(adminParticipants).toEqual([participant]);
    expect(prisma.divisionParticipant.findMany).toHaveBeenNthCalledWith(2, expect.objectContaining({ where: { season_id: 'season-id' } }));
  });

  it('rejects attempts to register another player profile through the authenticated self route', async () => {
    prisma.playerProfile.findUnique.mockResolvedValue({ id: 'player-id', user_id: 'other-user-id', verification_status: 'VERIFIED', player_status: 'REGISTERED' });

    await expect(
      service.registerForUser('season-id', 'division-id', 'user-id', undefined, { id: 'user-id', role: 'PLAYER' }),
    ).rejects.toThrow('Players may only register themselves');
  });
});
