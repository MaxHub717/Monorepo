import PublicSeasonResultsContent from './public-season-results-content';

export default function PublicSeasonResultsPage({ params }: { params: { seasonId: string } }) {
  return <PublicSeasonResultsContent seasonId={params.seasonId} />;
}