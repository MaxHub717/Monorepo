import PublicPlayerProfileContent from './public-player-profile-content';

export default function PublicPlayerProfilePage({ params }: { params: { playerId: string } }) {
  return <PublicPlayerProfileContent playerId={params.playerId} />;
}