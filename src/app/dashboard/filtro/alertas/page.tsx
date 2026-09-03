import { getFilterDashboardData } from '@/lib/actions/filter-control';
import { FilterAlerts } from '@/components/filter/FilterAlerts';

export default async function FilterAlertsPage() {
  const data = await getFilterDashboardData();
  return <FilterAlerts initialData={data} />;
}
