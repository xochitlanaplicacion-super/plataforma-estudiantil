import { getFilterDashboardData } from '@/lib/actions/filter-control';
import { FilterRoster } from '@/components/filter/FilterRoster';

export default async function FilterStudentsPage() {
  const data = await getFilterDashboardData();
  return <FilterRoster initialData={data} />;
}
