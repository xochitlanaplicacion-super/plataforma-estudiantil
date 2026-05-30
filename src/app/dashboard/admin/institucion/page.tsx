"use client";

import React, { useEffect, useState, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle
} from '@/components/ui/alert-dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useToast } from '@/hooks/use-toast';
import { useInstitucion } from '@/hooks/use-institucion';
import { updateInstitucionConfig, uploadLogo } from '@/lib/actions/institucion';
import { getNiveles, upsertNivel } from '@/lib/actions/academic';
import { HexColorPicker } from 'react-colorful';
import { InstitucionConfig, NivelNombre, TemaLogin } from '@/lib/types';
import { HorarioBloque } from '@/lib/actions/horarios';
import {
  Building2, Save, Loader2, Upload, Trash2, Plus, Palette, Image as ImageIcon,
  Phone, Mail, Clock, CalendarDays, Globe, MapPin, GraduationCap, Paintbrush,
  Eye, EyeOff, Info
} from 'lucide-react';

const DAYS_ORDER = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];

const PRESET_COLORS = [
  '#8B2332', '#1A4A3F', '#E8D5B7', '#1e3a5f', '#4a1942', '#0d4f4f',
  '#b91c1c', '#0369a1', '#15803d', '#a16207', '#7e22ce', '#be185d',
  '#334155', '#0f172a', '#991b1b', '#1e40af', '#166534', '#92400e',
];

export default function InstitucionPage() {
  const { toast } = useToast();
  const { config: initialConfig, loading: hookLoading, refresh } = useInstitucion({ bypassCache: true });
  const [saving, setSaving] = useState(false);
  const [cleaning, setCleaning] = useState(false);
  const [showCleanupDialog, setShowCleanupDialog] = useState(false);
  const [uploading, setUploading] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadTarget, setUploadTarget] = useState<string>('logo');
  const [colorModalTarget, setColorModalTarget] = useState<string | null>(null);
  const [tempColor, setTempColor] = useState('#000000');
  const [tempOnChange, setTempOnChange] = useState<((c: string) => void) | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  // ─── Form State ──────────────────────────────────────────────────────────
  const [nombre_completo, setNombreCompleto] = useState('');
  const [nombre_corto, setNombreCorto] = useState('');
  const [siglas, setSiglas] = useState('');
  const [codigo_matricula, setCodigoMatricula] = useState('');
  const [slogan, setSlogan] = useState('');
  const [direccion, setDireccion] = useState('');
  const [sitio_web, setSitioWeb] = useState('');
  const [url_plataforma, setUrlPlataforma] = useState('');
  const [nombre_ia, setNombreIa] = useState('');
  const [logo_url, setLogoUrl] = useState('');
  const [favicon_url, setFaviconUrl] = useState('');
  const [color_primario, setColorPrimario] = useState('#8B2332');
  const [color_secundario, setColorSecundario] = useState('#1A4A3F');
  const [temas_login, setTemasLogin] = useState<TemaLogin[]>([]);
  const [modo_tema_login, setModoTemaLogin] = useState<'aleatorio' | 'fijo'>('aleatorio');
  const [tema_fijo_index, setTemaFijoIndex] = useState(0);
  const [niveles_nombres, setNivelesNombres] = useState<NivelNombre[]>([]);
  const [telefono, setTelefono] = useState('');
  const [correo, setCorreo] = useState('');
  const [bloques, setBloques] = useState<HorarioBloque[]>([]);
  const [dbNiveles, setDbNiveles] = useState<any[]>([]);
  const [nivelImgErrors, setNivelImgErrors] = useState<Record<string, boolean>>({});
  const [nivelImgLoading, setNivelImgLoading] = useState<Record<string, boolean>>({});
  const [orphanCount, setOrphanCount] = useState<number | null>(null);

  // ─── SMTP State ────────────────────────────────────────────────────────
  const [smtp_host, setSmtpHost] = useState('');
  const [smtp_port, setSmtpPort] = useState<number | ''>(465);
  const [smtp_user, setSmtpUser] = useState('');
  const [smtp_password, setSmtpPassword] = useState('');
  const [smtp_from_name, setSmtpFromName] = useState('');
  const [showSmtpPassword, setShowSmtpPassword] = useState(false);
  const [proveedorSmtp, setProveedorSmtp] = useState('custom');

  const handleProveedorChange = (val: string) => {
    setProveedorSmtp(val);
    if (val === 'gmail') {
      setSmtpHost('smtp.gmail.com');
      setSmtpPort(465);
    } else if (val === 'outlook') {
      setSmtpHost('smtp.office365.com');
      setSmtpPort(587);
    }
  };

  // ─── Cargar datos iniciales ──────────────────────────────────────────────
  useEffect(() => {
    getNiveles().then(res => {
      if (res.data) {
        console.log('📷 Niveles cargados:', res.data.map(n => ({
          nombre: n.nombre,
          imagen_bienvenida_url: n.imagen_bienvenida_url || '(vacío)'
        })));
        setDbNiveles(res.data);
      }
      if (res.error) console.error('❌ Error cargando niveles:', res.error);
    });

    fetchOrphanCount();
  }, []);

  const fetchOrphanCount = async () => {
    try {
      const res = await fetch('/api/admin/cleanup-storage');
      if (res.ok) {
        const data = await res.json();
        setOrphanCount(data.count);
      }
    } catch (e) {
      console.warn('No se pudo obtener conteo de huérfanos', e);
    }
  };

  useEffect(() => {
    if (!hookLoading && initialConfig) {
      setNombreCompleto(initialConfig.nombre_completo);
      setNombreCorto(initialConfig.nombre_corto);
      setSiglas(initialConfig.siglas);
      setCodigoMatricula(initialConfig.codigo_matricula ?? '');
      setSlogan(initialConfig.slogan);
      setDireccion(initialConfig.direccion || '');
      setSitioWeb(initialConfig.sitio_web || '');
      setUrlPlataforma(initialConfig.url_plataforma || '');
      setNombreIa(initialConfig.nombre_ia || '');
      setLogoUrl(initialConfig.logo_url || '');
      setFaviconUrl(initialConfig.favicon_url || '');
      setColorPrimario(initialConfig.color_primario);
      setColorSecundario(initialConfig.color_secundario);
      setTemasLogin(initialConfig.temas_login || []);
      setModoTemaLogin(initialConfig.modo_tema_login);
      setTemaFijoIndex(initialConfig.tema_fijo_index);
      setNivelesNombres(initialConfig.niveles_nombres || []);
      setTelefono(initialConfig.telefono_contacto);
      setCorreo(initialConfig.correo_contacto);
      setBloques(initialConfig.horarios_atencion?.length > 0
        ? initialConfig.horarios_atencion
        : [{ dias: ["Lunes","Martes","Miércoles","Jueves","Viernes"], hora_inicio: "09:00", hora_fin: "18:00" }]
      );
      setSmtpHost(initialConfig.smtp_host || '');
      setSmtpPort(initialConfig.smtp_port || 465);
      setSmtpUser(initialConfig.smtp_user || '');
      setSmtpPassword(initialConfig.smtp_password || '');
      setSmtpFromName(initialConfig.smtp_from_name || '');
    }
  }, [hookLoading, initialConfig]);

  // ─── Handlers: Niveles ───────────────────────────────────────────────────
  const addNivel = () => setNivelesNombres([...niveles_nombres, { clave: '', nombre: '' }]);
  const removeNivel = (i: number) => setNivelesNombres(niveles_nombres.filter((_, idx) => idx !== i));
  const updateNivel = (i: number, field: 'clave' | 'nombre', val: string) => {
    const updated = [...niveles_nombres];
    updated[i] = { ...updated[i], [field]: val };
    setNivelesNombres(updated);
  };

  // ─── Handlers: Temas Login ──────────────────────────────────────────────
  const addTema = () => setTemasLogin([...temas_login, { id: `tema_${Date.now()}`, bgImage: '', buttonColor: color_primario, textColor: 'text-white', glassStyle: 'bg-black/20 border-white/30 text-white' }]);
  const removeTema = (i: number) => { if (temas_login.length > 1) setTemasLogin(temas_login.filter((_, idx) => idx !== i)); };
  const updateTema = (i: number, field: keyof TemaLogin, val: string) => {
    const updated = [...temas_login];
    updated[i] = { ...updated[i], [field]: val };
    setTemasLogin(updated);
  };

  const restoreDefaultThemes = () => {
    setTemasLogin([
      { id: "vino", bgImage: "/images/FONDO_ROJO.png", buttonColor: "#8B2332", textColor: "text-white", glassStyle: "bg-black/20 border-white/30 text-white" },
      { id: "verde", bgImage: "/images/FONDOS_VERDE.png", buttonColor: "#1A4A3F", textColor: "text-white", glassStyle: "bg-black/20 border-white/30 text-white" },
      { id: "beige", bgImage: "/images/fondos_beige.jpg", buttonColor: "#E8D5B7", textColor: "text-[#1A4A3F]", glassStyle: "bg-primary/10 border-primary/20 text-primary" },
    ]);
    setColorPrimario('#8B2332');
    setColorSecundario('#1A4A3F');
    setModoTemaLogin('aleatorio');
    setTemaFijoIndex(0);
    toast({ title: "Valores Originales Restaurados", description: "Colores y Temas volvieron a los de fábrica. No olvides Guardar." });
  };

  // ─── Handlers: Horarios ──────────────────────────────────────────────────
  const handleDaySelect = (bIndex: number, day: string) => {
    const updated = [...bloques];
    const b = updated[bIndex];
    b.dias = b.dias.includes(day) ? b.dias.filter(d => d !== day) : [...b.dias, day];
    setBloques(updated);
  };
  const handleTimeChange = (bIndex: number, field: "hora_inicio" | "hora_fin", val: string) => {
    const updated = [...bloques];
    updated[bIndex] = { ...updated[bIndex], [field]: val };
    setBloques(updated);
  };
  const addBloque = () => setBloques([...bloques, { dias: [], hora_inicio: "09:00", hora_fin: "18:00" }]);
  const removeBloque = (i: number) => { if (bloques.length > 1) setBloques(bloques.filter((_, idx) => idx !== i)); };

  // ─── Upload Logo ─────────────────────────────────────────────────────────
  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(uploadTarget);
    const fd = new FormData();
    fd.append('file', file);
    fd.append('tipo', uploadTarget);

    // Pasar la URL actual del archivo para que el servidor lo borre antes de subir el nuevo
    if (uploadTarget === 'logo' && logo_url) fd.append('old_url', logo_url);
    else if (uploadTarget === 'favicon' && favicon_url) fd.append('old_url', favicon_url);
    else if (uploadTarget.startsWith('tema_')) {
      const index = parseInt(uploadTarget.split('_')[1], 10);
      const currentBg = temas_login[index]?.bgImage;
      // Solo borrar si el fondo es una URL de Supabase (no imagen local del proyecto)
      if (currentBg && currentBg.includes('supabase')) fd.append('old_url', currentBg);
    } else if (uploadTarget.startsWith('nivel_')) {
      const index = parseInt(uploadTarget.split('_')[1], 10);
      const currentUrl = dbNiveles[index]?.imagen_bienvenida_url;
      if (currentUrl && currentUrl.includes('supabase')) fd.append('old_url', currentUrl);
    }

    const result = await uploadLogo(fd);
    if (result.success && result.url) {
      if (uploadTarget === 'logo') setLogoUrl(result.url);
      else if (uploadTarget === 'favicon') setFaviconUrl(result.url);
      else if (uploadTarget.startsWith('tema_')) {
        const index = parseInt(uploadTarget.split('_')[1], 10);
        updateTema(index, 'bgImage', result.url);
      } else if (uploadTarget.startsWith('nivel_')) {
        const index = parseInt(uploadTarget.split('_')[1], 10);
        const newNiveles = [...dbNiveles];
        newNiveles[index] = { ...newNiveles[index], imagen_bienvenida_url: result.url };
        setDbNiveles(newNiveles);
      }
      toast({ title: "Imagen subida", description: "La imagen se cargó correctamente." });
    } else {
      toast({ variant: "destructive", title: "Error", description: result.error || "No se pudo subir." });
    }
    setUploading(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const triggerUpload = (tipo: string) => {
    setUploadTarget(tipo);
    setTimeout(() => fileInputRef.current?.click(), 50);
  };

  // ─── Limpiar archivos huérfanos del bucket ───────────────────────────────
  const handleCleanupStorage = () => setShowCleanupDialog(true);

  const executeCleanup = async () => {
    setCleaning(true);
    setShowCleanupDialog(false);
    try {
      const res = await fetch('/api/admin/cleanup-storage', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        toast({ title: '🗑️ Limpieza completa', description: data.message });
        fetchOrphanCount(); // Refrescar el contador
      } else {
        toast({ variant: 'destructive', title: 'Error', description: data.error || 'No se pudo limpiar el bucket.' });
      }
    } catch {
      toast({ variant: 'destructive', title: 'Error', description: 'No se pudo conectar con el servidor.' });
    }
    setCleaning(false);
  };

  // ─── Guardar Todo ────────────────────────────────────────────────────────
  const handleSave = async () => {
    // Validación removida para permitir guardar en blanco y probar los fallbacks genéricos
    for (const b of bloques) {
      if (b.dias.length === 0) {
        toast({ variant: "destructive", title: "Error", description: "Todos los bloques de horario deben tener al menos un día." });
        return;
      }
    }
    setSaving(true);
    const result = await updateInstitucionConfig({
      nombre_completo, nombre_corto, siglas, codigo_matricula: codigo_matricula, slogan, direccion: direccion || undefined,
      sitio_web: sitio_web || undefined, url_plataforma: url_plataforma || undefined, 
      nombre_ia: nombre_ia || undefined, logo_url: logo_url, favicon_url: favicon_url,
      color_primario, color_secundario, temas_login, modo_tema_login, tema_fijo_index,
      niveles_nombres, telefono_contacto: telefono, correo_contacto: correo,
      horarios_atencion: bloques,
      smtp_host: smtp_host || undefined,
      smtp_port: typeof smtp_port === 'number' ? smtp_port : undefined,
      smtp_user: smtp_user || undefined,
      smtp_password: smtp_password || undefined,
      smtp_from_name: smtp_from_name || undefined,
    });

    let errorNiveles = false;
    for (const n of dbNiveles) {
      const res = await upsertNivel(n);
      if (res.error) errorNiveles = true;
    }

    if (result.success && !errorNiveles) {
      toast({ title: "✅ Configuración Guardada", description: "Los cambios se reflejarán en toda la plataforma." });
      refresh();
    } else {
      toast({ variant: "destructive", title: "Error", description: result.error || "Error al guardar configuración de niveles." });
    }
    setSaving(false);
  };

  if (hookLoading) return <div className="flex justify-center py-20"><Loader2 className="animate-spin h-8 w-8 text-primary" /></div>;


  // ─── Abrir modal de color ─────────────────────────────────────────────────
  const openColorModal = (key: string, currentColor: string, onConfirm: (c: string) => void) => {
    setColorModalTarget(key);
    setTempColor(currentColor);
    setTempOnChange(() => onConfirm);
  };
  const closeColorModal = () => setColorModalTarget(null);
  const confirmColor = () => { tempOnChange?.(tempColor); closeColorModal(); };

  // ─── Color Picker Block (pastilla → abre modal) ───────────────────────────
  const ColorPickerBlock = ({ label, color, colorKey, onChange }: { label: string; color: string; colorKey: string; onChange: (c: string) => void }) => (
    <div className="space-y-2">
      <Label className="text-sm font-bold">{label}</Label>
      <div className="flex items-center gap-3">
        <button
          onClick={() => openColorModal(colorKey, color, onChange)}
          className="w-12 h-12 rounded-xl border-2 border-gray-200 shadow-sm hover:scale-105 hover:border-primary transition-all shrink-0"
          style={{ backgroundColor: color }}
          title="Haz clic para elegir color"
        />
        <Input value={color} onChange={e => onChange(e.target.value)} className="font-mono text-sm h-10" maxLength={7} placeholder="#000000" />
      </div>
    </div>
  );



  return (
    <>
      <div className="flex flex-col h-[calc(100vh-4rem)] overflow-hidden -mx-6 -mt-6">

        {/* ── TOP HEADER BAR ── */}
        <div className="flex justify-between items-center bg-white p-4 shadow-sm border-b z-10 shrink-0 px-6">
          <div>
            <h2 className="text-2xl font-bold font-headline tracking-tight text-primary flex items-center gap-2">
              <Building2 className="h-6 w-6" /> Datos de la Institución
            </h2>
            <p className="text-sm text-muted-foreground mt-0.5">Personaliza la identidad. Los cambios se reflejan en toda la plataforma.</p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={handleCleanupStorage} disabled={cleaning || orphanCount === 0} size="sm" className="gap-2 border-red-200 text-red-600 hover:bg-red-50 relative">
              {cleaning ? <Loader2 className="animate-spin" size={14} /> : <Trash2 size={14} />}
              {cleaning ? 'Limpiando...' : 'Limpiar bucket'}
              {orphanCount !== null && orphanCount > 0 && (
                <span className="absolute -top-2 -right-2 bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full border border-white">
                  {orphanCount}
                </span>
              )}
            </Button>
            <Button onClick={handleSave} disabled={saving} className="gap-2 font-bold" size="default">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Guardar Cambios
            </Button>
          </div>
        </div>

        {/* ── SCROLLABLE FORM PANEL ── */}
        <div className="overflow-y-auto p-6 space-y-8 bg-gray-50/50 pb-16">
          <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleUpload} />

      {/* ─── SECCIÓN 1: IDENTIDAD ──────────────────────────────────────────── */}
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><Building2 size={18} /> Identidad de la Institución</CardTitle><CardDescription>Nombre, siglas y slogan que aparecerán en toda la plataforma.</CardDescription></CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-2"><Label className="font-bold">Nombre Completo</Label><Input value={nombre_completo} onChange={e => setNombreCompleto(e.target.value)} placeholder="Ej. Instituto Educativo de Excelencia" /></div>
          <div className="space-y-2"><Label className="font-bold">Nombre Corto</Label><Input value={nombre_corto} onChange={e => setNombreCorto(e.target.value)} placeholder="Ej. Mi Institución" /></div>
          <div className="space-y-2"><Label className="font-bold">Siglas</Label><Input value={siglas} onChange={e => setSiglas(e.target.value)} placeholder="Ej. IE" /></div>
          <div className="space-y-2"><Label className="font-bold">Prefijo de Matrícula (Código)</Label><Input value={codigo_matricula} onChange={e => setCodigoMatricula(e.target.value.toUpperCase())} placeholder="XXXXXX" className="uppercase" /></div>
          <div className="space-y-2"><Label className="font-bold">Slogan / Subtítulo</Label><Input value={slogan} onChange={e => setSlogan(e.target.value)} placeholder="Ej. Plataforma Académica" /></div>
          <div className="space-y-2"><Label className="font-bold">URL de la Plataforma (Botones Correo)</Label><Input value={url_plataforma} onChange={e => setUrlPlataforma(e.target.value)} placeholder="Ej. https://plataforma.ejemplo.edu/" /></div>
          <div className="space-y-2"><Label className="font-bold">Nombre de IA</Label><Input value={nombre_ia} onChange={e => setNombreIa(e.target.value)} placeholder="Ej. Zapatito AI" /></div>
          <div className="space-y-2"><Label className="font-bold">Sitio Web Oficial</Label><Input value={sitio_web} onChange={e => setSitioWeb(e.target.value)} placeholder="Ej. https://mi-escuela.com" /></div>
          <div className="space-y-2 md:col-span-2"><Label className="font-bold">Dirección Física</Label><Input value={direccion} onChange={e => setDireccion(e.target.value)} placeholder="Av. Principal #123..." /></div>
        </CardContent>
      </Card>

      {/* ─── SECCIÓN 2: LOGOS ──────────────────────────────────────────────── */}
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><ImageIcon size={18} /> Logotipos</CardTitle><CardDescription>Sube los logos que se usarán en sidebar, correos, PDFs y favicon.</CardDescription></CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {[
            { label: 'Logo Principal', url: logo_url, tipo: 'logo' as const },
            { label: 'Favicon', url: favicon_url, tipo: 'favicon' as const },
          ].map(item => (
            <div key={item.tipo} className="space-y-3 text-center">
              <Label className="font-bold">{item.label}</Label>
              <div className="h-32 border-2 border-dashed rounded-xl flex items-center justify-center bg-muted/30 overflow-hidden relative group">
                {item.url ? (
                  <>
                    <img src={item.url} alt={item.label} className="max-h-full max-w-full object-contain p-2" />
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex justify-center items-center backdrop-blur-sm">
                      <Button variant="destructive" size="icon" className="rounded-full shadow-lg" onClick={() => setDeleteTarget(item.tipo)}>
                        <Trash2 size={16} />
                      </Button>
                    </div>
                  </>
                ) : <ImageIcon className="text-muted-foreground" size={32} />}
              </div>
              <Button variant="outline" size="sm" className="gap-2 w-full" onClick={() => triggerUpload(item.tipo)} disabled={uploading === item.tipo}>
                {uploading === item.tipo ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />} Subir
              </Button>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* ─── SECCIÓN 3: IMÁGENES POR NIVEL EDUCATIVO ─────────────────────── */}
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><ImageIcon size={18} /> Imágenes por Nivel Educativo</CardTitle><CardDescription>Sube el banner de bienvenida que se enviará a los alumnos de cada nivel por correo.</CardDescription></CardHeader>
        <CardContent className="space-y-4">
          {dbNiveles.length === 0 ? (
            <p className="text-sm text-muted-foreground">No hay niveles configurados. Créalos primero en Estructura Académica.</p>
          ) : (
            dbNiveles.map((n, i) => {
              const imgKey = n.id || `nivel_${i}`;
              const hasError = nivelImgErrors[imgKey];
              const isLoading = nivelImgLoading[imgKey];
              // Cache-bust para forzar recarga en Vercel
              const imgSrc = n.imagen_bienvenida_url
                ? `${n.imagen_bienvenida_url}${n.imagen_bienvenida_url.includes('?') ? '&' : '?'}t=${Date.now()}`
                : null;

              return (
              <div key={n.id} className="flex flex-col md:flex-row md:items-center gap-4 p-4 border rounded-xl bg-card shadow-sm justify-between">
                <div className="space-y-2">
                  <Label className="text-sm font-bold uppercase text-primary">{n.nombre}</Label>
                  <p className="text-[10px] text-muted-foreground">Esta imagen se incluirá en el correo de bienvenida de los alumnos.</p>
                  <Button variant="outline" size="sm" className="mt-2 text-xs" onClick={() => triggerUpload(`nivel_${i}`)} disabled={!!uploading}>
                    {uploading === `nivel_${i}` ? <Loader2 className="animate-spin h-4 w-4 mr-2" /> : <Upload className="h-4 w-4 mr-2" />}
                    {n.imagen_bienvenida_url ? 'Cambiar Imagen' : 'Subir Imagen'}
                  </Button>
                </div>
                {n.imagen_bienvenida_url && (
                  <div className="flex items-center gap-4">
                    <div className="w-48 h-24 rounded-lg overflow-hidden border shrink-0 bg-muted flex items-center justify-center relative group">
                      {/* Loading skeleton */}
                      {isLoading && !hasError && (
                        <div className="absolute inset-0 flex items-center justify-center bg-muted z-10">
                          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                        </div>
                      )}
                      {/* Error state - imagen rota */}
                      {hasError && (
                        <div className="absolute inset-0 flex flex-col items-center justify-center bg-red-50 dark:bg-red-950/20 z-10 p-1">
                          <ImageIcon className="h-5 w-5 text-red-400 mb-1" />
                          <span className="text-[8px] text-red-500 text-center leading-tight">Imagen no encontrada</span>
                          <span className="text-[7px] text-red-300 truncate max-w-full px-1">{n.imagen_bienvenida_url.split('/').pop()?.substring(0, 30)}</span>
                        </div>
                      )}
                      {/* Imagen real */}
                      <img
                        src={imgSrc || ''}
                        alt="Preview"
                        className={`w-full h-full object-cover transition-opacity ${hasError ? 'opacity-0 absolute' : 'opacity-100'}`}
                        onLoad={() => {
                          console.log(`✅ Nivel ${n.nombre}: imagen cargada OK`, n.imagen_bienvenida_url);
                          setNivelImgLoading(prev => ({ ...prev, [imgKey]: false }));
                          setNivelImgErrors(prev => ({ ...prev, [imgKey]: false }));
                        }}
                        onError={() => {
                          console.error(`❌ Nivel ${n.nombre}: imagen NO cargó`, n.imagen_bienvenida_url);
                          setNivelImgLoading(prev => ({ ...prev, [imgKey]: false }));
                          setNivelImgErrors(prev => ({ ...prev, [imgKey]: true }));
                        }}
                        onLoadStart={() => {
                          setNivelImgLoading(prev => ({ ...prev, [imgKey]: true }));
                        }}
                      />
                      {/* Overlay con botón borrar */}
                      {!hasError && (
                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                        <Button variant="destructive" size="icon" className="h-8 w-8" onClick={() => setDeleteTarget(`nivel_${i}`)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                      )}
                    </div>
                    {/* Botón borrar siempre visible si hay error */}
                    {hasError && (
                      <Button variant="outline" size="sm" className="text-xs text-red-500 border-red-200" onClick={() => setDeleteTarget(`nivel_${i}`)}>
                        <Trash2 className="h-3 w-3 mr-1" /> Borrar URL rota
                      </Button>
                    )}
                  </div>
                )}
              </div>
              );
            })
          )}
        </CardContent>
      </Card>

      {/* ─── SECCIÓN 4: COLORES ────────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2"><Palette size={18} /> Colores de la Plataforma</CardTitle>
              <CardDescription>Elige los colores principales. Se aplican en sidebar, botones, correos y más.</CardDescription>
            </div>
            <Button variant="outline" size="sm" onClick={restoreDefaultThemes} className="text-xs shrink-0">
              Restaurar Originales
            </Button>
          </div>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <ColorPickerBlock label="Color Primario" color={color_primario} colorKey="primario" onChange={setColorPrimario} />
          <ColorPickerBlock label="Color Secundario" color={color_secundario} colorKey="secundario" onChange={setColorSecundario} />
        </CardContent>
        <CardContent>
          <div className="flex gap-4 items-center p-4 rounded-xl border bg-muted/20">
            <span className="text-sm font-bold">Vista previa:</span>
            <div className="h-10 w-20 rounded-lg shadow-inner" style={{ backgroundColor: color_primario }} />
            <div className="h-10 w-20 rounded-lg shadow-inner" style={{ backgroundColor: color_secundario }} />
            <span className="text-xs text-muted-foreground">Primario + Secundario</span>
          </div>
        </CardContent>
      </Card>

      {/* ─── SECCIÓN 5: TEMAS DE LOGIN ─────────────────────────────────────── */}
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><Paintbrush size={18} /> Temas de Pantalla de Login</CardTitle><CardDescription>Configura las variantes visuales del inicio de sesión.</CardDescription></CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center gap-4 p-4 border rounded-xl bg-card">
            <Label className="font-bold shrink-0">Modo:</Label>
            <div className="flex items-center gap-2">
              <span className={`text-sm ${modo_tema_login === 'aleatorio' ? 'font-bold text-primary' : 'text-muted-foreground'}`}>Aleatorio</span>
              <Switch checked={modo_tema_login === 'fijo'} onCheckedChange={(checked) => setModoTemaLogin(checked ? 'fijo' : 'aleatorio')} />
              <span className={`text-sm ${modo_tema_login === 'fijo' ? 'font-bold text-primary' : 'text-muted-foreground'}`}>Tema Fijo</span>
            </div>
          </div>

          {temas_login.map((t, i) => (
            <div key={i} className={`p-4 border-2 rounded-xl space-y-4 transition-all ${modo_tema_login === 'fijo' && tema_fijo_index === i ? 'border-primary bg-primary/5' : 'border-muted'}`}>
              <div className="flex items-center justify-between">
                <Badge variant="outline" className="text-xs uppercase">Tema {i + 1}: {t.id}</Badge>
                <div className="flex gap-2">
                  {modo_tema_login === 'fijo' && (<Button size="sm" variant={tema_fijo_index === i ? "default" : "outline"} onClick={() => setTemaFijoIndex(i)} className="text-xs h-7">
                    {tema_fijo_index === i ? '✓ Activo' : 'Usar este'}
                  </Button>)}
                  {temas_login.length > 1 && <Button size="icon" variant="ghost" className="text-red-500 h-7 w-7" onClick={() => removeTema(i)}><Trash2 size={14} /></Button>}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1"><Label className="text-xs font-bold uppercase text-muted-foreground">ID/Nombre</Label><Input value={t.id} onChange={e => updateTema(i, 'id', e.target.value)} /></div>
                <div>
                  <ColorPickerBlock
                    label="Color del Botón / Efectos"
                    color={t.buttonColor}
                    colorKey={`tema_${i}`}
                    onChange={c => updateTema(i, 'buttonColor', c)}
                  />
                </div>
                <div className="col-span-2 space-y-1">
                  <Label className="text-xs font-bold uppercase text-muted-foreground">Imagen de Fondo</Label>
                  <div className="flex gap-2">
                    <Input value={t.bgImage} onChange={e => updateTema(i, 'bgImage', e.target.value)} placeholder="/images/mi_fondo.png o URL externa" />
                    <Button variant="outline" className="shrink-0 gap-2" onClick={() => triggerUpload(`tema_${i}`)} disabled={uploading === `tema_${i}`}>
                      {uploading === `tema_${i}` ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />} Subir
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          ))}
          <Button variant="outline" className="w-full border-dashed border-2 gap-2" onClick={addTema}><Plus size={16} /> Agregar tema</Button>
        </CardContent>
      </Card>

      {/* ─── SECCIÓN 6: CONTACTO Y HORARIOS ────────────────────────────────── */}
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><Clock size={18} /> Contacto y Horarios de Atención</CardTitle><CardDescription>Se muestran en correos, pantalla de expiración y "Acerca de nosotros".</CardDescription></CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-2 gap-4">
            <div className="p-4 border rounded-xl bg-card shadow-sm space-y-2"><label className="text-sm font-semibold flex items-center gap-2"><Phone className="w-4 h-4" /> Teléfono</label><Input type="tel" value={telefono} onChange={e => setTelefono(e.target.value)} placeholder="735 2826206" /></div>
            <div className="p-4 border rounded-xl bg-card shadow-sm space-y-2"><label className="text-sm font-semibold flex items-center gap-2"><Mail className="w-4 h-4" /> Correo Oficial</label><Input type="email" value={correo} onChange={e => setCorreo(e.target.value)} placeholder="contacto@escuela.edu" /></div>
          </div>
          <Separator />
          <h4 className="text-sm font-semibold text-primary">Bloques de Horarios de Atención</h4>
          {bloques.map((b, i) => (
            <div key={i} className="p-4 border rounded-xl bg-card shadow-sm space-y-4 relative">
              {bloques.length > 1 && <Button variant="ghost" size="icon" className="absolute top-2 right-2 text-red-500 hover:text-red-700 hover:bg-red-50" onClick={() => removeBloque(i)}><Trash2 className="h-4 w-4" /></Button>}
              <div><label className="text-sm font-semibold block mb-2">Días de Atención</label>
                <div className="flex flex-wrap gap-3">{DAYS_ORDER.map(d => (
                  <div key={d} className="flex items-center space-x-1.5"><Checkbox id={`b${i}-${d}`} checked={b.dias.includes(d)} onCheckedChange={() => handleDaySelect(i, d)} /><label htmlFor={`b${i}-${d}`} className="text-sm cursor-pointer">{d.substring(0,3)}</label></div>
                ))}</div>
              </div>
              <div className="flex gap-4">
                <div className="flex-1"><label className="text-xs font-semibold text-muted-foreground uppercase block mb-1">Hora Inicio</label><input type="time" value={b.hora_inicio} onChange={e => handleTimeChange(i, "hora_inicio", e.target.value)} className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" /></div>
                <div className="flex-1"><label className="text-xs font-semibold text-muted-foreground uppercase block mb-1">Hora Cierre</label><input type="time" value={b.hora_fin} onChange={e => handleTimeChange(i, "hora_fin", e.target.value)} className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" /></div>
              </div>
            </div>
          ))}
          <Button variant="outline" onClick={addBloque} className="w-full border-dashed border-2 gap-2"><Plus className="h-4 w-4" /> Agregar bloque de horario</Button>
        </CardContent>
      </Card>

      {/* ─── SECCIÓN 7: DIRECCIÓN Y WEB ─── */}
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><MapPin size={18} /> Dirección y Sitio Web</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-2"><Label className="font-bold flex items-center gap-2"><MapPin size={14} /> Dirección Física</Label><Input value={direccion} onChange={e => setDireccion(e.target.value)} placeholder="Calle, Número, Colonia, Ciudad..." /></div>
          <div className="space-y-2"><Label className="font-bold flex items-center gap-2"><Globe size={14} /> Sitio Web</Label><Input value={sitio_web} onChange={e => setSitioWeb(e.target.value)} placeholder="https://www.miescuela.edu.mx" /></div>
        </CardContent>
      </Card>

      {/* ─── SECCIÓN 8: SERVIDOR DE CORREO (SMTP) ─── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Mail size={18} /> Servidor de Correo Saliente (SMTP)</CardTitle>
          <CardDescription>
            Configura las credenciales para que la plataforma pueda enviar correos (bienvenida, recordatorios, etc.). 
            Si dejas esto en blanco, los correos no se enviarán.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 bg-muted/50 p-4 rounded-xl border border-border/50">
            <div>
              <Label className="font-bold flex items-center gap-2">Proveedor <Popover><PopoverTrigger asChild><Info className="h-4 w-4 text-primary cursor-pointer hover:opacity-80" /></PopoverTrigger><PopoverContent className="w-80 text-sm p-4"><p className="mb-2"><strong>¿Qué es SMTP?</strong> Es el servidor que enviará los correos.</p><p className="mb-2"><strong>Gmail / Outlook:</strong> Requieren una <em>"Contraseña de Aplicación"</em> (App Password), NO tu contraseña normal.</p><p className="text-muted-foreground text-xs">Para obtenerla en Gmail: Gestionar tu cuenta &gt; Seguridad &gt; Verificación en 2 pasos &gt; Contraseñas de aplicaciones.</p></PopoverContent></Popover></Label>
              <p className="text-xs text-muted-foreground mt-1">Selecciona un proveedor para autocompletar el Host y el Puerto.</p>
            </div>
            <Select value={proveedorSmtp} onValueChange={handleProveedorChange}>
              <SelectTrigger className="w-full md:w-[200px] bg-background">
                <SelectValue placeholder="Selecciona proveedor" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="gmail">Gmail</SelectItem>
                <SelectItem value="outlook">Outlook / Hotmail</SelectItem>
                <SelectItem value="custom">Otro / Personalizado</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <Label className="font-bold">Servidor SMTP (Host)</Label>
              <Input value={smtp_host} onChange={e => setSmtpHost(e.target.value)} placeholder="Ej: smtp.gmail.com" />
            </div>
            <div className="space-y-2">
              <Label className="font-bold">Puerto</Label>
              <Input type="number" value={smtp_port === '' ? '' : smtp_port} onChange={e => setSmtpPort(e.target.value ? parseInt(e.target.value) : '')} placeholder="Ej: 465" />
            </div>
            <div className="space-y-2">
              <Label className="font-bold">Usuario (Correo Electrónico)</Label>
              <Input type="email" value={smtp_user} onChange={e => setSmtpUser(e.target.value)} placeholder="contacto@miescuela.edu.mx" />
            </div>
            <div className="space-y-2">
              <Label className="font-bold">Contraseña (App Password)</Label>
              <div className="relative">
                <Input type={showSmtpPassword ? "text" : "password"} value={smtp_password} onChange={e => setSmtpPassword(e.target.value)} placeholder="Contraseña de aplicación" className="pr-10" />
                <Button type="button" variant="ghost" size="icon" className="absolute right-0 top-0 h-10 w-10 text-muted-foreground hover:text-foreground" onClick={() => setShowSmtpPassword(!showSmtpPassword)}>
                  {showSmtpPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground mt-1">Es altamente recomendado usar una Contraseña de Aplicación.</p>
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label className="font-bold">Nombre del Remitente</Label>
              <Input value={smtp_from_name} onChange={e => setSmtpFromName(e.target.value)} placeholder="Ej: Servicios Escolares" />
            </div>
          </div>
        </CardContent>
      </Card>

        </div>{/* end scrollable panel */}
      </div>{/* end flex-col full-height */}

    {/* ─── MODAL SELECTOR DE COLOR ───────────────────────────── */}
    <AlertDialog open={!!colorModalTarget} onOpenChange={(o) => !o && closeColorModal()}>
      <AlertDialogContent className="max-w-sm">
        <AlertDialogHeader>
          <AlertDialogTitle>Elige un color</AlertDialogTitle>
        </AlertDialogHeader>
        <div className="space-y-4 py-2">
          {/* Cuadrícula de colores preset */}
          <div className="grid grid-cols-8 gap-1.5">
            {PRESET_COLORS.map(c => (
              <button
                key={c}
                onClick={() => setTempColor(c)}
                className={`w-8 h-8 rounded-lg border-2 transition-all hover:scale-110 ${
                  tempColor === c ? 'border-primary scale-110 shadow-md' : 'border-transparent'
                }`}
                style={{ backgroundColor: c }}
                title={c}
              />
            ))}
          </div>
          {/* HexColorPicker avanzado */}
          <div className="border-t pt-4">
            <HexColorPicker color={tempColor} onChange={setTempColor} style={{ width: '100%' }} />
          </div>
          {/* Input hex + preview */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg border shadow-inner shrink-0" style={{ backgroundColor: tempColor }} />
            <Input
              value={tempColor}
              onChange={e => setTempColor(e.target.value)}
              className="font-mono text-sm"
              maxLength={7}
              placeholder="#000000"
            />
          </div>
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={closeColorModal}>Cancelar</AlertDialogCancel>
          <AlertDialogAction onClick={confirmColor} className="gap-2">
            Seleccionar
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>

    {/* ─── DIALOG CONFIRMACIÓN LIMPIEZA DE BUCKET ─────────────────── */}
    <AlertDialog open={showCleanupDialog} onOpenChange={setShowCleanupDialog}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2 text-red-600">
            <Trash2 size={20} /> Limpiar archivos no usados
          </AlertDialogTitle>
          <AlertDialogDescription className="text-base">
            Esta acción detectará y eliminará permanentemente todos los archivos del
            bucket de almacenamiento que ya <strong>no estén referenciados</strong> en
            la configuración activa (logos, imágenes de landing page, fondos, etc.).
            <br /><br />
            <span className="font-semibold text-red-600">⚠️ Esta acción no se puede deshacer.</span>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            onClick={executeCleanup}
            className="bg-red-600 hover:bg-red-700 text-white"
          >
            <Trash2 size={16} className="mr-2" /> Sí, limpiar bucket
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    {/* ─── MODAL ELIMINAR LOGO ───────────────────────────────────────────── */}
    <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>¿Eliminar imagen?</AlertDialogTitle>
          <AlertDialogDescription>
            ¿Estás seguro de que deseas eliminar este archivo de imagen? La plataforma volverá a usar el logo en blanco (marca blanca) por defecto.
            Recuerda dar clic en "Guardar Cambios" después para aplicar esta configuración.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => setDeleteTarget(null)}>Cancelar</AlertDialogCancel>
          <AlertDialogAction 
            className="bg-red-600 hover:bg-red-700 text-white" 
            onClick={() => {
              if (deleteTarget === 'logo') setLogoUrl('');
              else if (deleteTarget === 'favicon') setFaviconUrl('');
              else if (deleteTarget?.startsWith('nivel_')) {
                const index = parseInt(deleteTarget.split('_')[1], 10);
                const newNiveles = [...dbNiveles];
                newNiveles[index] = { ...newNiveles[index], imagen_bienvenida_url: null };
                setDbNiveles(newNiveles);
              }
              setDeleteTarget(null);
              toast({ title: "Imagen removida", description: "Da clic en Guardar Cambios para persistir el cambio." });
            }}
          >
            Sí, eliminar
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    </>
  );
}
