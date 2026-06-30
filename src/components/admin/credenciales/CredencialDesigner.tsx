'use client';

import React, { useState, useRef } from 'react';
import { useToast } from '@/hooks/use-toast';
import {
  updateConfigCredenciales,
  uploadWatermarkImage,
  deleteWatermarkImage,
  uploadReversoImage,
  deleteReversoImage,
  uploadFirmaDirector,
  deleteFirmaDirector,
  uploadSelloInstitucion,
  deleteSelloInstitucion,
} from '@/lib/actions/credenciales';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { Loader2, Save, Upload, Trash2, ImageIcon, AlertTriangle, RotateCcw, Stamp, PenLine } from 'lucide-react';
import { CredencialPreview } from './CredencialPreview';
import { CredencialReversoPreview } from './CredencialReversoPreview';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

import { useRouter } from 'next/navigation';

const GOOGLE_FONTS = [
  'Montserrat', 'Open Sans', 'Roboto', 'Inter', 'Poppins', 
  'Lato', 'Oswald', 'Raleway', 'Nunito', 'Playfair Display',
  'Ubuntu', 'Merriweather', 'PT Sans', 'Rubik', 'Work Sans',
  'Bebas Neue', 'Barlow', 'DM Sans', 'Outfit', 'Space Grotesk',
  'Mulish', 'Quicksand', 'Josefin Sans', 'Archivo', 'Fira Sans',
  'Source Sans 3', 'Manrope', 'Plus Jakarta Sans', 'Red Hat Display', 'Lexend'
];

const TRAMA_OPTIONS = [
  { value: 'ninguno', label: '🚫 Sin Trama' },
  { value: 'puntos', label: '⚬ Puntos' },
  { value: 'rayas_diag', label: '╲ Rayas Diagonales' },
  { value: 'rayas_horiz', label: '═ Rayas Horizontales' },
  { value: 'cuadricula', label: '▦ Cuadrícula' },
  { value: 'rombos', label: '◆ Rombos' },
  { value: 'hexagonos', label: '⬡ Hexágonos' },
  { value: 'chevron', label: '⌃ Chevron / Zigzag' },
  { value: 'escamas', label: '◠ Escamas' },
  { value: 'cruces', label: '✚ Cruces' },
  { value: 'estrellas', label: '✦ Estrellas' },
  { value: 'circulos_conc', label: '◎ Círculos Concéntricos' },
  { value: 'ondas', label: '〰 Ondas' },
  { value: 'imagen', label: '🖼 Marca de Agua (Imagen)' },
];

const PANEL_OPTIONS = [
  { value: 'plano', label: '▯ Plano (Clásico)' },
  { value: 'ondas', label: '〰 Ondas' },
  { value: 'diagonal', label: '╱ Corte Diagonal' },
  { value: 'arco', label: '◠ Arco' },
  { value: 'doble_onda', label: '≈ Doble Onda' },
  { value: 'geometrico', label: '◇ Geométrico' },
];

interface CredencialDesignerProps {
  initialConfig: any;
  institucion: any;
}

export function CredencialDesigner({ initialConfig, institucion }: CredencialDesignerProps) {
  const { toast } = useToast();
  const router = useRouter();
  const [isSaving, setIsSaving] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  // Reverso states
  const [isUploadingReverso, setIsUploadingReverso] = useState(false);
  const [isDeletingReverso, setIsDeletingReverso] = useState(false);
  const [showDeleteReversoDialog, setShowDeleteReversoDialog] = useState(false);
  const [isUploadingFirma, setIsUploadingFirma] = useState(false);
  const [isDeletingFirma, setIsDeletingFirma] = useState(false);
  const [showDeleteFirmaDialog, setShowDeleteFirmaDialog] = useState(false);
  const [isUploadingSello, setIsUploadingSello] = useState(false);
  const [isDeletingSello, setIsDeletingSello] = useState(false);
  const [showDeleteSelloDialog, setShowDeleteSelloDialog] = useState(false);
  const [previewSide, setPreviewSide] = useState<'frente' | 'reverso'>('frente');
  const [config, setConfig] = useState({
    ...initialConfig,
    trama_tipo: initialConfig.trama_tipo || 'ninguno',
    trama_escala: initialConfig.trama_escala || 50,
    trama_rotacion: initialConfig.trama_rotacion || 0,
    trama_opacidad: initialConfig.trama_opacidad || 10,
    trama_imagen_url: initialConfig.trama_imagen_url || null,
    logo_x: initialConfig.logo_x || 0,
    logo_y: initialConfig.logo_y || 0,
    logo_escala: initialConfig.logo_escala || 100,
    panel_diseno: initialConfig.panel_diseno || 'plano',
    color_panel_izquierdo: initialConfig.color_panel_izquierdo || '#ffffff',
    reverso_imagen_url: initialConfig.reverso_imagen_url || null,
    firma_director_url: initialConfig.firma_director_url || null,
    sello_institucion_url: initialConfig.sello_institucion_url || null,
    reverso_texto_legal: initialConfig.reverso_texto_legal || '',
  });
  const fileInputRef = useRef<HTMLInputElement>(null);
  const reversoFileInputRef = useRef<HTMLInputElement>(null);
  const firmaFileInputRef = useRef<HTMLInputElement>(null);
  const selloFileInputRef = useRef<HTMLInputElement>(null);

  const demoAlumno = {
    nombre: 'JUAN PÉREZ',
    apellidos: 'GARCÍA',
    nivel: 'LICENCIATURA',
    carrera: 'INGENIERÍA EN SOFTWARE',
    matricula: '20260001',
    foto_perfil: null
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const res = await updateConfigCredenciales(config);
      if (res.success) {
        toast({ title: 'Diseño guardado correctamente' });
        router.refresh();
      } else {
        throw new Error(res.error);
      }
    } catch (error: any) {
      toast({ title: 'Error al guardar diseño', description: error.message, variant: 'destructive' });
    } finally {
      setIsSaving(false);
    }
  };

  const handleWatermarkUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await uploadWatermarkImage(formData);
      if (res.success && res.url) {
        setConfig({ ...config, trama_imagen_url: res.url, trama_tipo: 'imagen' });
        toast({ title: 'Imagen de marca de agua subida correctamente' });
      } else {
        throw new Error(res.error || 'Error al subir');
      }
    } catch (error: any) {
      toast({ title: 'Error al subir imagen', description: error.message, variant: 'destructive' });
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleDeleteWatermark = async () => {
    setIsDeleting(true);
    try {
      const res = await deleteWatermarkImage();
      if (res.success) {
        setConfig({ ...config, trama_imagen_url: null, trama_tipo: 'ninguno' });
        toast({ title: 'Imagen de marca de agua eliminada' });
      }
    } catch (error: any) {
      toast({ title: 'Error al eliminar', description: error.message, variant: 'destructive' });
    } finally {
      setIsDeleting(false);
      setShowDeleteDialog(false);
    }
  };

  // ─── REVERSO HANDLERS ───────────────────────────────────
  const handleReversoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      toast({ title: 'El archivo excede 10MB', variant: 'destructive' });
      return;
    }
    setIsUploadingReverso(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await uploadReversoImage(formData);
      if (res.success && res.url) {
        setConfig({ ...config, reverso_imagen_url: res.url });
        toast({ title: 'Imagen de reverso subida correctamente' });
      } else {
        throw new Error(res.error || 'Error al subir');
      }
    } catch (error: any) {
      toast({ title: 'Error al subir imagen', description: error.message, variant: 'destructive' });
    } finally {
      setIsUploadingReverso(false);
      if (reversoFileInputRef.current) reversoFileInputRef.current.value = '';
    }
  };

  const handleDeleteReverso = async () => {
    setIsDeletingReverso(true);
    try {
      const res = await deleteReversoImage();
      if (res.success) {
        setConfig({ ...config, reverso_imagen_url: null });
        toast({ title: 'Imagen de reverso eliminada' });
      }
    } catch (error: any) {
      toast({ title: 'Error al eliminar', description: error.message, variant: 'destructive' });
    } finally {
      setIsDeletingReverso(false);
      setShowDeleteReversoDialog(false);
    }
  };

  const handleFirmaUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsUploadingFirma(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await uploadFirmaDirector(formData);
      if (res.success && res.url) {
        setConfig({ ...config, firma_director_url: res.url });
        toast({ title: 'Firma del director subida correctamente' });
      } else {
        throw new Error(res.error || 'Error al subir');
      }
    } catch (error: any) {
      toast({ title: 'Error al subir firma', description: error.message, variant: 'destructive' });
    } finally {
      setIsUploadingFirma(false);
      if (firmaFileInputRef.current) firmaFileInputRef.current.value = '';
    }
  };

  const handleDeleteFirma = async () => {
    setIsDeletingFirma(true);
    try {
      const res = await deleteFirmaDirector();
      if (res.success) {
        setConfig({ ...config, firma_director_url: null });
        toast({ title: 'Firma eliminada' });
      }
    } catch (error: any) {
      toast({ title: 'Error al eliminar', description: error.message, variant: 'destructive' });
    } finally {
      setIsDeletingFirma(false);
      setShowDeleteFirmaDialog(false);
    }
  };

  const handleSelloUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsUploadingSello(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await uploadSelloInstitucion(formData);
      if (res.success && res.url) {
        setConfig({ ...config, sello_institucion_url: res.url });
        toast({ title: 'Sello de institución subido correctamente' });
      } else {
        throw new Error(res.error || 'Error al subir');
      }
    } catch (error: any) {
      toast({ title: 'Error al subir sello', description: error.message, variant: 'destructive' });
    } finally {
      setIsUploadingSello(false);
      if (selloFileInputRef.current) selloFileInputRef.current.value = '';
    }
  };

  const handleDeleteSello = async () => {
    setIsDeletingSello(true);
    try {
      const res = await deleteSelloInstitucion();
      if (res.success) {
        setConfig({ ...config, sello_institucion_url: null });
        toast({ title: 'Sello eliminado' });
      }
    } catch (error: any) {
      toast({ title: 'Error al eliminar', description: error.message, variant: 'destructive' });
    } finally {
      setIsDeletingSello(false);
      setShowDeleteSelloDialog(false);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
      {/* Columna Izquierda: Formulario */}
      <div className="space-y-6 bg-white p-6 rounded-xl border shadow-sm max-h-[80vh] overflow-y-auto">
        
        {/* ===================== PALETA DE COLORES ===================== */}
        <div>
          <h3 className="text-lg font-semibold mb-1">Paleta de Colores</h3>
          <p className="text-sm text-muted-foreground mb-4">Ajusta los colores principales de la credencial.</p>
          
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Color Primario (Fondo)</Label>
              <div className="flex gap-2">
                <Input 
                  type="color" 
                  value={config.color_primario} 
                  onChange={(e) => setConfig({ ...config, color_primario: e.target.value })}
                  className="w-12 h-10 p-1 cursor-pointer"
                />
                <Input 
                  value={config.color_primario} 
                  onChange={(e) => setConfig({ ...config, color_primario: e.target.value })}
                  className="flex-1 font-mono uppercase"
                />
              </div>
            </div>
            
            <div className="space-y-2">
              <Label>Color Secundario (Detalles)</Label>
              <div className="flex gap-2">
                <Input 
                  type="color" 
                  value={config.color_secundario} 
                  onChange={(e) => setConfig({ ...config, color_secundario: e.target.value })}
                  className="w-12 h-10 p-1 cursor-pointer"
                />
                <Input 
                  value={config.color_secundario} 
                  onChange={(e) => setConfig({ ...config, color_secundario: e.target.value })}
                  className="flex-1 font-mono uppercase"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Texto sobre Fondo Primario</Label>
              <div className="flex gap-2">
                <Input 
                  type="color" 
                  value={config.color_texto_primario} 
                  onChange={(e) => setConfig({ ...config, color_texto_primario: e.target.value })}
                  className="w-12 h-10 p-1 cursor-pointer"
                />
                <Input 
                  value={config.color_texto_primario} 
                  onChange={(e) => setConfig({ ...config, color_texto_primario: e.target.value })}
                  className="flex-1 font-mono uppercase"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Texto Decorativo Pequeño</Label>
              <div className="flex gap-2">
                <Input 
                  type="color" 
                  value={config.color_texto_secundario} 
                  onChange={(e) => setConfig({ ...config, color_texto_secundario: e.target.value })}
                  className="w-12 h-10 p-1 cursor-pointer"
                />
                <Input 
                  value={config.color_texto_secundario} 
                  onChange={(e) => setConfig({ ...config, color_texto_secundario: e.target.value })}
                  className="flex-1 font-mono uppercase"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Color del Panel Izquierdo</Label>
              <div className="flex gap-2">
                <Input 
                  type="color" 
                  value={config.color_panel_izquierdo} 
                  onChange={(e) => setConfig({ ...config, color_panel_izquierdo: e.target.value })}
                  className="w-12 h-10 p-1 cursor-pointer"
                />
                <Input 
                  value={config.color_panel_izquierdo} 
                  onChange={(e) => setConfig({ ...config, color_panel_izquierdo: e.target.value })}
                  className="flex-1 font-mono uppercase"
                />
              </div>
            </div>
          </div>
        </div>

        {/* ===================== TIPOGRAFÍA ===================== */}
        <div className="border-t pt-6">
          <h3 className="text-lg font-semibold mb-1">Tipografía</h3>
          <p className="text-sm text-muted-foreground mb-4">Selecciona las fuentes (Google Fonts).</p>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Fuente Principal (Datos)</Label>
              <Select value={config.fuente_principal} onValueChange={(v) => setConfig({ ...config, fuente_principal: v })}>
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar fuente" />
                </SelectTrigger>
                <SelectContent>
                  {GOOGLE_FONTS.map(font => (
                    <SelectItem key={font} value={font} style={{ fontFamily: font }}>{font}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Fuente Secundaria (Títulos)</Label>
              <Select value={config.fuente_secundaria} onValueChange={(v) => setConfig({ ...config, fuente_secundaria: v })}>
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar fuente" />
                </SelectTrigger>
                <SelectContent>
                  {GOOGLE_FONTS.map(font => (
                    <SelectItem key={font} value={font} style={{ fontFamily: font }}>{font}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        {/* ===================== TRAMA DE FONDO ===================== */}
        <div className="border-t pt-6">
          <h3 className="text-lg font-semibold mb-1">Trama de Fondo</h3>
          <p className="text-sm text-muted-foreground mb-4">Selecciona un patrón decorativo para el fondo de la credencial.</p>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Tipo de Trama</Label>
              <Select value={config.trama_tipo} onValueChange={(v) => setConfig({ ...config, trama_tipo: v })}>
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar trama" />
                </SelectTrigger>
                <SelectContent>
                  {TRAMA_OPTIONS.map(opt => (
                    <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Watermark image upload (only when tipo is 'imagen') */}
            {config.trama_tipo === 'imagen' && (
              <div className="space-y-3 p-4 bg-gray-50 rounded-lg border">
                <Label className="flex items-center gap-2"><ImageIcon className="h-4 w-4" /> Imagen de Marca de Agua</Label>
                
                {config.trama_imagen_url && (
                  <div className="flex items-center gap-3 p-2 bg-white rounded border">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={config.trama_imagen_url} alt="Watermark" className="h-12 w-12 object-contain" />
                    <span className="text-xs text-muted-foreground flex-1 truncate">Imagen cargada</span>
                    <Button 
                      variant="destructive" 
                      size="sm" 
                      onClick={() => setShowDeleteDialog(true)}
                      disabled={isDeleting}
                    >
                      <Trash2 className="h-3 w-3 mr-1" /> Eliminar
                    </Button>
                  </div>
                )}

                <div className="flex gap-2">
                  <input 
                    ref={fileInputRef}
                    type="file" 
                    accept="image/png,image/jpeg,image/svg+xml,image/webp"
                    className="hidden"
                    onChange={handleWatermarkUpload}
                  />
                  <Button 
                    variant="outline" 
                    className="w-full"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isUploading}
                  >
                    {isUploading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Upload className="h-4 w-4 mr-2" />}
                    {config.trama_imagen_url ? 'Reemplazar Imagen' : 'Subir Imagen'}
                  </Button>
                </div>
                <p className="text-[11px] text-muted-foreground">La imagen se convertirá automáticamente a blanco como sombra/watermark.</p>
              </div>
            )}

            {/* Pattern controls (when a pattern is selected) */}
            {config.trama_tipo !== 'ninguno' && (
              <div className="space-y-4 p-4 bg-gray-50 rounded-lg border">
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <Label className="text-sm">Tamaño / Escala</Label>
                    <span className="text-xs text-muted-foreground font-mono">{config.trama_escala}px</span>
                  </div>
                  <Slider 
                    value={[config.trama_escala]} 
                    onValueChange={([v]) => setConfig({ ...config, trama_escala: v })} 
                    min={10} max={200} step={2}
                  />
                </div>

                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <Label className="text-sm">Rotación</Label>
                    <span className="text-xs text-muted-foreground font-mono">{config.trama_rotacion}°</span>
                  </div>
                  <Slider 
                    value={[config.trama_rotacion]} 
                    onValueChange={([v]) => setConfig({ ...config, trama_rotacion: v })} 
                    min={-180} max={180} step={1}
                  />
                </div>

                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <Label className="text-sm">Opacidad</Label>
                    <span className="text-xs text-muted-foreground font-mono">{config.trama_opacidad}%</span>
                  </div>
                  <Slider 
                    value={[config.trama_opacidad]} 
                    onValueChange={([v]) => setConfig({ ...config, trama_opacidad: v })} 
                    min={1} max={50} step={1}
                  />
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ===================== DISEÑO DEL PANEL ===================== */}
        <div className="border-t pt-6">
          <h3 className="text-lg font-semibold mb-1">Diseño del Panel (Logo)</h3>
          <p className="text-sm text-muted-foreground mb-4">Personaliza la forma del panel izquierdo donde se muestra el logo.</p>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Forma del Panel</Label>
              <Select value={config.panel_diseno} onValueChange={(v) => setConfig({ ...config, panel_diseno: v })}>
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar diseño" />
                </SelectTrigger>
                <SelectContent>
                  {PANEL_OPTIONS.map(opt => (
                    <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        {/* ===================== TAMAÑO Y POSICIÓN DEL LOGO ===================== */}
        <div className="border-t pt-6">
          <h3 className="text-lg font-semibold mb-1">Ajustes del Logo</h3>
          <p className="text-sm text-muted-foreground mb-4">Ajusta el tamaño y la posición del logo dentro del panel izquierdo.</p>

          <div className="space-y-4">
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <Label className="text-sm">Tamaño / Escala del Logo</Label>
                <span className="text-xs text-muted-foreground font-mono">{config.logo_escala}%</span>
              </div>
              <Slider 
                value={[config.logo_escala]} 
                onValueChange={([v]) => setConfig({ ...config, logo_escala: v })} 
                min={20} max={200} step={1}
              />
            </div>

            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <Label className="text-sm">Posición Horizontal (X)</Label>
                <span className="text-xs text-muted-foreground font-mono">{config.logo_x}px</span>
              </div>
              <Slider 
                value={[config.logo_x]} 
                onValueChange={([v]) => setConfig({ ...config, logo_x: v })} 
                min={-50} max={50} step={1}
              />
            </div>

            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <Label className="text-sm">Posición Vertical (Y)</Label>
                <span className="text-xs text-muted-foreground font-mono">{config.logo_y}px</span>
              </div>
              <Slider 
                value={[config.logo_y]} 
                onValueChange={([v]) => setConfig({ ...config, logo_y: v })} 
                min={-50} max={50} step={1}
              />
            </div>
          </div>
        </div>

        {/* ===================== DISEÑO DEL REVERSO ===================== */}
        <div className="border-t pt-6">
          <h3 className="text-lg font-semibold mb-1">Diseño del Reverso</h3>
          <p className="text-sm text-muted-foreground mb-4">
            Configura el reverso de la credencial. Puedes subir una imagen completa o personalizar el diseño digital.
          </p>

          {/* Imagen de Reverso Completo */}
          <div className="space-y-3 p-4 bg-amber-50 rounded-lg border border-amber-200 mb-4">
            <Label className="flex items-center gap-2 font-semibold">
              <ImageIcon className="h-4 w-4" />
              Imagen de Reverso Completo (opcional)
            </Label>
            <p className="text-[11px] text-muted-foreground">
              Si subes una imagen aquí, se usará como fondo completo del reverso reemplazando el diseño digital. Máx. 10MB.
            </p>

            {config.reverso_imagen_url && (
              <div className="flex items-center gap-3 p-2 bg-white rounded border">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={config.reverso_imagen_url} alt="Reverso" className="h-12 w-20 object-cover rounded" />
                <span className="text-xs text-muted-foreground flex-1 truncate">Imagen de reverso cargada</span>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => setShowDeleteReversoDialog(true)}
                  disabled={isDeletingReverso}
                >
                  <Trash2 className="h-3 w-3 mr-1" /> Eliminar
                </Button>
              </div>
            )}

            <input
              ref={reversoFileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="hidden"
              onChange={handleReversoUpload}
            />
            <Button
              variant="outline"
              className="w-full"
              onClick={() => reversoFileInputRef.current?.click()}
              disabled={isUploadingReverso}
            >
              {isUploadingReverso ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Upload className="h-4 w-4 mr-2" />}
              {config.reverso_imagen_url ? 'Reemplazar Imagen de Reverso' : 'Subir Imagen de Reverso'}
            </Button>
          </div>

          {/* Digital reverse design (only meaningful when no image uploaded) */}
          <div className={`space-y-4 p-4 bg-gray-50 rounded-lg border ${config.reverso_imagen_url ? 'opacity-50 pointer-events-none' : ''}`}>
            {config.reverso_imagen_url && (
              <p className="text-xs text-amber-600 font-semibold">⚠ El diseño digital está desactivado porque hay una imagen de reverso subida.</p>
            )}

            {/* Texto Legal */}
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <PenLine className="h-4 w-4" />
                Texto Legal / Aviso
              </Label>
              <Textarea
                value={config.reverso_texto_legal}
                onChange={(e) => setConfig({ ...config, reverso_texto_legal: e.target.value })}
                placeholder="Esta credencial es propiedad de la institución..."
                className="text-xs min-h-[60px]"
                maxLength={300}
              />
              <p className="text-[10px] text-muted-foreground text-right">{(config.reverso_texto_legal || '').length}/300</p>
            </div>

            {/* Firma del Director */}
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <PenLine className="h-4 w-4" />
                Firma del Director
              </Label>
              {config.firma_director_url && (
                <div className="flex items-center gap-3 p-2 bg-white rounded border">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={config.firma_director_url} alt="Firma" className="h-10 w-20 object-contain" />
                  <span className="text-xs text-muted-foreground flex-1 truncate">Firma cargada</span>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => setShowDeleteFirmaDialog(true)}
                    disabled={isDeletingFirma}
                  >
                    <Trash2 className="h-3 w-3 mr-1" /> Eliminar
                  </Button>
                </div>
              )}
              <input
                ref={firmaFileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="hidden"
                onChange={handleFirmaUpload}
              />
              <Button
                variant="outline"
                size="sm"
                className="w-full"
                onClick={() => firmaFileInputRef.current?.click()}
                disabled={isUploadingFirma}
              >
                {isUploadingFirma ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Upload className="h-4 w-4 mr-2" />}
                {config.firma_director_url ? 'Reemplazar Firma' : 'Subir Firma'}
              </Button>
            </div>

            {/* Sello Institucional */}
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <Stamp className="h-4 w-4" />
                Sello de la Institución
              </Label>
              {config.sello_institucion_url && (
                <div className="flex items-center gap-3 p-2 bg-white rounded border">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={config.sello_institucion_url} alt="Sello" className="h-10 w-10 object-contain" />
                  <span className="text-xs text-muted-foreground flex-1 truncate">Sello cargado</span>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => setShowDeleteSelloDialog(true)}
                    disabled={isDeletingSello}
                  >
                    <Trash2 className="h-3 w-3 mr-1" /> Eliminar
                  </Button>
                </div>
              )}
              <input
                ref={selloFileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="hidden"
                onChange={handleSelloUpload}
              />
              <Button
                variant="outline"
                size="sm"
                className="w-full"
                onClick={() => selloFileInputRef.current?.click()}
                disabled={isUploadingSello}
              >
                {isUploadingSello ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Upload className="h-4 w-4 mr-2" />}
                {config.sello_institucion_url ? 'Reemplazar Sello' : 'Subir Sello'}
              </Button>
            </div>
          </div>
        </div>

        {/* ===================== GUARDAR ===================== */}
        <div className="pt-4 border-t">
          <Button onClick={handleSave} disabled={isSaving} className="w-full">
            {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
            Guardar Diseño
          </Button>
        </div>
      </div>

      {/* Columna Derecha: Vista Previa */}
      <div className="flex flex-col items-center bg-gray-50 p-6 rounded-xl border justify-center min-h-[400px] sticky top-4">
        <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-4">Vista Previa en Tiempo Real</h3>
        
        {/* Toggle Frente / Reverso */}
        <div className="flex gap-2 mb-4">
          <Button
            size="sm"
            variant={previewSide === 'frente' ? 'default' : 'outline'}
            onClick={() => setPreviewSide('frente')}
            className="text-xs"
          >
            Frente
          </Button>
          <Button
            size="sm"
            variant={previewSide === 'reverso' ? 'default' : 'outline'}
            onClick={() => setPreviewSide('reverso')}
            className="text-xs"
          >
            <RotateCcw className="h-3 w-3 mr-1" />
            Reverso
          </Button>
        </div>

        {previewSide === 'frente' ? (
          <CredencialPreview 
            config={config} 
            alumno={demoAlumno} 
            institucion={institucion} 
            showDownloadOptions={false}
          />
        ) : (
          <CredencialReversoPreview
            config={config}
            alumno={demoAlumno}
            institucion={institucion}
          />
        )}
        <p className="text-xs text-gray-400 mt-6 text-center max-w-xs">
          Esta vista es solo de referencia. Los datos del alumno variarán según cada caso.
        </p>
      </div>

      {/* Delete Confirmation Dialog - Watermark */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-red-500" />
              ¿Eliminar imagen de marca de agua?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción eliminará permanentemente la imagen de marca de agua del servidor. No se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleDeleteWatermark}
              className="bg-red-600 hover:bg-red-700"
              disabled={isDeleting}
            >
              {isDeleting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Trash2 className="h-4 w-4 mr-2" />}
              Sí, eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Confirmation Dialog - Reverso Image */}
      <AlertDialog open={showDeleteReversoDialog} onOpenChange={setShowDeleteReversoDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-red-500" />
              ¿Eliminar imagen de reverso?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción eliminará permanentemente la imagen del reverso del servidor. Se volverá a mostrar el diseño digital por defecto.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteReverso}
              className="bg-red-600 hover:bg-red-700"
              disabled={isDeletingReverso}
            >
              {isDeletingReverso ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Trash2 className="h-4 w-4 mr-2" />}
              Sí, eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Confirmation Dialog - Firma */}
      <AlertDialog open={showDeleteFirmaDialog} onOpenChange={setShowDeleteFirmaDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-red-500" />
              ¿Eliminar firma del director?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción eliminará permanentemente la firma del servidor.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteFirma}
              className="bg-red-600 hover:bg-red-700"
              disabled={isDeletingFirma}
            >
              {isDeletingFirma ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Trash2 className="h-4 w-4 mr-2" />}
              Sí, eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Confirmation Dialog - Sello */}
      <AlertDialog open={showDeleteSelloDialog} onOpenChange={setShowDeleteSelloDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-red-500" />
              ¿Eliminar sello de la institución?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción eliminará permanentemente el sello del servidor.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteSello}
              className="bg-red-600 hover:bg-red-700"
              disabled={isDeletingSello}
            >
              {isDeletingSello ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Trash2 className="h-4 w-4 mr-2" />}
              Sí, eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
