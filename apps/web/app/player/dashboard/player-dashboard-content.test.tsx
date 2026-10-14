import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
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

vi.mock('../../lib/api-client', () => ({
  getMyPlayerProfile: vi.fn(),
  listOpenRegistrationSeasons: vi.fn(),
  listMySeasonRegistrations: vi.fn(),
  updateMyPlayerProfile: vi.fn(),
  registerForSeasonDivision: vi.fn(),
  withdrawFromSeason: vi.fn(),
}));

import {
  getMyPlayerProfile,
  listMySeasonRegistrations,
  listOpenRegistrationSeasons,
} from '../../lib/api-client';

describe('PlayerDashboardContent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getMyPlayerProfile).mockResolvedValue(mockProfile);
    vi.mocked(listOpenRegistrationSeasons).mockResolvedValue([mockOpenSeason]);
    vi.mocked(listMySeasonRegistrations).mockResolvedValue([]);
  });

  it('renders real season discovery and registration sections from the API', async () => {
    render(<PlayerDashboardContent />);

    expect(await screen.findByText('Available Seasons')).toBeInTheDocument();
    expect(screen.getByText('My Competitions / My Registrations')).toBeInTheDocument();
    expect(await screen.findByText('Spring Championship')).toBeInTheDocument();
    expect(screen.getByText('View Rules')).toBeInTheDocument();
    expect(screen.getByText('Register for Season')).toBeInTheDocument();
    expect(screen.queryByText('NGL 2026 SEASON 1')).not.toBeInTheDocument();
  });
});
