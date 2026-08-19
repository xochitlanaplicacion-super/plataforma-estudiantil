import { notFound, redirect } from 'next/navigation';
import { getPlatformDashboard } from '@/lib/actions/platform';
import { getRequestHostname, isPlatformHostname, requirePlatformAdmin } from '@/lib/tenant/context';
import { PlatformDashboard } from './platform-dashboard';

export default async function PlatformPage() {
  const hostname = await getRequestHostname();
  if (!isPlatformHostname(hostname)) notFound();
  try {
    await requirePlatformAdmin();
  } catch {
    redirect('/');
  }
  const data = await getPlatformDashboard();
  return <PlatformDashboard initialData={data} />;
}
