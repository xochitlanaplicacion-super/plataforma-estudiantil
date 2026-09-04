import { FilterExtraordinaryWizard } from '@/components/filter/FilterExtraordinaryWizard';
import { getExtraordinaryDashboardData } from '@/lib/actions/filter-control';

export default async function ExtraordinaryHandoffsPage() { const data = await getExtraordinaryDashboardData(); return <FilterExtraordinaryWizard initialData={data} initialClock={data.clock} />; }
