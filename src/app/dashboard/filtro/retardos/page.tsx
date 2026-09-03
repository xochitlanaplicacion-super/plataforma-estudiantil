import { getFilterCurrentTime, getFilterDashboardData } from '@/lib/actions/filter-control';
import { FilterLateLog } from '@/components/filter/FilterLateLog';

export default async function FilterLatePage() {
  const [data, clock] = await Promise.all([getFilterDashboardData(), getFilterCurrentTime()]);
  return <FilterLateLog initialData={data} initialClock={clock} />;
}
