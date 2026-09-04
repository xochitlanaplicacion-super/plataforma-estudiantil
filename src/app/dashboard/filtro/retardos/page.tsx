import { getFilterDashboardData } from '@/lib/actions/filter-control';
import { FilterLateLog } from '@/components/filter/FilterLateLog';

export default async function FilterLatePage() {
  const data = await getFilterDashboardData();
  return <FilterLateLog initialData={data} initialClock={data.clock} />;
}
