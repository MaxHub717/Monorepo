import PublicSeasonContent from './public-season-content';

export default function PublicSeasonPage({ params }: { params: { seasonId: string } }) {
  return <PublicSeasonContent seasonId={params.seasonId} />;
}