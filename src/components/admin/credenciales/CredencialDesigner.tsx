'use client';

import React, { useState, useRef } from 'react';
import { useToast } from '@/hooks/use-toast';
import { updateConfigCredenciales, uploadWatermarkImage, deleteWatermarkImage } from '@/lib/actions/credenciales';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { Loader2, Save, Upload, Trash2, ImageIcon, AlertTriangle } from 'lucide-react';
import { CredencialPreview } from './CredencialPreview';
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
  });
  const fileInputRef = useRef<HTMLInputElement>(null);

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
        <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-6">Vista Previa en Tiempo Real</h3>
        <CredencialPreview 
          config={config} 
          alumno={demoAlumno} 
          institucion={institucion} 
          showDownloadOptions={false}
        />
        <p className="text-xs text-gray-400 mt-6 text-center max-w-xs">
          Esta vista es solo de referencia. Los datos del alumno variarán según cada caso.
        </p>
      </div>

      {/* Delete Confirmation Dialog */}
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
    </div>
  );
}
