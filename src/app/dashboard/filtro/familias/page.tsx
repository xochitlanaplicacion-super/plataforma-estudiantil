import { FilterFamilies } from '@/components/filter/FilterFamilies';
import { getFilterFamiliesData } from '@/lib/actions/filter-control';

export default async function FilterFamiliesPage() { return <FilterFamilies initialData={await getFilterFamiliesData()} />; }
