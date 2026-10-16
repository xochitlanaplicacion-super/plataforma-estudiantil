import Link from 'next/link';
import { FilterExtraordinaryWizard } from '@/components/filter/FilterExtraordinaryWizard';
import { getExtraordinaryDashboardData } from '@/lib/actions/filter-control';
import { getFilterPreRegistration } from '@/lib/actions/filter-preregistrations';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';

export default async function ExtraordinaryHandoffsPage({ searchParams }: { searchParams: Promise<{ preregistro?: string }> }) {
  const data = await getExtraordinaryDashboardData();
  const { preregistro } = await searchParams;
  if (!preregistro) return <FilterExtraordinaryWizard initialData={data} initialClock={data.clock} />;
  const result = await getFilterPreRegistration(preregistro);
  const order = result.order;
  if (!result.success || !order || order.kind !== 'extraordinary' || order.status !== 'pending'
    || order.studentIds.some((id) => !data.students.some((student: any) => student.id === id))) {
    return <div className="space-y-4"><Alert variant="destructive"><AlertTitle>No se puede abrir esta orden</AlertTitle><AlertDescription>{result.error || 'La orden ya fue completada, es de otro tipo o alguno de sus alumnos ya no está activo. La orden no se modificó.'}</AlertDescription></Alert><Button asChild variant="outline"><Link href="/dashboard/filtro">Volver a órdenes pendientes</Link></Button></div>;
  }
  return <FilterExtraordinaryWizard initialData={data} initialClock={data.clock} preRegistration={order} />;
}
