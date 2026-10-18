import PublicLeagueContent from './public-league-content';

export default function PublicLeaguePage({ params }: { params: { leagueId: string } }) {
  return <PublicLeagueContent leagueId={params.leagueId} />;
}