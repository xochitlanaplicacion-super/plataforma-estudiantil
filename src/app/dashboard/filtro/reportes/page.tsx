import { FilterReports } from '@/components/filter/FilterReports';
import { getFilterReportsData } from '@/lib/actions/filter-control';
export default async function FilterReportsPage(){return <FilterReports initialData={await getFilterReportsData()}/>;}
