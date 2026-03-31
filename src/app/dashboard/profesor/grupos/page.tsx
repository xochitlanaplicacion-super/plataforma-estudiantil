"use client";

import React, { useEffect, useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Users,
  Search,
  ArrowLeft,
  UserCircle,
  Mail,
  IdCard,
  GraduationCap,
  Calendar,
  AlertCircle,
  Loader2,
  Download,
  FileText
} from 'lucide-react';
import {
  getMyAsignaciones,
  getAlumnosPorGrupo
} from '@/lib/actions/academic';
import { createClient } from '@/lib/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

export default function GruposProfesorPage() {
  const { toast } = useToast();
  const supabase = createClient();
  const [loading, setLoading] = useState(true);
  const [loadingAlumnos, setLoadingAlumnos] = useState(false);
  const [asignaciones, setAsignaciones] = useState<any[]>([]);
  const [selectedAsignacion, setSelectedAsignacion] = useState<any>(null);
  const [alumnos, setAlumnos] = useState<any[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [professorName, setProfessorName] = useState('');
  const [catalogoGrupos, setCatalogoGrupos] = useState<any[]>([]);
  const [catalogoGrados, setCatalogoGrados] = useState<any[]>([]);

  useEffect(() => {
    const fetchData = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data, error } = await getMyAsignaciones(user.id);
        if (data) {
          // Filtrar asignaciones únicas por grupo para evitar duplicados si tiene varias materias en el mismo grupo
          const uniqGroups = data.reduce((acc: any[], current: any) => {
            const x = acc.find(item => item.grupo_id === current.grupo_id);
            if (!x) return acc.concat([current]);
            return acc;
          }, []);
          setAsignaciones(uniqGroups);

          // 2. Resolver Catálogos de Grados y Grupos para los nombres reales
          const allGrupoIds = Array.from(new Set(data.map((asig: any) => asig.grupo_id).filter(Boolean)));
          const allGradoIds = Array.from(new Set(data.map((asig: any) => asig.grado_id).filter(Boolean)));

          if (allGrupoIds.length > 0) {
            const { data: gps } = await supabase.from('grupos').select('id, nombre, turno').in('id', allGrupoIds);
            if (gps) setCatalogoGrupos(gps);
          }
          if (allGradoIds.length > 0) {
            const { data: gds } = await supabase.from('grados').select('id, nombre').in('id', allGradoIds);
            if (gds) setCatalogoGrados(gds);
          }
        }

        // Obtener datos del perfil del profesor
        const { data: profile } = await supabase
          .from('profiles')
          .select('nombre, apellidos')
          .eq('id', user.id)
          .single();
        if (profile) setProfessorName(`${profile.nombre} ${profile.apellidos}`);
      }
      setLoading(false);
    };
    fetchData();
  }, []);

  // Funciones auxiliares para resolver nombres
  const getGradoNombre = (gradoId: string) => {
    if (!gradoId) return 'GENERAL';
    return catalogoGrados.find(g => g.id === gradoId)?.nombre || 'N/A';
  };

  const getGrupoNombre = (grupoId: string) => {
    if (!grupoId) return 'TODOS';
    return catalogoGrupos.find(g => g.id === grupoId)?.nombre || 'N/A';
  };

  const getGrupoTurno = (grupoId: string) => {
    if (!grupoId) return 'N/A';
    return catalogoGrupos.find(g => g.id === grupoId)?.turno || 'N/A';
  };

  const handleSelectGrupo = async (asig: any) => {
    setSelectedAsignacion(asig);
    setLoadingAlumnos(true);
    const { data, error } = await getAlumnosPorGrupo(asig.grupo_id);
    if (data) {
      setAlumnos(data);
    } else {
      toast({ variant: "destructive", title: "Error", description: "No se pudieron cargar los alumnos." });
    }
    setLoadingAlumnos(false);
  };

  const filteredAlumnos = useMemo(() => {
    if (!searchTerm) return alumnos;
    const s = searchTerm.toLowerCase();
    return alumnos.filter(a =>
      a.nombre.toLowerCase().includes(s) ||
      a.apellidos.toLowerCase().includes(s) ||
      (a.matricula && a.matricula.toLowerCase().includes(s))
    );
  }, [alumnos, searchTerm]);

  const handleExportExcel = async () => {
    if (!selectedAsignacion || alumnos.length === 0) return;

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Lista de Asistencia');

    try {
      // 1. Intentar cargar el Logo
      const response = await fetch('/images/logo_zapata.png');
      const buffer = await response.arrayBuffer();
      const logoId = workbook.addImage({
        buffer: buffer,
        extension: 'png',
      });
      worksheet.addImage(logoId, 'A1:A4');
    } catch (e) { console.error("Error cargando logo", e); }

    // 2. Encabezado Institucional
    worksheet.mergeCells('B1:S1');
    const titleCell = worksheet.getCell('B1');
    titleCell.value = 'INSTITUTO EDUCATIVO EMILIANO ZAPATA';
    titleCell.font = { name: 'Arial Black', size: 18, color: { argb: 'FF000000' } };
    titleCell.alignment = { vertical: 'middle', horizontal: 'center' };

    worksheet.mergeCells('B2:S2');
    const subTitleCell = worksheet.getCell('B2');
    subTitleCell.value = 'LISTA DE CONTROL DE ASISTENCIA Y EVALUACIÓN';
    subTitleCell.font = { name: 'Arial', size: 14, bold: true };
    subTitleCell.alignment = { vertical: 'middle', horizontal: 'center' };

    // 3. Información del Grupo y Profesor
    worksheet.addRow([]); // Espacio
    const infoRows = [
      ['DOCENTE:', professorName.toUpperCase(), '', 'NIVEL:', selectedAsignacion.niveles?.nombre?.toUpperCase()],
      ['CARRERA:', selectedAsignacion.carreras?.nombre?.toUpperCase(), '', 'GRUPO:', `${getGradoNombre(selectedAsignacion.grado_id)} - ${getGrupoNombre(selectedAsignacion.grupo_id)}`.toUpperCase()],
      ['FECHA:', new Date().toLocaleDateString('es-MX').toUpperCase(), '', 'TURNO:', getGrupoTurno(selectedAsignacion.grupo_id).toUpperCase()]
    ];

    infoRows.forEach(row => {
      const r = worksheet.addRow(row);
      r.eachCell((cell, colNumber) => {
        if (colNumber === 1 || colNumber === 4) cell.font = { bold: true };
      });
    });

    worksheet.addRow([]); // Espacio antes de la tabla

    // 4. Encabezados de Tabla
    const attendanceCols = Array.from({ length: 15 }, (_, i) => `DÍA ${i + 1}`);
    const headerRow = worksheet.addRow(['N°', 'MATRÍCULA', 'NOMBRE DEL ALUMNO', ...attendanceCols]);

    // Estilo encabezados
    headerRow.eachCell((cell) => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } }; // Slate-800
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 9 };
      cell.alignment = { vertical: 'middle', horizontal: 'center' };
      cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
    });

    // 5. Datos de Alumnos
    alumnos.forEach((alum, index) => {
      const rowData = [
        index + 1,
        alum.matricula || 'N/A',
        `${alum.apellidos}, ${alum.nombre}`.toUpperCase(),
        ...Array(15).fill('') // Espacios para asistencia
      ];
      const r = worksheet.addRow(rowData);
      r.height = 25; // Altura para que sea legible y fácil de escribir
      r.eachCell((cell) => {
        cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
        cell.alignment = { vertical: 'middle' };
        cell.font = { size: 9 };
      });
    });

    // Ajuste de anchos
    worksheet.getColumn(1).width = 5;
    worksheet.getColumn(2).width = 15;
    worksheet.getColumn(3).width = 45;
    for (let i = 4; i <= 18; i++) {
      worksheet.getColumn(i).width = 6;
    }

    // Exportar
    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    saveAs(blob, `Lista_Asistencia_${getGradoNombre(selectedAsignacion.grado_id)}_${getGrupoNombre(selectedAsignacion.grupo_id)}.xlsx`);

    toast({ title: "Excel Generado", description: "La lista se ha descargado correctamente." });
  };

  const handleExportPDF = async () => {
    if (!selectedAsignacion || alumnos.length === 0) return;

    const doc = new jsPDF({
      orientation: 'l',
      unit: 'mm',
      format: 'a4'
    });

    // 1. Logo e Identidad (Esquina Superior Izquierda)
    try {
      const response = await fetch('/images/logo_zapata.png');
      const blob = await response.blob();
      const base64 = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.readAsDataURL(blob);
      });
      doc.addImage(base64, 'PNG', 15, 10, 30, 30);
    } catch (e) { console.error("Logo no cargado", e); }

    // 2. Títulos
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(22);
    doc.setTextColor(30, 41, 59); // Slate-800
    doc.text('INSTITUTO EDUCATIVO EMILIANO ZAPATA', 50, 20);

    doc.setFontSize(14);
    doc.setFont('helvetica', 'normal');
    doc.text('LISTA DE CONTROL DE ASISTENCIA Y EVALUACIÓN', 50, 30);

    // 3. Información Académica (Bloque de datos)
    doc.setFontSize(9);
    doc.setDrawColor(200, 200, 200);
    doc.line(15, 45, 282, 45); // Línea divisoria

    const infoY = 55;
    doc.setFont('helvetica', 'bold');
    doc.text('DOCENTE:', 15, infoY);
    doc.text('CARRERA:', 15, infoY + 7);
    doc.text('MATERIA:', 15, infoY + 14);

    doc.setFont('helvetica', 'normal');
    doc.text(professorName.toUpperCase(), 45, infoY);
    doc.text(selectedAsignacion.carreras?.nombre?.toUpperCase() || '', 45, infoY + 7);
    doc.text(selectedAsignacion.materias?.nombre?.toUpperCase() || 'N/A', 45, infoY + 14);

    doc.setFont('helvetica', 'bold');
    doc.text('NIVEL:', 180, infoY);
    doc.text('GRADO/GRUPO:', 180, infoY + 7);
    doc.text('FECHA IMP.:', 180, infoY + 14);

    doc.setFont('helvetica', 'normal');
    doc.text(selectedAsignacion.niveles?.nombre?.toUpperCase() || '', 210, infoY);
    doc.text(`${getGradoNombre(selectedAsignacion.grado_id)} - ${getGrupoNombre(selectedAsignacion.grupo_id)}`.toUpperCase(), 210, infoY + 7);
    doc.text(new Date().toLocaleDateString('es-MX').toUpperCase(), 210, infoY + 14);

    // 4. Tabla de Asistencia
    const attendanceHeaders = Array.from({ length: 15 }, (_, i) => `${i + 1}`);
    const tableHeaders = [['N°', 'MATRÍCULA', 'NOMBRE DEL ALUMNO', ...attendanceHeaders]];

    const tableData = alumnos.map((alum, index) => [
      index + 1,
      alum.matricula || 'N/A',
      `${alum.apellidos}, ${alum.nombre}`.toUpperCase(),
      ...Array(15).fill('')
    ]);

    autoTable(doc, {
      startY: 80,
      head: tableHeaders,
      body: tableData,
      theme: 'grid',
      headStyles: {
        fillColor: [30, 41, 59],
        textColor: [255, 255, 255],
        fontSize: 8,
        halign: 'center',
        fontStyle: 'bold'
      },
      styles: {
        fontSize: 7,
        cellPadding: 2,
        lineWidth: 0.1,
        lineColor: [0, 0, 0]
      },
      columnStyles: {
        0: { cellWidth: 8, halign: 'center' },
        1: { cellWidth: 25, halign: 'center' },
        2: { cellWidth: 80 },
        // Columnas de asistencia (del 3 al 17)
        ...Object.fromEntries(Array.from({ length: 15 }, (_, i) => [i + 3, { cellWidth: 10, halign: 'center' }]))
      },
      margin: { left: 15, right: 15 },
      didDrawPage: (data) => {
        doc.setFontSize(8);
        doc.text(`Página ${data.pageNumber}`, 282, 200, { align: 'right' });
      }
    });

    // 5. Finalizar y Descargar
    doc.save(`Lista_Asistencia_${getGradoNombre(selectedAsignacion.grado_id)}_${getGrupoNombre(selectedAsignacion.grupo_id)}.pdf`);
    toast({ title: "PDF Generado", description: "Listo para imprimir (Horizontal)" });
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <Loader2 className="h-12 w-12 animate-spin text-primary opacity-20" />
        <p className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-400">Cargando información...</p>
      </div>
    );
  }

  return (
    <div className="space-y-10 pb-20">
      {/* HEADER */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div>
          <h1 className="text-4xl font-black font-headline tracking-tighter text-slate-900 uppercase leading-none">Listas de grupos</h1>
          <p className="text-sm font-bold text-slate-500 uppercase tracking-widest mt-3 flex items-center gap-2">
            <Users className="text-primary h-4 w-4" /> Control de asistencia y alumnos asignados
          </p>
        </div>

        {selectedAsignacion && (
          <Button
            variant="outline"
            className="rounded-2xl border-2 font-black uppercase text-[10px] tracking-widest px-8 hover:bg-slate-100"
            onClick={() => { setSelectedAsignacion(null); setAlumnos([]); setSearchTerm(''); }}
          >
            <ArrowLeft className="mr-2 h-4 w-4" /> Volver a Grupos
          </Button>
        )}
      </div>

      {!selectedAsignacion ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {asignaciones.length === 0 ? (
            <Card className="col-span-full border-2 border-dashed rounded-[40px] p-24 text-center bg-white shadow-inner flex flex-col items-center">
              <Users className="h-20 w-20 text-slate-200 mb-6" />
              <h3 className="text-xl font-black text-slate-800 uppercase">Sin grupos asignados</h3>
              <p className="text-slate-400 text-sm mt-2 font-medium">Contacta al personal de sistemas para verificar tus grupos.</p>
            </Card>
          ) : (
            asignaciones.map((asig) => (
              <Card
                key={asig.id}
                onClick={() => handleSelectGrupo(asig)}
                className="group cursor-pointer hover:shadow-2xl transition-all duration-500 border-2 border-slate-100 hover:border-primary/40 rounded-[32px] bg-white overflow-hidden"
              >
                <div className="h-3 bg-primary/10 group-hover:bg-primary transition-colors duration-500" />
                <CardHeader className="p-8">
                  <Badge className="w-fit text-[9px] font-black bg-primary/5 text-primary border-primary/20 uppercase mb-4 px-3 py-1">{asig.niveles?.nombre}</Badge>
                  <CardTitle className="text-2xl font-black text-slate-800 uppercase leading-tight tracking-tighter mb-4">{asig.carreras?.nombre}</CardTitle>

                  <div className="space-y-3 mt-6">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-xl bg-slate-50 flex items-center justify-center text-slate-400 font-black text-lg">G</div>
                      <div>
                        <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest leading-none">Grado y Grupo</p>
                        <p className="text-lg font-black text-slate-700 uppercase tracking-tight">{getGradoNombre(asig.grado_id)} - {getGrupoNombre(asig.grupo_id)}</p>
                      </div>
                    </div>
                  </div>
                </CardHeader>
                <div className="px-8 pb-8 flex justify-end">
                  <span className="text-[10px] font-black uppercase text-primary tracking-widest underline decoration-2 underline-offset-4 group-hover:scale-110 transition-transform">Ver lista de alumnos</span>
                </div>
              </Card>
            ))
          )}
        </div>
      ) : (
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
          {/* GRUPO INFO HEADER */}
          <Card className="rounded-[40px] border-none bg-slate-900 text-white p-10 overflow-hidden relative group">
            <div className="absolute top-0 right-0 p-10 opacity-10 group-hover:scale-110 transition-transform duration-700">
              <GraduationCap size={150} />
            </div>
            <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-8">
              <div className="space-y-4">
                <Badge className="bg-white/10 text-white border-white/20 uppercase font-black text-[10px] tracking-[0.2em] px-4">{selectedAsignacion.niveles?.nombre}</Badge>
                <h2 className="text-4xl lg:text-5xl font-black tracking-tighter uppercase leading-none">{selectedAsignacion.carreras?.nombre}</h2>
                <div className="flex flex-wrap items-center gap-6 mt-6">
                  <div className="flex items-center gap-3 px-4 py-2 rounded-2xl bg-white/5 border border-white/10">
                    <IdCard className="h-5 w-5 text-primary" />
                    <span className="font-black uppercase tracking-tight text-lg">{getGradoNombre(selectedAsignacion.grado_id)}</span>
                  </div>
                  <div className="flex items-center gap-3 px-4 py-2 rounded-2xl bg-white/5 border border-white/10">
                    <Users className="h-5 w-5 text-primary" />
                    <span className="font-black uppercase tracking-tight text-lg">Grupo {getGrupoNombre(selectedAsignacion.grupo_id)}</span>
                  </div>
                </div>
              </div>
              <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-[32px] p-8 text-center min-w-[200px]">
                <p className="text-[10px] font-black text-white/40 uppercase tracking-[0.3em] mb-2">Alumnos Totales</p>
                <span className="text-6xl font-black text-white tabular-nums">{alumnos.length}</span>
              </div>
            </div>
          </Card>

          {/* STUDENT LIST TABLE */}
          <Card className="rounded-[40px] border-muted/60 shadow-2xl overflow-hidden bg-white">
            <CardHeader className="p-10 border-b flex flex-col md:flex-row md:items-center justify-between gap-6 bg-slate-50/50">
              <div>
                <CardTitle className="text-2xl font-black uppercase text-slate-800 tracking-tight">Lista Oficial de Alumnos</CardTitle>
                <CardDescription className="font-bold text-[10px] uppercase text-slate-400 tracking-widest mt-1">Base de datos de alumnos activos y vigentes.</CardDescription>
              </div>
              <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
                <Button
                  onClick={handleExportExcel}
                  className="h-11 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-black uppercase text-[10px] tracking-widest px-6 shadow-md shadow-emerald-100"
                >
                  <Download className="mr-2 h-4 w-4" /> Excel
                </Button>
                <Button
                  onClick={handleExportPDF}
                  variant="outline"
                  className="h-11 rounded-xl border-2 border-red-200 text-red-600 font-black uppercase text-[10px] tracking-widest px-6 hover:bg-red-50"
                >
                  <FileText className="mr-2 h-4 w-4" /> PDF
                </Button>
                <div className="relative flex-1 md:w-64 min-w-[200px] group">
                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 h-4 w-4 transition-colors group-focus-within:text-primary" />
                  <Input
                    placeholder="BUSCAR ALUMNO..."
                    className="h-11 pl-12 rounded-xl border-2 border-slate-100 bg-white font-bold uppercase text-[10px] tracking-widest focus-visible:ring-primary/20"
                    value={searchTerm}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearchTerm(e.target.value)}
                  />
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {loadingAlumnos ? (
                <div className="h-60 flex flex-col items-center justify-center gap-4">
                  <Loader2 className="animate-spin text-primary h-8 w-8" />
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em]">Cargando lista...</p>
                </div>
              ) : (
                <Table>
                  <TableHeader className="bg-slate-50">
                    <TableRow className="hover:bg-transparent border-slate-100">
                      <TableHead className="py-6 px-10 font-black uppercase tracking-widest text-slate-400 text-[10px]">Alumno</TableHead>
                      <TableHead className="py-6 font-black uppercase tracking-widest text-slate-400 text-[10px]">Matrícula</TableHead>
                      <TableHead className="py-6 font-black uppercase tracking-widest text-slate-400 text-[10px]">Contacto</TableHead>
                      <TableHead className="py-6 pr-10 text-right font-black uppercase tracking-widest text-slate-400 text-[10px]">Fecha Expiración</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredAlumnos.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={4} className="h-60 text-center">
                          <div className="flex flex-col items-center gap-4 opacity-30">
                            <AlertCircle size={48} />
                            <p className="font-black uppercase text-sm tracking-[0.1em]">No se encontraron alumnos</p>
                          </div>
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredAlumnos.map((alum) => (
                        <TableRow key={alum.id} className="group border-slate-50 hover:bg-slate-50/50 transition-colors">
                          <TableCell className="py-6 px-10">
                            <div className="flex items-center gap-4">
                              <div className="h-12 w-12 rounded-2xl bg-primary/5 flex items-center justify-center text-primary group-hover:bg-primary group-hover:text-white transition-all duration-300">
                                <UserCircle size={24} />
                              </div>
                              <div className="flex flex-col">
                                <span className="font-black text-slate-800 uppercase tracking-tight text-lg leading-tight">{alum.apellidos}</span>
                                <span className="font-black text-primary uppercase text-[10px] tracking-wide mt-0.5">{alum.nombre}</span>
                              </div>
                            </div>
                          </TableCell>
                          <TableCell className="py-6">
                            <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-100/50 border border-slate-200 w-fit">
                              <IdCard className="h-4 w-4 text-slate-400" />
                              <span className="font-bold text-slate-600 font-mono text-sm">{alum.matricula || 'SIN MATRÍCULA'}</span>
                            </div>
                          </TableCell>
                          <TableCell className="py-6">
                            <div className="flex flex-col gap-1">
                              <div className="flex items-center gap-2 text-slate-500 hover:text-primary cursor-pointer transition-colors group/mail">
                                <Mail className="h-3 w-3" />
                                <span className="text-[11px] font-bold lowercase truncate max-w-[150px]">{alum.email}</span>
                              </div>
                            </div>
                          </TableCell>
                          <TableCell className="py-6 pr-10 text-right">
                            <div className="flex flex-col items-end gap-1">
                              <div className="flex items-center gap-2 text-slate-700 font-black uppercase text-[10px]">
                                <Calendar className="h-3 w-3 text-primary" />
                                {alum.fecha_expiracion ? new Date(alum.fecha_expiracion).toLocaleDateString('es-MX', { year: 'numeric', month: 'short', day: 'numeric' }) : 'VIGENTE'}
                              </div>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
