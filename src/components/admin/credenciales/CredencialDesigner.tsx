'use client';

import React, { useState } from 'react';
import { useToast } from '@/hooks/use-toast';
import { updateConfigCredenciales } from '@/lib/actions/credenciales';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Save } from 'lucide-react';
import { CredencialPreview } from './CredencialPreview';

const GOOGLE_FONTS = [
  'Montserrat', 'Open Sans', 'Roboto', 'Inter', 'Poppins', 
  'Lato', 'Oswald', 'Raleway', 'Nunito', 'Playfair Display',
  'Ubuntu', 'Merriweather', 'PT Sans', 'Rubik', 'Work Sans'
];

interface CredencialDesignerProps {
  initialConfig: any;
  institucion: any;
}

export function CredencialDesigner({ initialConfig, institucion }: CredencialDesignerProps) {
  const { toast } = useToast();
  const [isSaving, setIsSaving] = useState(false);
  const [config, setConfig] = useState(initialConfig);

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
      } else {
        throw new Error(res.error);
      }
    } catch (error: any) {
      toast({ title: 'Error al guardar diseño', description: error.message, variant: 'destructive' });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
      {/* Columna Izquierda: Formulario */}
      <div className="space-y-6 bg-white p-6 rounded-xl border shadow-sm">
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
          </div>
        </div>

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

        <div className="pt-4">
          <Button onClick={handleSave} disabled={isSaving} className="w-full">
            {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
            Guardar Diseño
          </Button>
        </div>
      </div>

      {/* Columna Derecha: Vista Previa */}
      <div className="flex flex-col items-center bg-gray-50 p-6 rounded-xl border justify-center min-h-[400px]">
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
    </div>
  );
}
