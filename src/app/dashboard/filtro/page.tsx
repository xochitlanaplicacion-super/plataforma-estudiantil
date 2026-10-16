import Link from 'next/link';
import { ClipboardList, DoorOpen, ShieldCheck, TimerReset } from 'lucide-react';
import { listFilterPreRegistrations } from '@/lib/actions/filter-preregistrations';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export default async function FilterHome() {
  const result = await listFilterPreRegistrations();
  if (!result.success) throw new Error(result.error || 'No se pudieron cargar las órdenes pendientes.');
  const orders = result.orders || [];

  return <div className="space-y-6">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 className="text-2xl font-bold text-primary sm:text-3xl">Control de Filtro</h1>
        <p className="text-muted-foreground">Órdenes compartidas para preparar salidas anticipadas y entregas extraordinarias.</p>
      </div>
      <Button asChild><Link href="/dashboard/filtro/preregistros"><ClipboardList className="mr-2 h-4 w-4" />Crear preregistro</Link></Button>
    </div>
    <Alert><ClipboardList className="h-4 w-4" /><AlertTitle>{orders.length} {orders.length === 1 ? 'orden pendiente' : 'órdenes pendientes'}</AlertTitle><AlertDescription>Abrir una orden no la retira de esta lista. Solo desaparecerá cuando se complete y guarde el expediente definitivo. También puedes iniciar un trámite manual sin orden.</AlertDescription></Alert>
    <div className="grid gap-4 lg:grid-cols-2">
      {orders.map((order) => {
        const early = order.kind === 'early';
        const href = early ? `/dashboard/filtro/salidas?preregistro=${encodeURIComponent(order.id)}` : `/dashboard/filtro/entregas-extraordinarias?preregistro=${encodeURIComponent(order.id)}`;
        return <Card key={order.id} className="border-primary/20">
          <CardHeader className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Badge variant="outline">{early ? 'Salida anticipada' : 'Entrega extraordinaria'}</Badge>
              <span className="text-xs text-muted-foreground">{new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(order.createdAt))}</span>
            </div>
            <CardTitle className="text-lg">{order.students.map((student) => student.full_name).join(', ')}</CardTitle>
            <CardDescription>{order.students.map((student) => student.group_label).filter(Boolean).join(' · ')}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm"><span className="font-semibold">Inició:</span> {order.createdByName || 'Personal del plantel'}{order.declaredStaffName && order.declaredStaffName !== order.createdByName ? ` · Personal indicado: ${order.declaredStaffName}` : ''}</p>
            <Button asChild className="w-full sm:w-auto"><Link href={href}>{early ? <DoorOpen className="mr-2 h-4 w-4" /> : <ShieldCheck className="mr-2 h-4 w-4" />}Abrir y completar</Link></Button>
          </CardContent>
        </Card>;
      })}
    </div>
    {orders.length === 0 && <Card><CardContent className="py-10 text-center text-muted-foreground">No hay órdenes pendientes. Los formularios habituales siguen disponibles.</CardContent></Card>}
    <div className="flex flex-wrap gap-2 border-t pt-5">
      <Button asChild variant="outline"><Link href="/dashboard/filtro/retardos"><TimerReset className="mr-2 h-4 w-4" />Bitácora de retardos</Link></Button>
      <Button asChild variant="outline"><Link href="/dashboard/filtro/salidas">Salida anticipada manual</Link></Button>
      <Button asChild variant="outline"><Link href="/dashboard/filtro/entregas-extraordinarias">Entrega extraordinaria manual</Link></Button>
    </div>
  </div>;
}
