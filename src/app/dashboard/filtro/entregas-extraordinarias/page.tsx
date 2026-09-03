import { FilterExtraordinaryWizard } from '@/components/filter/FilterExtraordinaryWizard';
import { getExtraordinaryDashboardData, getFilterCurrentTime } from '@/lib/actions/filter-control';

export default async function ExtraordinaryHandoffsPage() { const [data, clock] = await Promise.all([getExtraordinaryDashboardData(), getFilterCurrentTime()]); return <FilterExtraordinaryWizard initialData={data} initialClock={clock} />; }
