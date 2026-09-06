'use client';

import { useEffect, useState } from 'react';
import { QrCode, Save, Smartphone } from 'lucide-react';

import {
  loadTeacherMobileCaptureSettingsAction,
  saveTeacherMobileCaptureSettingAction,
  type TeacherMobileCaptureSettingDto,
} from '@/lib/actions/calificaciones';
import type { AcademicCriterionConfigurationDto } from '@/lib/academic/configuration-dto';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';

const defaults = (criterionId: string): TeacherMobileCaptureSettingDto => ({
  criterionId,
  minimumGrade: 5,
  increment: 1,
  qrReader: false,
  confirmBeforeSave: false,
});

export function TeacherMobileCaptureSettings({ criteria }: { criteria: AcademicCriterionConfigurationDto[] }) {
  const eligible = criteria.filter((criterion) => criterion.active && criterion.type !== 'actividades');
  const [settings, setSettings] = useState<Record<string, TeacherMobileCaptureSettingDto>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [message, setMessage] = useState('');

  useEffect(() => {
    let active = true;
    void loadTeacherMobileCaptureSettingsAction().then((result) => {
      if (!active) return;
      if (!result.ok) {
        setMessage(result.error.message);
        return;
      }
      setSettings(Object.fromEntries(result.data.map((setting) => [setting.criterionId, setting])));
    });
    return () => { active = false; };
  }, []);

  function update(criterionId: string, changes: Partial<TeacherMobileCaptureSettingDto>) {
    setSettings((current) => ({
      ...current,
      [criterionId]: { ...(current[criterionId] ?? defaults(criterionId)), ...changes },
    }));
  }

  async function save(criterionId: string) {
    setSaving(criterionId);
    setMessage('');
    const result = await saveTeacherMobileCaptureSettingAction(settings[criterionId] ?? defaults(criterionId));
    if (result.ok) {
      setSettings((current) => ({ ...current, [criterionId]: result.data }));
      setMessage('Ajustes móviles guardados. La aplicación los recibirá al actualizar.');
    } else {
      setMessage(result.error.message);
    }
    setSaving(null);
  }

  if (eligible.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Smartphone aria-hidden="true" />Captura rápida en la aplicación</CardTitle>
        <CardDescription>
          Ajusta los botones que verá la aplicación para este profesor. El ciclo y el periodo se toman automáticamente de la configuración activa de la institución.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {message ? <p role="status" className="rounded-md border bg-muted/40 p-3 text-sm">{message}</p> : null}
        {eligible.map((criterion) => {
          const value = settings[criterion.id] ?? defaults(criterion.id);
          return (
            <section key={criterion.id} className="grid gap-4 rounded-lg border p-4 lg:grid-cols-[minmax(12rem,1.4fr)_8rem_8rem_11rem_13rem_auto] lg:items-end">
              <div>
                <p className="font-semibold">{criterion.name}</p>
                <p className="text-sm text-muted-foreground">Ajustes propios de este criterio</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor={`mobile-minimum-${criterion.id}`}>Mínima visible</Label>
                <select id={`mobile-minimum-${criterion.id}`} className="h-10 w-full rounded-md border bg-background px-3" value={value.minimumGrade} onChange={(event) => update(criterion.id, { minimumGrade: Number(event.target.value) })}>
                  {Array.from({ length: 11 }, (_, number) => <option key={number} value={number}>{number}</option>)}
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor={`mobile-increment-${criterion.id}`}>Incremento</Label>
                <select id={`mobile-increment-${criterion.id}`} className="h-10 w-full rounded-md border bg-background px-3" value={value.increment} onChange={(event) => update(criterion.id, { increment: Number(event.target.value) as 0.1 | 0.5 | 1 })}>
                  <option value={1}>1 punto</option><option value={0.5}>0.5</option><option value={0.1}>0.1</option>
                </select>
              </div>
              <div className="flex items-center justify-between gap-3 rounded-md border p-3">
                <Label htmlFor={`mobile-qr-${criterion.id}`} className="flex items-center gap-2"><QrCode className="size-4" aria-hidden="true" />Lector QR</Label>
                <Switch id={`mobile-qr-${criterion.id}`} checked={value.qrReader} onCheckedChange={(checked) => update(criterion.id, { qrReader: checked })} />
              </div>
              <div className="flex items-center justify-between gap-3 rounded-md border p-3">
                <Label htmlFor={`mobile-confirm-${criterion.id}`}>Confirmar cada captura</Label>
                <Switch id={`mobile-confirm-${criterion.id}`} checked={value.confirmBeforeSave} onCheckedChange={(checked) => update(criterion.id, { confirmBeforeSave: checked })} />
              </div>
              <Button type="button" disabled={saving === criterion.id} onClick={() => void save(criterion.id)}><Save />{saving === criterion.id ? 'Guardando…' : 'Guardar'}</Button>
            </section>
          );
        })}
      </CardContent>
    </Card>
  );
}
