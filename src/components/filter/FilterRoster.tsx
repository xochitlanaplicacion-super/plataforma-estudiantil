'use client';

import { useMemo, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';
import { Download, FileSpreadsheet, Plus, Search, Trash2, Upload, Users } from 'lucide-react';
import { addFilterStudents, deleteFilterStudents, upsertFilterStructure } from '@/lib/actions/filter-control';
import { splitRosterText } from '@/lib/filter-control';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';

export function FilterRoster({ initialData }: { initialData: any }) {
  const router = useRouter(); const { toast } = useToast(); const [pending, startTransition] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);
  const [levelName, setLevelName] = useState(''); const [gradeName, setGradeName] = useState(''); const [groupName, setGroupName] = useState('A');
  const [groupId, setGroupId] = useState(initialData.groups[0]?.id || ''); const [singleName, setSingleName] = useState(''); const [bulkNames, setBulkNames] = useState('');
  const [selected, setSelected] = useState<string[]>([]); const [search, setSearch] = useState('');
  const levels = new Map(initialData.levels.map((level: any) => [level.id, level.name]));
  const groupLabel = (group: any) => `${levels.get(group.level_id) || 'Nivel'} · ${group.grade_name} · Grupo ${group.group_name}`;
  const students = useMemo(() => initialData.students.filter((student: any) => (!groupId || student.group_id === groupId) && student.full_name.toLowerCase().includes(search.toLowerCase())), [initialData.students, groupId, search]);

  const run = (task: () => Promise<any>, success: string, after?: () => void) => startTransition(async () => {
    const result = await task();
    if (!result.success) toast({ variant: 'destructive', title: 'No se pudo completar', description: result.error });
    else { toast({ title: success, description: result.count != null ? `${result.count} registro(s) procesados.` : undefined }); after?.(); router.refresh(); }
  });

  const parseWorkbook = async (file: File) => {
    try {
      const workbook = new ExcelJS.Workbook(); await workbook.xlsx.load(await file.arrayBuffer());
      const sheet = workbook.worksheets[0]; if (!sheet) throw new Error('El archivo no contiene hojas.');
      const headers = (sheet.getRow(1).values as any[]).map((value) => String(value || '').trim().toUpperCase());
      const index = (...names: string[]) => headers.findIndex((header) => names.includes(header));
      const full = index('NOMBRE', 'NOMBRE COMPLETO'); const first = index('NOMBRES', 'NOMBRE(S)'); const paternal = index('APELLIDO PATERNO'); const maternal = index('APELLIDO MATERNO');
      const names: string[] = [];
      sheet.eachRow((row, rowNumber) => {
        if (rowNumber === 1) return; const values = row.values as any[];
        const name = full > 0 ? values[full] : [values[paternal], values[maternal], values[first]].filter(Boolean).join(' ');
        if (String(name || '').trim()) names.push(String(name).trim());
      });
      setBulkNames(names.join('\n')); toast({ title: 'Archivo leído', description: `${names.length} nombres listos para confirmar.` });
    } catch (error) { toast({ variant: 'destructive', title: 'Archivo inválido', description: error instanceof Error ? error.message : 'No se pudo leer.' }); }
  };

  const downloadTemplate = async () => {
    const workbook = new ExcelJS.Workbook(); const sheet = workbook.addWorksheet('Alumnos');
    sheet.columns = [{ header: 'NOMBRE', key: 'name', width: 42 }]; sheet.addRow({ name: 'APELLIDO PATERNO APELLIDO MATERNO NOMBRE(S)' });
    sheet.getRow(1).font = { bold: true }; const buffer = await workbook.xlsx.writeBuffer(); saveAs(new Blob([buffer as BlobPart]), 'plantilla-alumnos-filtro.xlsx');
  };
  const exportStudents = async () => {
    const workbook = new ExcelJS.Workbook(); const sheet = workbook.addWorksheet('Padrón');
    sheet.columns = [{ header: 'NOMBRE', key: 'name', width: 42 }, { header: 'NIVEL', key: 'level', width: 18 }, { header: 'GRADO', key: 'grade', width: 20 }, { header: 'GRUPO', key: 'group', width: 12 }];
    initialData.students.forEach((student: any) => { const group = initialData.groups.find((item: any) => item.id === student.group_id); sheet.addRow({ name: student.full_name, level: levels.get(group?.level_id), grade: group?.grade_name, group: group?.group_name }); });
    sheet.getRow(1).font = { bold: true }; const buffer = await workbook.xlsx.writeBuffer(); saveAs(new Blob([buffer as BlobPart]), 'relacion-alumnos-filtro.xlsx');
  };

  return <div className="space-y-6">
    <div><h1 className="flex items-center gap-2 text-3xl font-bold text-primary"><Users />Carga de alumnos</h1><p className="text-muted-foreground">Padrón cooperativo del Control de Filtro. Los cambios son compartidos y auditados dentro de esta institución.</p></div>
    <div className="grid gap-6 xl:grid-cols-3">
      <Card><CardHeader><CardTitle>1. Crear grado y grupo</CardTitle><CardDescription>Organiza el padrón antes de cargar nombres.</CardDescription></CardHeader><CardContent className="space-y-3">
        <div><Label>Nivel</Label><Input value={levelName} onChange={(e) => setLevelName(e.target.value)} placeholder="Primaria" /></div>
        <div><Label>Grado</Label><Input value={gradeName} onChange={(e) => setGradeName(e.target.value)} placeholder="Primero" /></div>
        <div><Label>Grupo</Label><Input value={groupName} onChange={(e) => setGroupName(e.target.value)} placeholder="A" /></div>
        <Button disabled={pending || !levelName || !gradeName} onClick={() => run(() => upsertFilterStructure({ levelName, gradeName, groupName }), 'Grupo guardado', () => { setGradeName(''); })}><Plus className="mr-2 h-4 w-4" />Guardar grupo</Button>
      </CardContent></Card>
      <Card className="xl:col-span-2"><CardHeader><CardTitle>2. Cargar alumnos</CardTitle><CardDescription>Individualmente, pegando una lista o leyendo la plantilla Excel.</CardDescription></CardHeader><CardContent className="space-y-4">
        <div><Label>Destino</Label><Select value={groupId} onValueChange={setGroupId}><SelectTrigger><SelectValue placeholder="Selecciona nivel, grado y grupo" /></SelectTrigger><SelectContent>{initialData.groups.map((group: any) => <SelectItem key={group.id} value={group.id}>{groupLabel(group)}</SelectItem>)}</SelectContent></Select></div>
        <div className="flex gap-2"><Input value={singleName} onChange={(e) => setSingleName(e.target.value)} placeholder="Nombre completo del alumno" /><Button disabled={pending || !groupId || singleName.trim().length < 2} onClick={() => run(() => addFilterStudents({ groupId, names: [singleName] }), 'Alumno agregado', () => setSingleName(''))}><Plus className="h-4 w-4" /></Button></div>
        <Textarea value={bulkNames} onChange={(e) => setBulkNames(e.target.value)} rows={7} placeholder={'Un nombre completo por renglón\nAPELLIDO PATERNO APELLIDO MATERNO NOMBRE(S)'} />
        <input ref={fileRef} className="hidden" type="file" accept=".xlsx" onChange={(e) => e.target.files?.[0] && parseWorkbook(e.target.files[0])} />
        <div className="flex flex-wrap gap-2"><Button variant="outline" onClick={downloadTemplate}><Download className="mr-2 h-4 w-4" />Descargar plantilla</Button><Button variant="outline" onClick={() => fileRef.current?.click()}><Upload className="mr-2 h-4 w-4" />Leer Excel</Button><Button disabled={pending || !groupId || !bulkNames.trim()} onClick={() => run(() => addFilterStudents({ groupId, names: splitRosterText(bulkNames) }), 'Carga terminada', () => setBulkNames(''))}><FileSpreadsheet className="mr-2 h-4 w-4" />Confirmar carga</Button></div>
      </CardContent></Card>
    </div>
    <Card><CardHeader><div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between"><div><CardTitle>Relación de alumnos</CardTitle><CardDescription>{initialData.students.length} alumnos activos en el tenant.</CardDescription></div><div className="flex flex-wrap gap-2"><Button variant="outline" onClick={exportStudents}><Download className="mr-2 h-4 w-4" />Exportar Excel</Button><Button variant="destructive" disabled={pending || !selected.length} onClick={() => { if (confirm(`¿Eliminar ${selected.length} alumno(s) del padrón activo? El historial de retardos se conservará para auditoría.`)) run(() => deleteFilterStudents(selected), 'Alumnos eliminados', () => setSelected([])); }}><Trash2 className="mr-2 h-4 w-4" />Eliminar seleccionados</Button></div></div></CardHeader><CardContent className="space-y-4">
      <div className="grid gap-3 md:grid-cols-2"><Select value={groupId || 'all'} onValueChange={(value) => setGroupId(value === 'all' ? '' : value)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Todos los grupos</SelectItem>{initialData.groups.map((group: any) => <SelectItem key={group.id} value={group.id}>{groupLabel(group)}</SelectItem>)}</SelectContent></Select><div className="relative"><Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" /><Input className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Filtrar por nombre" /></div></div>
      <div className="overflow-x-auto rounded-md border"><Table><TableHeader><TableRow><TableHead className="w-12"><Checkbox checked={students.length > 0 && students.every((s: any) => selected.includes(s.id))} onCheckedChange={(checked) => setSelected(checked ? students.map((s: any) => s.id) : [])} /></TableHead><TableHead>Nombre</TableHead><TableHead>Nivel, grado y grupo</TableHead></TableRow></TableHeader><TableBody>{students.map((student: any) => { const group = initialData.groups.find((item: any) => item.id === student.group_id); return <TableRow key={student.id}><TableCell><Checkbox checked={selected.includes(student.id)} onCheckedChange={(checked) => setSelected((current) => checked ? [...new Set([...current, student.id])] : current.filter((id) => id !== student.id))} /></TableCell><TableCell className="font-medium">{student.full_name}</TableCell><TableCell>{group ? groupLabel(group) : 'Sin grupo'}</TableCell></TableRow>; })}</TableBody></Table></div>
    </CardContent></Card>
  </div>;
}
