import { requirePermission } from '../lib/auth-guard';
import SeasonsContent from './seasons-content';

export default async function SeasonsPage() {
  await requirePermission('MANAGE_SEASONS', '/');

  return <SeasonsContent />;
}