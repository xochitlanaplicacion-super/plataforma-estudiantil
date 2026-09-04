import { FilterEarlyDepartureWizard } from '@/components/filter/FilterEarlyDepartureWizard';
import { getEarlyDepartureDashboardData } from '@/lib/actions/filter-control';

export default async function FilterEarlyDeparturesPage() {
  const data = await getEarlyDepartureDashboardData();
  return <FilterEarlyDepartureWizard initialData={data} initialClock={data.clock} />;
}
