import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import PlayerDashboardContent from './player-dashboard-content';

const mockProfile = {
  id: 'player-123',
  gamer_tag: 'AlphaStriker',
  region: 'NA',
  verification_status: 'VERIFIED',
  player_status: 'REGISTERED',
  reputation_score: 100,
  wins: 12,
  losses: 4,
  draws: 1,
  goals: 9,
  no_shows: 0,
  mvp_count: 2,
  classification: 'AMATEUR',
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

const mockOpenSeason = {
  id: 'season-1',
  name: 'Spring Championship',
  description: 'A real season opened by an administrator.',
  status: 'REGISTRATION_OPEN' as const,
  startDate: '2026-01-15T00:00:00.000Z',
  endDate: '2026-03-15T00:00:00.000Z',
  registrationOpenAt: '2025-12-15T00:00:00.000Z',
  registrationCloseAt: '2026-01-30T00:00:00.000Z',
  timezone: 'UTC',
  league: { id: 'league-1', name: 'North American League' },
  rules: {
    available: true,
    name: 'Spring Championship Rules',
    version: '1.0.0',
    hash: 'abc123',
    playerFacing: {
      name: 'Spring Championship Rules',
      version: '1.0.0',
      sections: [
        { title: 'Eligibility', items: ['Verified players only', 'No inactive accounts'] },
        { title: 'Participation', items: ['Active registration is required'] },
      ],
    },
  },
  divisions: [
    {
      id: 'division-1',
      name: 'Division One',
      type: 'COMPETITIVE',
      capacity: null,
      registrationCapacity: null,
      registrationCount: 4,
      availableSlots: null,
    },
  ],
};

const mockPublicSeason = {
  id: 'season-1',
  name: 'Spring Championship',
  description: 'A public season.',
  status: 'REGISTRATION_OPEN',
  startDate: '2026-01-15T00:00:00.000Z',
  endDate: '2026-03-15T00:00:00.000Z',
  registrationOpenAt: '2025-12-15T00:00:00.000Z',
  registrationCloseAt: '2026-01-30T00:00:00.000Z',
  timezone: 'UTC',
  league: { id: 'league-1', name: 'North American League' },
  divisions: [{ id: 'division-1', name: 'Division One', type: 'COMPETITIVE' }],
};

const mockRegistrationResponse = {
  id: 'participant-1',
  status: 'ACTIVE',
  season_id: 'season-1',
  division_id: 'division-1',
};

const mockMyRegistration = {
  id: 'participant-1',
  status: 'ACTIVE',
  registered_at: '2026-10-16T12:00:00.000Z',
  withdrawn_at: null,
  season: {
    id: 'season-1',
    name: 'Spring Championship',
    status: 'REGISTRATION_OPEN',
    start_date: '2026-01-15T00:00:00.000Z',
    end_date: '2026-03-15T00:00:00.000Z',
    league: { id: 'league-1', name: 'North American League' },
  },
  division: { id: 'division-1', name: 'Division One', active: true },
};

vi.mock('../../lib/api-client', () => ({
  getMyPlayerProfile: vi.fn(),
  getMyCareer: vi.fn(),
  getMyNotifications: vi.fn(),
  markMyNotificationsRead: vi.fn(),
  getMyCompetitionSchedule: vi.fn(),
  checkInToMySeries: vi.fn(),
  listOpenRegistrationSeasons: vi.fn(),
  listPublicSeasons: vi.fn(),
  listMySeasonRegistrations: vi.fn(),
  updateMyPlayerProfile: vi.fn(),
  registerForSeasonDivision: vi.fn(),
  withdrawFromSeason: vi.fn(),
}));

import {
  checkInToMySeries,
  getMyCareer,
  getMyNotifications,
  getMyPlayerProfile,
  getMyCompetitionSchedule,
  listMySeasonRegistrations,
  listOpenRegistrationSeasons,
  listPublicSeasons,
  markMyNotificationsRead,
  registerForSeasonDivision,
  updateMyPlayerProfile,
} from '../../lib/api-client';

describe('PlayerDashboardContent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getMyPlayerProfile).mockResolvedValue(mockProfile);
    vi.mocked(getMyCareer).mockResolvedValue({ player: { id: 'player-123', gamerTag: 'AlphaStriker' }, career: [] });
    vi.mocked(getMyNotifications).mockResolvedValue([]);
    vi.mocked(markMyNotificationsRead).mockResolvedValue({ updated: 0 });
    vi.mocked(getMyCompetitionSchedule).mockResolvedValue({ serverTime: '2026-10-18T12:00:00.000Z', entries: [] });
    vi.mocked(listOpenRegistrationSeasons).mockResolvedValue([mockOpenSeason]);
    vi.mocked(listPublicSeasons).mockResolvedValue([mockPublicSeason]);
    vi.mocked(listMySeasonRegistrations).mockResolvedValue([]);
  });

  it('renders real season discovery and registration sections from the API', async () => {
    render(<PlayerDashboardContent />);

    expect(await screen.findByText('Season Discovery')).toBeInTheDocument();
    expect(screen.getByText('My Competitions / My Registrations')).toBeInTheDocument();
    expect(await screen.findByText('Spring Championship')).toBeInTheDocument();
    expect(screen.getByText('View Rules')).toBeInTheDocument();
    expect(screen.getByText('Register for Season')).toBeInTheDocument();
    expect(screen.queryByText('NGL 2026 SEASON 1')).not.toBeInTheDocument();
  });

  it('shows a public season after registration closes without offering registration', async () => {
    vi.mocked(listPublicSeasons).mockResolvedValue([{
      ...mockPublicSeason,
      id: 'season-closed',
      name: 'NGL 2026 SEASON 1',
      registrationCloseAt: '2026-10-13T00:00:00.000Z',
    }]);
    vi.mocked(listOpenRegistrationSeasons).mockResolvedValue([]);

    render(<PlayerDashboardContent />);

    expect(await screen.findByText('NGL 2026 SEASON 1')).toBeInTheDocument();
    expect(await screen.findByText('Registration is not currently available.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Register for Season' })).not.toBeInTheDocument();
  });

  it('reports public discovery failures instead of showing an empty catalogue', async () => {
    vi.mocked(listPublicSeasons).mockRejectedValue(new Error('Public season request failed'));

    render(<PlayerDashboardContent />);

    expect(await screen.findByRole('alert')).toHaveTextContent('Public season request failed');
    expect(screen.queryByText('No public seasons are available.')).not.toBeInTheDocument();
  });

  it('shows My Competitions only after the server confirms registration', async () => {
    vi.mocked(registerForSeasonDivision).mockResolvedValue(mockRegistrationResponse);
    vi.mocked(listMySeasonRegistrations).mockResolvedValueOnce([]).mockResolvedValue([mockMyRegistration]);
    render(<PlayerDashboardContent />);

    fireEvent.click(await screen.findByRole('button', { name: 'Register for Season' }));

    expect(await screen.findByText('You are registered for Spring Championship.')).toBeInTheDocument();
    expect(await screen.findByText('Status: ACTIVE')).toBeInTheDocument();
    expect(registerForSeasonDivision).toHaveBeenCalledWith('season-1', 'division-1');
  });

  it('does not show registration success when the backend rejects the request', async () => {
    vi.mocked(registerForSeasonDivision).mockRejectedValue(new Error('Division has reached its registration capacity'));
    render(<PlayerDashboardContent />);

    fireEvent.click(await screen.findByRole('button', { name: 'Register for Season' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Division has reached its registration capacity');
    expect(screen.queryByText('You are registered for Spring Championship.')).not.toBeInTheDocument();
  });

  it('keeps the confirmed registration outcome if My Competitions refresh fails', async () => {
    vi.mocked(registerForSeasonDivision).mockResolvedValue(mockRegistrationResponse);
    vi.mocked(listMySeasonRegistrations)
      .mockResolvedValueOnce([])
      .mockRejectedValueOnce(new Error('Registration list unavailable'));
    render(<PlayerDashboardContent />);

    fireEvent.click(await screen.findByRole('button', { name: 'Register for Season' }));

    expect(await screen.findByText('You are registered for Spring Championship.')).toBeInTheDocument();
    expect(await screen.findByRole('alert')).toHaveTextContent('Registration succeeded, but My Competitions could not be refreshed.');
  });

  it('keeps public discovery opt-in and saves the owner choice', async () => {
    vi.mocked(updateMyPlayerProfile).mockResolvedValue({ ...mockProfile, public_profile: true });
    render(<PlayerDashboardContent />);

    const checkbox = await screen.findByRole('checkbox', { name: 'Show my profile in public player discovery' });
    expect(checkbox).not.toBeChecked();
    fireEvent.click(checkbox);
    const form = screen.getByRole('button', { name: 'Save Profile' }).closest('form');
    fireEvent.submit(form!);

    await waitFor(() => expect(updateMyPlayerProfile).toHaveBeenCalledWith(expect.objectContaining({ publicProfile: true })));
  });

  it('distinguishes account, email verification, player verification, profile completion, reputation, and classification', async () => {
    render(<PlayerDashboardContent user={{
      id: 'user-123',
      email: 'player@example.test',
      accountStatus: 'ACTIVE',
      emailVerifiedAt: '2026-10-16T12:00:00.000Z',
    }} />);

    expect(await screen.findByText('Account: ACTIVE')).toBeInTheDocument();
    expect(screen.getByText('Email verification: Verified')).toBeInTheDocument();
    expect(screen.getByText('Player verification: VERIFIED')).toBeInTheDocument();
    expect(screen.getByText('Profile completion: Gamer tag provided')).toBeInTheDocument();
    expect(screen.getByText('Reputation: 100')).toBeInTheDocument();
    expect(screen.getByText(/Competitive classification is separate/)).toBeInTheDocument();
  });

  it('shows personal schedule times in the configured competition timezone and hides unavailable check-in', async () => {
    vi.mocked(getMyCompetitionSchedule).mockResolvedValue({
      serverTime: '2026-01-14T00:30:00.000Z',
      entries: [{
        seriesId: 'series-1',
        seriesNumber: 2,
        status: 'SCHEDULED',
        season: { id: 'season-1', name: 'Spring Championship', leagueName: 'North American League' },
        phase: { number: 1, name: 'Opening Phase' },
        opponent: 'RivalPlayer',
        scheduledAt: '2026-01-15T00:30:00.000Z',
        matchWindowEndAt: '2026-01-15T01:30:00.000Z',
        checkInOpensAt: '2026-01-14T23:30:00.000Z',
        checkInClosesAt: '2026-01-15T00:00:00.000Z',
        timezone: 'America/Los_Angeles',
        checkInState: 'NOT_OPEN',
        checkedInAt: null,
        canCheckIn: false,
      }],
    });

    render(<PlayerDashboardContent />);

    expect(await screen.findByText(/Wed, Jan 14, 2026.*4:30 PM PST/)).toBeInTheDocument();
    expect(screen.getByText('Status: SCHEDULED')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Check in' })).not.toBeInTheDocument();
    expect(screen.getByText(/Check-in opens Wed, Jan 14, 2026.*3:30 PM PST/)).toBeInTheDocument();
  });

  it('checks in only when the backend marks the participant eligible and refreshes authoritative status', async () => {
    const eligibleEntry = {
      seriesId: 'series-1',
      seriesNumber: 2,
      status: 'SCHEDULED',
      season: { id: 'season-1', name: 'Spring Championship', leagueName: 'North American League' },
      phase: { number: 1, name: 'Opening Phase' },
      opponent: 'RivalPlayer',
      scheduledAt: '2026-01-15T00:30:00.000Z',
      matchWindowEndAt: '2026-01-15T01:30:00.000Z',
      checkInOpensAt: '2026-01-14T23:30:00.000Z',
      checkInClosesAt: '2026-01-15T00:00:00.000Z',
      timezone: 'America/Los_Angeles',
      checkInState: 'OPEN' as const,
      checkedInAt: null,
      canCheckIn: true,
    };
    vi.mocked(getMyCompetitionSchedule)
      .mockResolvedValueOnce({ serverTime: '2026-01-14T23:40:00.000Z', entries: [eligibleEntry] })
      .mockResolvedValue({
        serverTime: '2026-01-14T23:41:00.000Z',
        entries: [{ ...eligibleEntry, checkedInAt: '2026-01-14T23:40:30.000Z', canCheckIn: false }],
      });
    vi.mocked(checkInToMySeries).mockResolvedValue({ alreadyCheckedIn: false, checked_in_at: '2026-01-14T23:40:30.000Z' });

    render(<PlayerDashboardContent />);
    fireEvent.click(await screen.findByRole('button', { name: 'Check in' }));

    expect(await screen.findByText('Check-in recorded.')).toBeInTheDocument();
    expect(await screen.findByText(/Checked in: Wed, Jan 14, 2026.*3:40 PM PST/)).toBeInTheDocument();
    expect(checkInToMySeries).toHaveBeenCalledWith('series-1');
  });

  it('reports a backend check-in rejection and refreshes the available state', async () => {
    const entry = {
      seriesId: 'series-1',
      seriesNumber: null,
      status: 'SCHEDULED',
      season: { id: 'season-1', name: 'Spring Championship', leagueName: 'North American League' },
      phase: { number: 1, name: 'Opening Phase' },
      opponent: null,
      scheduledAt: '2026-01-15T00:30:00.000Z',
      matchWindowEndAt: '2026-01-15T01:30:00.000Z',
      checkInOpensAt: '2026-01-14T23:30:00.000Z',
      checkInClosesAt: '2026-01-15T00:00:00.000Z',
      timezone: 'America/Los_Angeles',
      checkInState: 'OPEN' as const,
      checkedInAt: null,
      canCheckIn: true,
    };
    vi.mocked(getMyCompetitionSchedule)
      .mockResolvedValueOnce({ serverTime: '2026-01-14T23:40:00.000Z', entries: [entry] })
      .mockResolvedValue({ serverTime: '2026-01-15T00:01:00.000Z', entries: [{ ...entry, checkInState: 'CLOSED', canCheckIn: false }] });
    vi.mocked(checkInToMySeries).mockRejectedValue(new Error('Check-in is closed'));

    render(<PlayerDashboardContent />);
    fireEvent.click(await screen.findByRole('button', { name: 'Check in' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Check-in is closed');
    expect(screen.queryByRole('button', { name: 'Check in' })).not.toBeInTheDocument();
  });

  it('treats an authoritative duplicate check-in response as already completed', async () => {
    const entry = {
      seriesId: 'series-1',
      seriesNumber: 1,
      status: 'SCHEDULED',
      season: { id: 'season-1', name: 'Spring Championship', leagueName: 'North American League' },
      phase: { number: 1, name: 'Opening Phase' },
      opponent: 'RivalPlayer',
      scheduledAt: '2026-01-15T00:30:00.000Z',
      matchWindowEndAt: '2026-01-15T01:30:00.000Z',
      checkInOpensAt: '2026-01-14T23:30:00.000Z',
      checkInClosesAt: '2026-01-15T00:00:00.000Z',
      timezone: 'America/Los_Angeles',
      checkInState: 'OPEN' as const,
      checkedInAt: null,
      canCheckIn: true,
    };
    vi.mocked(getMyCompetitionSchedule)
      .mockResolvedValueOnce({ serverTime: '2026-01-14T23:40:00.000Z', entries: [entry] })
      .mockResolvedValue({
        serverTime: '2026-01-14T23:41:00.000Z',
        entries: [{ ...entry, checkedInAt: '2026-01-14T23:39:00.000Z', canCheckIn: false }],
      });
    vi.mocked(checkInToMySeries).mockResolvedValue({ alreadyCheckedIn: true, checked_in_at: '2026-01-14T23:39:00.000Z' });

    render(<PlayerDashboardContent />);
    fireEvent.click(await screen.findByRole('button', { name: 'Check in' }));

    expect(await screen.findByText('You are already checked in.')).toBeInTheDocument();
    expect(await screen.findByText(/Checked in: Wed, Jan 14, 2026.*3:39 PM PST/)).toBeInTheDocument();
  });

  it('shows explicit empty states for personal career and notifications', async () => {
    render(<PlayerDashboardContent />);

    expect(await screen.findByText(/No season participation is recorded yet/)).toBeInTheDocument();
    expect(await screen.findByText('No published competition results are available yet.')).toBeInTheDocument();
    expect(await screen.findByText('You have no personal notifications yet.')).toBeInTheDocument();
  });

  it('shows published career results and actual notification state, then refreshes after mark-all-read', async () => {
    vi.mocked(listMySeasonRegistrations).mockResolvedValue([mockMyRegistration]);
    vi.mocked(getMyCareer).mockResolvedValue({
      player: { id: 'player-123', gamerTag: 'AlphaStriker' },
      career: [{
        seriesId: 'series-published',
        seriesNumber: 1,
        season: { id: 'season-1', name: 'Spring Championship', status: 'COMPLETED', league: { id: 'league-1', name: 'North American League' } },
        phase: { number: 1, type: 'QUALIFYING', name: 'Opening Phase', status: 'COMPLETED' },
        participants: ['AlphaStriker', 'RivalPlayer'],
        games: [{
          number: 1,
          status: 'COMPLETED',
          homeParticipant: 'AlphaStriker',
          awayParticipant: 'RivalPlayer',
          resultStatus: 'PUBLISHED',
          result: { outcome: 'HOME_WIN', homeScore: 2, awayScore: 1, winner: 'AlphaStriker', completedAt: '2026-03-01T18:00:00.000Z' },
        }],
        finalResult: { status: 'COMPLETED', outcome: 'HOME_WIN', advancingParticipant: 'AlphaStriker' },
      }],
    });
    const unreadNotification = {
      id: 'notification-1',
      title: 'Series schedule changed',
      message: 'Your series has a new scheduled time.',
      category: 'COMPETITION',
      event_type: 'SCHEDULE_CHANGED',
      priority: 'NORMAL',
      related_entity: 'Series:series-published',
      read: false,
      created_at: '2026-03-01T17:00:00.000Z',
      updated_at: '2026-03-01T17:00:00.000Z',
    };
    vi.mocked(getMyNotifications)
      .mockResolvedValueOnce([unreadNotification])
      .mockResolvedValue([{ ...unreadNotification, read: true }]);
    vi.mocked(markMyNotificationsRead).mockResolvedValue({ updated: 1 });

    render(<PlayerDashboardContent />);

    expect(await screen.findByText('Game 1: HOME WIN · 2 - 1 · Mar 1, 2026')).toBeInTheDocument();
    expect(screen.getByText('Series schedule changed')).toBeInTheDocument();
    expect(screen.getByText('Schedule Changed · normal · Unread')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Mark all as read' }));

    expect(await screen.findByText('1 notification marked as read.')).toBeInTheDocument();
    expect(await screen.findByText('Schedule Changed · normal · Read')).toBeInTheDocument();
    expect(markMyNotificationsRead).toHaveBeenCalledOnce();
    expect(getMyNotifications).toHaveBeenCalledTimes(2);
  });
});
