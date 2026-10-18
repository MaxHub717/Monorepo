import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import CompetitionsContent from './competitions-content';
import PublicSeasonContent from './[seasonId]/public-season-content';
import PublicSeasonResultsContent from './[seasonId]/results/public-season-results-content';
import LeaguesContent from '../leagues/leagues-content';
import PublicLeagueContent from '../leagues/[leagueId]/public-league-content';
import PublicSeriesContent from '../series/[seriesId]/public-series-content';
import CareerContent from '../career/career-content';
import PublicPlayerProfileContent from '../players/[playerId]/public-player-profile-content';

const publicSeason = {
  id: 'season-1',
  name: 'Spring Championship',
  description: 'Published season',
  status: 'REGISTRATION_CLOSED',
  startDate: '2026-01-15T00:00:00.000Z',
  endDate: '2026-03-15T00:00:00.000Z',
  registrationOpenAt: null,
  registrationCloseAt: '2026-01-10T00:00:00.000Z',
  timezone: 'UTC',
  league: { id: 'league-1', name: 'North American League' },
  divisions: [{ id: 'division-1', name: 'Division One', type: 'COMPETITIVE' }],
};

const publicLeague = {
  id: 'league-1',
  name: 'North American League',
  description: 'Public league description',
  region: 'North America',
  seasons: [{
    id: 'season-1',
    name: 'Spring Championship',
    description: 'Published season',
    status: 'REGISTRATION_CLOSED',
    startDate: '2026-01-15T00:00:00.000Z',
    endDate: '2026-03-15T00:00:00.000Z',
    timezone: 'UTC',
  }],
};

const publicSeasonOverview = {
  ...publicSeason,
  divisions: [{ id: 'division-1', name: 'Division One', type: 'COMPETITIVE', participantCount: 0 }],
  participantCount: 0,
  phases: [],
  scheduledSeriesCount: 0,
  publishedResultsCount: 0,
  publishedRules: null,
  rulesPublishedAt: null,
};

const publicSeasonSchedule = {
  season: {
    id: 'season-1',
    name: 'Spring Championship',
    status: 'ACTIVE',
    timezone: 'America/Los_Angeles',
  },
  phases: [],
};

const publicSeriesDetail = {
  id: 'series-1',
  number: 1,
  status: 'IN_PROGRESS',
  scheduledAt: '2026-10-17T01:00:00.000Z',
  timezone: 'America/Los_Angeles',
  season: { id: 'season-1', name: 'Spring Championship', status: 'ACTIVE', league: { id: 'league-1', name: 'North American League' } },
  phase: { number: 1, type: 'QUALIFYING', name: 'Qualifying', status: 'ACTIVE' },
  participants: ['NorthStar', 'BlueComet'],
  games: [1, 2, 3].map((number) => ({
    number,
    status: number === 1 ? 'COMPLETED' : 'PENDING',
    homeParticipant: 'NorthStar',
    awayParticipant: 'BlueComet',
    resultStatus: 'PENDING' as const,
    result: null,
  })),
  finalResult: null,
};

const publicSeasonResults = {
  season: { id: 'season-1', name: 'Spring Championship', status: 'COMPLETED', timezone: 'UTC', league: { id: 'league-1', name: 'North American League' } },
  results: [{
    ...publicSeriesDetail,
    status: 'COMPLETED',
    games: [{
      ...publicSeriesDetail.games[0],
      resultStatus: 'PUBLISHED' as const,
      result: { outcome: 'HOME_WIN', homeScore: 3, awayScore: 1, winner: 'NorthStar', completedAt: '2026-10-17T02:00:00.000Z' },
    }, ...publicSeriesDetail.games.slice(1)],
    finalResult: { status: 'COMPLETED', outcome: 'WINNER_ADVANCES', advancingParticipant: 'NorthStar' },
  }],
};

const publicPlayers = [{ id: 'player-1', gamerTag: 'NorthStar', region: 'West' }];
const publicPlayerProfile = {
  player: publicPlayers[0],
  career: [{
    seriesId: 'series-1',
    seriesNumber: 1,
    season: publicSeasonResults.season,
    phase: { number: 1, type: 'QUALIFYING', name: 'Qualifying', status: 'COMPLETED' },
    participants: ['NorthStar', 'BlueComet'],
    games: [{
      number: 1,
      status: 'COMPLETED',
      homeParticipant: 'NorthStar',
      awayParticipant: 'BlueComet',
      resultStatus: 'PUBLISHED' as const,
      result: { outcome: 'HOME_WIN', homeScore: 3, awayScore: 1, winner: 'NorthStar', completedAt: '2026-10-17T02:00:00.000Z' },
    }],
    finalResult: null,
  }],
};

vi.mock('../lib/api-client', () => ({
  listPublicSeasons: vi.fn(),
  getPublicSeasonOverview: vi.fn(),
  getPublicSeasonSchedule: vi.fn(),
  getPublicSeriesDetail: vi.fn(),
  getPublicSeasonResults: vi.fn(),
  listPublicPlayers: vi.fn(),
  getPublicPlayerProfile: vi.fn(),
  listPublicLeagues: vi.fn(),
  getPublicLeague: vi.fn(),
}));

import {
  getPublicLeague,
  getPublicSeasonOverview,
  getPublicSeasonSchedule,
  getPublicSeriesDetail,
  getPublicSeasonResults,
  listPublicPlayers,
  getPublicPlayerProfile,
  listPublicLeagues,
  listPublicSeasons,
} from '../lib/api-client';

describe('public league and season discovery', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(listPublicSeasons).mockResolvedValue([publicSeason]);
    vi.mocked(getPublicSeasonOverview).mockResolvedValue(publicSeasonOverview);
    vi.mocked(getPublicSeasonSchedule).mockResolvedValue(publicSeasonSchedule);
    vi.mocked(getPublicSeriesDetail).mockResolvedValue(publicSeriesDetail);
    vi.mocked(getPublicSeasonResults).mockResolvedValue(publicSeasonResults);
    vi.mocked(listPublicPlayers).mockResolvedValue(publicPlayers);
    vi.mocked(getPublicPlayerProfile).mockResolvedValue(publicPlayerProfile);
    vi.mocked(listPublicLeagues).mockResolvedValue([publicLeague]);
    vi.mocked(getPublicLeague).mockResolvedValue(publicLeague);
  });

  it('links public season results to the matching season and league pages', async () => {
    render(<CompetitionsContent />);

    expect(await screen.findByRole('link', { name: 'Spring Championship' })).toHaveAttribute('href', '/competitions/season-1');
    expect(screen.getByRole('link', { name: 'North American League' })).toHaveAttribute('href', '/leagues/league-1');
    expect(screen.getByText('REGISTRATION CLOSED')).toBeInTheDocument();
  });

  it('shows leagues with their published seasons', async () => {
    render(<LeaguesContent />);

    expect(await screen.findByRole('link', { name: /North American League/ })).toHaveAttribute('href', '/leagues/league-1');
    expect(screen.getByText('1 public season')).toBeInTheDocument();
  });

  it('loads season detail from the selected public season id', async () => {
    render(<PublicSeasonContent seasonId="season-1" />);

    expect(await screen.findByText('REGISTRATION CLOSED')).toBeInTheDocument();
    expect(screen.getByText('No public participants are available yet.')).toBeInTheDocument();
    expect(screen.getByText('Competition phases have not been created yet.')).toBeInTheDocument();
    expect(screen.getByText('No schedule has been published yet.')).toBeInTheDocument();
    expect(getPublicSeasonOverview).toHaveBeenCalledWith('season-1');
    expect(getPublicSeasonSchedule).toHaveBeenCalledWith('season-1');
  });

  it('shows persisted phase and series states and formats a scheduled time in the season timezone', async () => {
    const scheduledAt = '2026-10-17T01:00:00.000Z';
    vi.mocked(getPublicSeasonSchedule).mockResolvedValue({
      ...publicSeasonSchedule,
      phases: [{
        number: 1,
        type: 'QUALIFYING',
        name: 'Qualifying',
        status: 'ACTIVE',
        startAt: '2026-10-16T00:00:00.000Z',
        endAt: '2026-10-23T00:00:00.000Z',
        series: [{
          number: 2,
          status: 'SCHEDULED',
          scheduledAt,
          participants: ['NorthStar', 'BlueComet'],
        }],
      }],
    });
    const expectedTime = new Intl.DateTimeFormat('en', {
      dateStyle: 'medium',
      timeStyle: 'short',
      timeZone: 'America/Los_Angeles',
    }).format(new Date(scheduledAt));

    render(<PublicSeasonContent seasonId="season-1" />);

    expect(await screen.findByText('Qualifying')).toBeInTheDocument();
    expect(screen.getByText('ACTIVE')).toBeInTheDocument();
    expect(screen.getByText('NorthStar vs BlueComet')).toBeInTheDocument();
    expect(screen.getByText(`${expectedTime} (America/Los_Angeles)`)).toBeInTheDocument();
  });

  it('distinguishes generated but unscheduled series from a season without series', async () => {
    vi.mocked(getPublicSeasonSchedule).mockResolvedValue({
      ...publicSeasonSchedule,
      phases: [{
        number: 1,
        type: 'QUALIFYING',
        name: 'Qualifying',
        status: 'PENDING',
        startAt: null,
        endAt: null,
        series: [{ number: 1, status: 'SCHEDULED', scheduledAt: null, participants: [] }],
      }],
    });

    render(<PublicSeasonContent seasonId="season-1" />);

    expect(await screen.findByText('Series exist, but no schedule has been published yet.')).toBeInTheDocument();
  });

  it('does not render private game outcomes or final results while publication is pending', async () => {
    render(<PublicSeriesContent seriesId="series-1" />);

    expect(await screen.findAllByText('Result pending.')).toHaveLength(3);
    expect(screen.getByText('The final series result has not been published.')).toBeInTheDocument();
    expect(screen.queryByText(/HOME WIN/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Advancing:/)).not.toBeInTheDocument();
  });

  it('labels restricted game outcomes without exposing the recorded result', async () => {
    vi.mocked(getPublicSeriesDetail).mockResolvedValue({
      ...publicSeriesDetail,
      games: [{ ...publicSeriesDetail.games[0], resultStatus: 'NOT_PUBLISHED', result: null }],
    });
    render(<PublicSeriesContent seriesId="series-1" />);

    expect(await screen.findByText('Result is not publicly available.')).toBeInTheDocument();
    expect(screen.queryByText(/HOME WIN/)).not.toBeInTheDocument();
    expect(screen.queryByText(/3 - 1/)).not.toBeInTheDocument();
  });

  it('formats the scheduled series instant in the configured season timezone', async () => {
    const expectedTime = new Intl.DateTimeFormat('en', {
      dateStyle: 'medium',
      timeStyle: 'short',
      timeZone: 'America/Los_Angeles',
    }).format(new Date(publicSeriesDetail.scheduledAt));
    render(<PublicSeriesContent seriesId="series-1" />);

    expect(await screen.findByText(`${expectedTime} (America/Los_Angeles)`)).toBeInTheDocument();
  });

  it('shows a published game outcome and links results back to the series and season', async () => {
    render(<PublicSeasonResultsContent seasonId="season-1" />);

    expect(await screen.findByText(/Game 1: HOME WIN · 3 - 1/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'NorthStar vs BlueComet' })).toHaveAttribute('href', '/series/series-1');
    expect(screen.getByRole('link', { name: 'Back to season' })).toHaveAttribute('href', '/competitions/season-1');
  });

  it('shows a clean empty state when no published results exist', async () => {
    vi.mocked(getPublicSeasonResults).mockResolvedValue({ ...publicSeasonResults, results: [] });
    render(<PublicSeasonResultsContent seasonId="season-1" />);

    expect(await screen.findByText('No published results yet')).toBeInTheDocument();
  });

  it('lists only the public player identity and links to its profile', async () => {
    render(<CareerContent />);

    expect(await screen.findByRole('link', { name: 'NorthStar' })).toHaveAttribute('href', '/players/player-1');
    expect(screen.getByText('West')).toBeInTheDocument();
    expect(screen.queryByText(/email|verification|classification/i)).not.toBeInTheDocument();
  });

  it('shows only published history on an opted-in public player page', async () => {
    render(<PublicPlayerProfileContent playerId="player-1" />);

    expect(await screen.findByRole('heading', { name: 'NorthStar' })).toBeInTheDocument();
    expect(screen.getByText(/Game 1: HOME WIN · 3 - 1/)).toBeInTheDocument();
    expect(screen.queryByText(/email|verification|classification|private/i)).not.toBeInTheDocument();
    expect(getPublicPlayerProfile).toHaveBeenCalledWith('player-1');
  });

  it('handles an opted-in profile with no published career history', async () => {
    vi.mocked(getPublicPlayerProfile).mockResolvedValue({ ...publicPlayerProfile, career: [] });
    render(<PublicPlayerProfileContent playerId="player-1" />);

    expect(await screen.findByText('No published competition history is available yet.')).toBeInTheDocument();
  });

  it('shows visible seasons on public league detail', async () => {
    render(<PublicLeagueContent leagueId="league-1" />);

    expect(await screen.findByRole('link', { name: 'Spring Championship' })).toHaveAttribute('href', '/competitions/season-1');
    expect(getPublicLeague).toHaveBeenCalledWith('league-1');
  });

  it('does not present a league API failure as an empty public league catalogue', async () => {
    vi.mocked(listPublicLeagues).mockRejectedValue(new Error('League API unavailable'));
    render(<LeaguesContent />);

    expect(await screen.findByRole('alert')).toHaveTextContent('League API unavailable');
    expect(screen.queryByText('No public leagues yet')).not.toBeInTheDocument();
  });

  it('does not present a season catalogue API failure as an empty public season list', async () => {
    vi.mocked(listPublicSeasons).mockRejectedValue(new Error('Season catalogue unavailable'));
    render(<CompetitionsContent />);

    expect(await screen.findByRole('alert')).toHaveTextContent('Season catalogue unavailable');
    expect(screen.queryByText('No public seasons yet')).not.toBeInTheDocument();
  });

  it('does not present a season overview API failure as a public empty season', async () => {
    vi.mocked(getPublicSeasonOverview).mockRejectedValue(new Error('Season API unavailable'));
    render(<PublicSeasonContent seasonId="season-1" />);

    expect(await screen.findByRole('alert')).toHaveTextContent('Season API unavailable');
    expect(screen.queryByText('No public participants are available yet.')).not.toBeInTheDocument();
  });

  it('does not present a public schedule API failure as a season without phases or fixtures', async () => {
    vi.mocked(getPublicSeasonSchedule).mockRejectedValue(new Error('Schedule API unavailable'));
    render(<PublicSeasonContent seasonId="season-1" />);

    expect(await screen.findAllByRole('alert')).toHaveLength(2);
    expect(screen.getAllByRole('alert')[0]).toHaveTextContent('Schedule API unavailable');
    expect(screen.queryByText('Competition phases have not been created yet.')).not.toBeInTheDocument();
    expect(screen.queryByText('No series have been generated yet.')).not.toBeInTheDocument();
  });

  it('does not present public series or result API failures as empty competition data', async () => {
    vi.mocked(getPublicSeriesDetail).mockRejectedValue(new Error('Series API unavailable'));
    const { unmount } = render(<PublicSeriesContent seriesId="series-1" />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Series API unavailable');
    expect(screen.queryByText('No games are available for this series.')).not.toBeInTheDocument();
    unmount();

    vi.mocked(getPublicSeasonResults).mockRejectedValue(new Error('Results API unavailable'));
    render(<PublicSeasonResultsContent seasonId="season-1" />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Results API unavailable');
    expect(screen.queryByText('No published results yet')).not.toBeInTheDocument();
  });

  it('does not present a public player profile API failure as empty career history', async () => {
    vi.mocked(getPublicPlayerProfile).mockRejectedValue(new Error('Player profile API unavailable'));
    render(<PublicPlayerProfileContent playerId="player-1" />);

    expect(await screen.findByRole('alert')).toHaveTextContent('Player profile API unavailable');
    expect(screen.queryByText('No published competition history is available yet.')).not.toBeInTheDocument();
  });

  it('does not present a public player directory API failure as no opted-in profiles', async () => {
    vi.mocked(listPublicPlayers).mockRejectedValue(new Error('Player directory unavailable'));
    render(<CareerContent />);

    expect(await screen.findByRole('alert')).toHaveTextContent('Player directory unavailable');
    expect(screen.queryByText('No public player profiles yet')).not.toBeInTheDocument();
  });
});