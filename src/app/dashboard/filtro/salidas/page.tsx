import { FilterEarlyDepartureWizard } from '@/components/filter/FilterEarlyDepartureWizard';
import { getEarlyDepartureDashboardData, getFilterCurrentTime } from '@/lib/actions/filter-control';

export default async function FilterEarlyDeparturesPage() {
  const [data, clock] = await Promise.all([getEarlyDepartureDashboardData(), getFilterCurrentTime()]);
  return <FilterEarlyDepartureWizard initialData={data} initialClock={clock} />;
}
