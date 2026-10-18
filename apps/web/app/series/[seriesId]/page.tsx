import PublicSeriesContent from './public-series-content';

export default function PublicSeriesPage({ params }: { params: { seriesId: string } }) {
  return <PublicSeriesContent seriesId={params.seriesId} />;
}