'use client';

import { FormEvent, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { BellRing, Save } from 'lucide-react';
import { updateFilterAlertSettings } from '@/lib/actions/filter-control';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';

export function FilterAlerts({ initialData }: { initialData: any }) {
  const settings = initialData.settings || {}; const router = useRouter(); const { toast } = useToast(); const [pending, startTransition] = useTransition();
  const [enabled, setEnabled] = useState(settings.enabled ?? true); const [threshold, setThreshold] = useState(Number(settings.threshold || 3)); const [unit, setUnit] = useState(settings.window_unit || 'global'); const [value, setValue] = useState(Number(settings.window_value || 1));
  const submit = (event: FormEvent) => { event.preventDefault(); startTransition(async () => { const result = await updateFilterAlertSettings({ enabled, threshold, windowUnit: unit, windowValue: value }); if (!result.success) toast({ variant: 'destructive', title: 'No se guardó', description: result.error }); else { toast({ title: 'Política de alertas guardada' }); router.refresh(); } }); };
  return <div className="mx-auto max-w-3xl space-y-6"><div><h1 className="flex items-center gap-2 text-3xl font-bold text-primary"><BellRing />Alertas de retardos</h1><p className="text-muted-foreground">Regla institucional persistente aplicada al consultar cada alumno.</p></div><Card><CardHeader><CardTitle>Política del tenant</CardTitle><CardDescription>Si se desactiva o se selecciona “Histórico global”, el contador conserva todos los retardos acumulados.</CardDescription></CardHeader><CardContent><form onSubmit={submit} className="space-y-5"><div className="flex items-center justify-between rounded-xl border p-4"><div><p className="font-semibold">Mostrar alerta por reincidencia</p><p className="text-sm text-muted-foreground">Resalta al alumno cuando alcanza el umbral.</p></div><Switch checked={enabled} onCheckedChange={setEnabled} /></div><div className="grid gap-4 sm:grid-cols-3"><div><Label>A partir de cuántos retardos</Label><Input type="number" min={1} max={100} value={threshold} onChange={(e) => setThreshold(Number(e.target.value))} /></div><div><Label>Periodo</Label><Select value={unit} onValueChange={setUnit}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="global">Histórico global</SelectItem><SelectItem value="days">Días</SelectItem><SelectItem value="months">Meses</SelectItem><SelectItem value="years">Años</SelectItem></SelectContent></Select></div><div><Label>Cantidad del periodo</Label><Input type="number" min={1} max={100} disabled={unit === 'global'} value={value} onChange={(e) => setValue(Number(e.target.value))} /></div></div><div className="rounded-xl bg-primary/5 p-4 text-sm"><strong>Regla resultante:</strong> alerta al llegar a {threshold} retardo(s) {unit === 'global' ? 'en todo el historial' : `durante los últimos ${value} ${unit === 'days' ? 'días' : unit === 'months' ? 'meses' : 'años'}`}.</div><Button type="submit" disabled={pending}><Save className="mr-2 h-4 w-4" />{pending ? 'Guardando…' : 'Guardar política'}</Button></form></CardContent></Card></div>;
}
