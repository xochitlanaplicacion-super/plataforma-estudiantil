"use client";

import React, { useState, useEffect, useRef } from "react";
import { useInstitucion } from "@/hooks/use-institucion";
import { updateInstitucionConfig, uploadLogo, deleteStorageFile, uploadProgramFile, deleteProgramFile } from "@/lib/actions/institucion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, MonitorPlay, Save, ImageIcon, ImagePlus, Plus, Trash2, X, FileText, Upload, Pencil, Eye } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import Image from "next/image";
import { Hero, MissionStatement, About, Programs, Banner } from "@/app/acerca-de-nosotros/page";

export default function EditorLandingPage() {
  const { config, loading, refresh } = useInstitucion();
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [landingConfig, setLandingConfig] = useState<any>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const programFileInputRef = useRef<HTMLInputElement>(null);
  const [uploadingImage, setUploadingImage] = useState<string | {type: string, index: number} | null>(null);
  const [editingTheme, setEditingTheme] = useState<string | null>(null);
  const [newThemeName, setNewThemeName] = useState("");
  // Estado para la subida de archivos de programa
  const [uploadingProgramFile, setUploadingProgramFile] = useState<{progIdx: number, fileIdx?: number} | null>(null);
  const [programFileName, setProgramFileName] = useState("");
  const [editingFileName, setEditingFileName] = useState<{progIdx: number, fileIdx: number} | null>(null);
  const [editNameValue, setEditNameValue] = useState("");

  useEffect(() => {
    if (config?.landing_config) {
      setLandingConfig(config.landing_config);
    } else if (config) {
      // Fallback
      setLandingConfig({
        themes: [
          { id: 'azul', primary: '#0A2647', secondary: '#1e3a8a', accent: '#3b82f6' },
          { id: 'verde', primary: '#1A4A3F', secondary: '#064e3b', accent: '#10b981' },
          { id: 'vino', primary: '#8B2332', secondary: '#6B1A27', accent: '#C41E3A' }
        ],
        active_theme_id: 'azul',
        random_theme: false,
        hero_title: "LA EDUCACIÓN ES EL PRIMER PASO HACIA EL",
        hero_highlight: "éxito",
        hero_subtitle: "Formación integral para jóvenes y adultos. Concluye tus estudios con validez oficial SEP en un ambiente de excelencia.",
        hero_badges: "",
        hero_image: null,
        mission_title: "",
        mission_text: "",
        about_title: "Nuestra Pasión por la Educación en México",
        about_text: "En nuestra institución educativa nos apasiona proporcionar programas de alta calidad que se adapten a las necesidades reales de los estudiantes, garantizando que cada egresado tenga las herramientas necesarias para triunfar en el mercado laboral actual.",
        about_image: null,
        about_badge_title: "Validez Oficial",
        about_badge_subtitle: "Acuerdo 286 SEP",
        about_card1_title: "Acreditaciones",
        about_card1_text: "Respaldo total de la SEP, garantizando la validez oficial de tus estudios.",
        about_card2_title: "Docentes",
        about_card2_text: "Equipo altamente calificado y comprometido con tu éxito académico.",
        banner_images: [],
        programs: [
          {
            id: "prepa-joven",
            title: "PREPA JOVEN",
            subtitle: "",
            duration: "Duración de: 4 MESES",
            badge: "Excelencia Académica",
            description: "Para continuar tus estudios e ingresar a cualquier Universidad pública o privada",
            validez: "Con validez oficial SEP",
            image: null,
            iconType: "users",
            crop: "object-top"
          },
          {
            id: "prepa-adultos",
            title: "BACHILLERATO ADULTOS",
            subtitle: "",
            duration: "Duración: 2 MESES",
            badge: "Meta Cumplida",
            description: "Para trabajar o ingresar a la universidad",
            validez: "Con validez oficial SEP",
            image: null,
            iconType: "award",
            crop: "object-top"
          },
          {
            id: "universidad",
            title: "UNIVERSIDAD",
            subtitle: "",
            duration: "EN 10 MESES",
            badge: "Grado Superior",
            description: "LICENCIATURAS\nINGENIERÍAS\n\nTITULACIÓN POR EXPERIENCIA PROFESIONAL EN 2 MESES",
            validez: "Titulo y Cédula con validez oficial SEP",
            image: null,
            iconType: "book",
            crop: "object-center"
          },
          {
            id: "capacitaciones",
            title: "CAPACITACIONES LABORALES",
            subtitle: "",
            duration: "Duración: 4 MESES",
            badge: "Formación Real",
            description: "Profesionalizate en áreas laborales",
            validez: "Con validez oficial SEP",
            image: null,
            iconType: "briefcase",
            crop: "object-center"
          }
        ]
      });
    }
  }, [config]);

  if (loading || !landingConfig) {
    return <div className="min-h-[60vh] flex items-center justify-center"><Loader2 className="w-12 h-12 text-primary animate-spin" /></div>;
  }

  const handleChange = (key: string, value: any) => {
    setLandingConfig((prev: any) => ({ ...prev, [key]: value }));
  };

  const handleSave = async () => {
    setSaving(true);
    const result = await updateInstitucionConfig({ landing_config: landingConfig });
    setSaving(false);
    if (result.success) {
      toast({ title: "✅ Guardado", description: "Configuración de Landing Page guardada exitosamente" });
      refresh();
    } else {
      toast({ title: "❌ Error", description: result.error || "Error al guardar", variant: "destructive" });
    }
  };

  const handleUploadImage = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !uploadingImage) return;

    toast({ title: "⏳ Subiendo...", description: "Subiendo imagen..." });
    const formData = new FormData();
    formData.append("file", file);
    formData.append("tipo", `landing_${typeof uploadingImage === 'string' ? uploadingImage : uploadingImage.type}`);

    // Pasar la URL anterior si existe para que el servidor borre el archivo previo del bucket
    if (typeof uploadingImage === 'string') {
      const currentVal = landingConfig[uploadingImage];
      if (currentVal && typeof currentVal === 'string' && currentVal.includes('supabase')) {
        formData.append("old_url", currentVal);
      }
    } else if (uploadingImage.type === 'banner') {
      const currentBanner = landingConfig.banner_images?.[uploadingImage.index];
      if (currentBanner && currentBanner.includes('supabase')) formData.append("old_url", currentBanner);
    } else if (uploadingImage.type === 'program') {
      const currentImg = landingConfig.programs?.[uploadingImage.index]?.image;
      if (currentImg && currentImg.includes('supabase')) formData.append("old_url", currentImg);
    }

    const res = await uploadLogo(formData);

    if (res.success && res.url) {
      if (typeof uploadingImage === 'string') {
        handleChange(uploadingImage, res.url);
      } else if (uploadingImage.type === 'banner') {
        setLandingConfig((prev: any) => {
          const newBanners = [...prev.banner_images];
          newBanners[uploadingImage.index] = res.url;
          return { ...prev, banner_images: newBanners };
        });
      } else if (uploadingImage.type === 'program') {
        setLandingConfig((prev: any) => {
          const newPrograms = [...prev.programs];
          newPrograms[uploadingImage.index] = { ...newPrograms[uploadingImage.index], image: res.url };
          return { ...prev, programs: newPrograms };
        });
      }
      toast({ title: "✅ Listo", description: "Imagen subida correctamente" });
    } else {
      toast({ title: "❌ Error", description: res.error || "Error al subir la imagen", variant: "destructive" });
    }
    
    if (fileInputRef.current) fileInputRef.current.value = "";
    setUploadingImage(null);
  };

  const triggerUpload = (field: string | {type: string, index: number}) => {
    setUploadingImage(field);
    fileInputRef.current?.click();
  };


  const activeTheme = landingConfig.themes?.find((t: any) => t.id === landingConfig.active_theme_id) || landingConfig.themes?.[0] || { primary: '#0A2647', secondary: '#1e3a8a', accent: '#3b82f6' };

  // ─── Utilidades de color HSL ───
  const hexToHSL = (hex: string): [number, number, number] => {
    const r = parseInt(hex.slice(1, 3), 16) / 255;
    const g = parseInt(hex.slice(3, 5), 16) / 255;
    const b = parseInt(hex.slice(5, 7), 16) / 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    let h = 0, s = 0;
    const l = (max + min) / 2;
    if (max !== min) {
      const d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      switch (max) {
        case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
        case g: h = ((b - r) / d + 2) / 6; break;
        case b: h = ((r - g) / d + 4) / 6; break;
      }
    }
    return [Math.round(h * 360), Math.round(s * 100), Math.round(l * 100)];
  };

  const hslToHex = (h: number, s: number, l: number): string => {
    s /= 100; l /= 100;
    const a = s * Math.min(l, 1 - l);
    const f = (n: number) => {
      const k = (n + h / 30) % 12;
      const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
      return Math.round(255 * color).toString(16).padStart(2, '0');
    };
    return `#${f(0)}${f(8)}${f(4)}`;
  };

  const deriveColorsFromPrimary = (primaryHex: string): { secondary: string; accent: string } => {
    try {
      const [h, s, l] = hexToHSL(primaryHex);
      const secondary = hslToHex(h, Math.min(s + 15, 100), Math.min(l + 12, 45));
      const accent = hslToHex((h + 15) % 360, Math.min(s + 25, 100), Math.min(l + 35, 60));
      return { secondary, accent };
    } catch {
      return { secondary: '#1e293b', accent: '#6366f1' };
    }
  };

  const handleThemeColorChange = (themeId: string, colorKey: string, value: string) => {
    setLandingConfig((prev: any) => ({
      ...prev,
      themes: prev.themes.map((t: any) => {
        if (t.id !== themeId) return t;
        if (colorKey === 'primary' && /^#[0-9a-fA-F]{6}$/.test(value)) {
          const derived = deriveColorsFromPrimary(value);
          return { ...t, primary: value, secondary: derived.secondary, accent: derived.accent };
        }
        return { ...t, [colorKey]: value };
      })
    }));
  };

  const DEFAULT_THEMES = [
    { id: 'azul', primary: '#0A2647', secondary: '#1e3a8a', accent: '#3b82f6' },
    { id: 'verde', primary: '#1A4A3F', secondary: '#064e3b', accent: '#10b981' },
    { id: 'vino', primary: '#8B2332', secondary: '#6B1A27', accent: '#C41E3A' }
  ];

  const handleRestoreDefaults = () => {
    // Actualización atómica: cambia themes Y active_theme_id en un solo setState
    setLandingConfig((prev: any) => ({
      ...prev,
      themes: DEFAULT_THEMES,
      active_theme_id: 'azul'
    }));
    setEditingTheme(null);
    toast({ title: "🔄 Restaurado", description: "Los 3 temas predeterminados (Azul, Verde, Vino) han sido restaurados." });
  };

  const handleAddTheme = () => {
    const name = newThemeName.trim().toLowerCase().replace(/\s+/g, '-');
    if (!name) return;
    setLandingConfig((prev: any) => {
      if (prev.themes.some((t: any) => t.id === name)) return prev;
      return {
        ...prev,
        themes: [...prev.themes, { id: name, primary: '#334155', secondary: '#1e293b', accent: '#6366f1' }]
      };
    });
    setNewThemeName("");
    setEditingTheme(name);
  };

  const handleDeleteTheme = (themeId: string) => {
    if (landingConfig.themes.length <= 1) {
      toast({ title: "⚠️ Mínimo", description: "Debe existir al menos 1 tema.", variant: "destructive" });
      return;
    }
    // Actualización atómica: elimina el tema Y actualiza active_theme_id si es necesario
    setLandingConfig((prev: any) => {
      const updatedThemes = prev.themes.filter((t: any) => t.id !== themeId);
      return {
        ...prev,
        themes: updatedThemes,
        active_theme_id: prev.active_theme_id === themeId ? updatedThemes[0].id : prev.active_theme_id
      };
    });
    if (editingTheme === themeId) setEditingTheme(null);
  };

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)] overflow-hidden -mx-6 -mt-6">
      <div className="flex justify-between items-center bg-white p-4 shadow-sm border-b z-10 shrink-0 px-6">
        <div>
          <h2 className="text-2xl font-bold font-headline tracking-tight text-primary flex items-center gap-2">
            <MonitorPlay className="h-6 w-6 text-blue-600" /> Editor Landing Page
          </h2>
          <p className="text-sm text-muted-foreground mt-0.5">Modifica a la izquierda, visualiza a la derecha.</p>
        </div>
        <Button onClick={handleSave} disabled={saving} className="bg-blue-600 hover:bg-blue-700 font-bold gap-2">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Guardar Cambios y Publicar
        </Button>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* PANEL IZQUIERDO: FORMULARIO DE EDICIÓN */}
        <div className="w-1/2 lg:w-5/12 overflow-y-auto p-6 space-y-8 bg-gray-50/50 pb-32">
          <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleUploadImage} />
          <input ref={programFileInputRef} type="file" accept="image/jpeg,image/png,.pdf" className="hidden" onChange={async (e) => {
            const file = e.target.files?.[0];
            if (!file || !uploadingProgramFile) return;
            if (file.size > 10 * 1024 * 1024) {
              toast({ title: "❌ Error", description: "El archivo excede el límite de 10 MB.", variant: "destructive" });
              if (programFileInputRef.current) programFileInputRef.current.value = "";
              setUploadingProgramFile(null);
              return;
            }
            toast({ title: "⏳ Subiendo...", description: `Subiendo ${file.name}...` });
            const formData = new FormData();
            formData.append("file", file);
            // Si estamos reemplazando un archivo existente
            if (uploadingProgramFile.fileIdx !== undefined) {
              const existingFile = landingConfig.programs?.[uploadingProgramFile.progIdx]?.files?.[uploadingProgramFile.fileIdx];
              if (existingFile?.url) formData.append("old_url", existingFile.url);
            }
            const res = await uploadProgramFile(formData);
            if (res.success && res.url) {
              setLandingConfig((prev: any) => {
                const newPrograms = [...prev.programs];
                const prog = { ...newPrograms[uploadingProgramFile.progIdx] };
                const files = [...(prog.files || [])];
                if (uploadingProgramFile.fileIdx !== undefined) {
                  // Reemplazar archivo existente
                  files[uploadingProgramFile.fileIdx] = { ...files[uploadingProgramFile.fileIdx], url: res.url, type: res.fileType };
                } else {
                  // Nuevo archivo
                  const name = programFileName.trim() || file.name.replace(/\.[^.]+$/, '');
                  files.push({ id: `file_${Date.now()}`, name, url: res.url, type: res.fileType });
                }
                prog.files = files;
                newPrograms[uploadingProgramFile.progIdx] = prog;
                return { ...prev, programs: newPrograms };
              });
              toast({ title: "✅ Listo", description: "Archivo subido correctamente" });
            } else {
              toast({ title: "❌ Error", description: res.error || "Error al subir", variant: "destructive" });
            }
            if (programFileInputRef.current) programFileInputRef.current.value = "";
            setUploadingProgramFile(null);
            setProgramFileName("");
          }} />

      {/* TEMA Y COLORES */}
      <Card>
        <CardHeader>
          <CardTitle>🎨 Temas de Color</CardTitle>
          <CardDescription>Administra las paletas de colores de la Landing Page. Haz clic en un tema para editarlo con el selector de color.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">

          {/* MODO ALEATORIO / FIJO */}
          <div className="p-4 rounded-xl border bg-gradient-to-r from-gray-50 to-blue-50">
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-sm font-bold">Modo de Tema</Label>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {landingConfig.random_theme ? "Cada visita carga un tema diferente al azar." : "Se muestra siempre el tema seleccionado."}
                </p>
              </div>
              <button
                onClick={() => handleChange('random_theme', !landingConfig.random_theme)}
                className={`relative w-14 h-7 rounded-full transition-colors duration-300 ${landingConfig.random_theme ? 'bg-blue-600' : 'bg-gray-300'}`}
              >
                <span className={`absolute top-0.5 left-0.5 w-6 h-6 bg-white rounded-full shadow-md transition-transform duration-300 ${landingConfig.random_theme ? 'translate-x-7' : ''}`} />
              </button>
            </div>
            <div className="mt-2 flex items-center gap-2">
              <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${landingConfig.random_theme ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'}`}>
                {landingConfig.random_theme ? '🎲 Aleatorio' : '📌 Fijo'}
              </span>
            </div>
          </div>

          {/* SELECCIONAR TEMA FIJO (solo si NO aleatorio) */}
          {!landingConfig.random_theme && (
            <div className="p-4 rounded-xl border border-blue-200 bg-blue-50/50">
              <Label className="text-sm font-bold text-blue-800 mb-3 block">Tema activo para la Landing Page:</Label>
              <div className="flex flex-wrap gap-3">
                {landingConfig.themes?.map((theme: any) => (
                  <button
                    key={theme.id}
                    onClick={() => handleChange('active_theme_id', theme.id)}
                    className={`flex items-center gap-3 px-4 py-3 rounded-xl border-2 transition-all ${landingConfig.active_theme_id === theme.id ? 'border-blue-600 bg-white shadow-lg scale-105' : 'border-gray-200 bg-white hover:border-gray-300 hover:shadow-sm'}`}
                  >
                    <div className="flex gap-1">
                      <div className="w-5 h-5 rounded-full shadow-sm border border-white" style={{ backgroundColor: theme.primary }} />
                      <div className="w-5 h-5 rounded-full shadow-sm border border-white" style={{ backgroundColor: theme.secondary }} />
                      <div className="w-5 h-5 rounded-full shadow-sm border border-white" style={{ backgroundColor: theme.accent }} />
                    </div>
                    <span className="font-bold uppercase text-sm">{theme.id}</span>
                    {landingConfig.active_theme_id === theme.id && <span className="text-blue-600 text-xs">✓ Activo</span>}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* LISTA DE TEMAS CON EDICIÓN */}
          <div className="space-y-4">
            <Label className="text-sm font-bold">Temas guardados ({landingConfig.themes?.length || 0}):</Label>
            {landingConfig.themes?.map((theme: any) => (
              <div key={theme.id} className="border rounded-xl overflow-hidden transition-all hover:shadow-sm">
                {/* Cabecera del tema */}
                <div
                  className="flex items-center justify-between p-4 cursor-pointer hover:bg-gray-50"
                  onClick={() => setEditingTheme(editingTheme === theme.id ? null : theme.id)}
                >
                  <div className="flex items-center gap-4">
                    <div className="flex gap-1.5">
                      <div className="w-8 h-8 rounded-lg shadow-sm border" style={{ backgroundColor: theme.primary }} title="Primario" />
                      <div className="w-8 h-8 rounded-lg shadow-sm border" style={{ backgroundColor: theme.secondary }} title="Secundario" />
                      <div className="w-8 h-8 rounded-lg shadow-sm border" style={{ backgroundColor: theme.accent }} title="Acento" />
                    </div>
                    <div>
                      <span className="font-bold uppercase text-sm">{theme.id}</span>
                      <span className="text-[10px] text-muted-foreground block">{theme.primary} · {theme.secondary} · {theme.accent}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">{editingTheme === theme.id ? '▲ Cerrar' : '▼ Editar colores'}</span>
                    <button
                      onClick={(e) => { e.stopPropagation(); handleDeleteTheme(theme.id); }}
                      className="p-1.5 rounded-lg text-red-400 hover:bg-red-50 hover:text-red-600 transition-colors"
                      title="Eliminar tema"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>

                {/* Panel de edición expandible con color pickers */}
                {editingTheme === theme.id && (
                  <div className="border-t bg-gray-50/80 p-5 space-y-5">
                    <div className="grid grid-cols-3 gap-4">
                      {/* Color Primario */}
                      <div className="space-y-2">
                        <Label className="text-xs font-semibold text-gray-600">Primario</Label>
                        <div className="relative group">
                          <input
                            type="color"
                            value={theme.primary}
                            onChange={(e) => handleThemeColorChange(theme.id, 'primary', e.target.value)}
                            className="w-full h-12 rounded-xl border-2 border-gray-200 cursor-pointer hover:border-blue-400 transition-colors appearance-none"
                            style={{ backgroundColor: theme.primary }}
                          />
                        </div>
                        <Input
                          value={theme.primary}
                          onChange={(e) => handleThemeColorChange(theme.id, 'primary', e.target.value)}
                          className="text-xs font-mono h-8 text-center"
                          placeholder="#000000"
                        />
                      </div>
                      {/* Color Secundario */}
                      <div className="space-y-2">
                        <Label className="text-xs font-semibold text-gray-600">Secundario</Label>
                        <div className="relative group">
                          <input
                            type="color"
                            value={theme.secondary}
                            onChange={(e) => handleThemeColorChange(theme.id, 'secondary', e.target.value)}
                            className="w-full h-12 rounded-xl border-2 border-gray-200 cursor-pointer hover:border-blue-400 transition-colors appearance-none"
                            style={{ backgroundColor: theme.secondary }}
                          />
                        </div>
                        <Input
                          value={theme.secondary}
                          onChange={(e) => handleThemeColorChange(theme.id, 'secondary', e.target.value)}
                          className="text-xs font-mono h-8 text-center"
                          placeholder="#000000"
                        />
                      </div>
                      {/* Color Acento */}
                      <div className="space-y-2">
                        <Label className="text-xs font-semibold text-gray-600">Acento</Label>
                        <div className="relative group">
                          <input
                            type="color"
                            value={theme.accent}
                            onChange={(e) => handleThemeColorChange(theme.id, 'accent', e.target.value)}
                            className="w-full h-12 rounded-xl border-2 border-gray-200 cursor-pointer hover:border-blue-400 transition-colors appearance-none"
                            style={{ backgroundColor: theme.accent }}
                          />
                        </div>
                        <Input
                          value={theme.accent}
                          onChange={(e) => handleThemeColorChange(theme.id, 'accent', e.target.value)}
                          className="text-xs font-mono h-8 text-center"
                          placeholder="#000000"
                        />
                      </div>
                    </div>
                    {/* Preview mini del tema */}
                    <div className="rounded-xl overflow-hidden shadow-sm border">
                      <div className="h-10 flex items-center px-4 text-white text-xs font-bold" style={{ backgroundColor: theme.primary }}>
                        Vista previa del navbar
                      </div>
                      <div className="h-14 flex items-center justify-center" style={{ background: `linear-gradient(135deg, ${theme.primary}, ${theme.secondary})` }}>
                        <span className="text-white text-sm font-black uppercase tracking-widest">HERO SECTION</span>
                      </div>
                      <div className="h-6 flex items-center justify-center" style={{ backgroundColor: theme.accent }}>
                        <span className="text-white text-[10px] font-bold">ACENTO</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* AGREGAR NUEVO TEMA */}
          <div className="flex gap-2 items-end">
            <div className="flex-1 space-y-1">
              <Label className="text-xs font-semibold">Agregar nuevo tema</Label>
              <Input
                value={newThemeName}
                onChange={(e) => setNewThemeName(e.target.value)}
                placeholder="Nombre (ej: morado, dorado, negro...)"
                className="h-9"
                onKeyDown={(e) => e.key === 'Enter' && handleAddTheme()}
              />
            </div>
            <Button onClick={handleAddTheme} size="sm" variant="outline" className="gap-1 h-9 shrink-0">
              <Plus size={14} /> Agregar
            </Button>
          </div>

          {/* NOTA AUTO-SUGERENCIA */}
          <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-xs space-y-1">
            <p className="font-bold">💡 Sugerencia automática de colores</p>
            <p>Al cambiar el <strong>color primario</strong>, el sistema calculará automáticamente el secundario y acento para mantener la armonía visual. Puedes editarlos manualmente después si lo deseas.</p>
          </div>

          {/* RESTAURAR PREDETERMINADOS */}
          <Button onClick={handleRestoreDefaults} variant="ghost" size="sm" className="w-full text-xs text-muted-foreground hover:text-red-600 hover:bg-red-50 gap-2 border border-dashed border-gray-300">
            🔄 Restaurar temas predeterminados (Azul, Verde, Vino)
          </Button>
        </CardContent>
      </Card>

      {/* SECCIÓN HERO */}
      <Card>
        <CardHeader>
          <CardTitle>Sección Principal (Hero)</CardTitle>
          <CardDescription>Lo primero que ven los usuarios al entrar a la página.</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Título Principal</Label>
              <Input value={landingConfig.hero_title} placeholder="LA EDUCACIÓN ES EL PRIMER PASO HACIA EL" onChange={(e) => handleChange('hero_title', e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Palabra Resaltada (Color)</Label>
              <Input value={landingConfig.hero_highlight} placeholder="éxito" onChange={(e) => handleChange('hero_highlight', e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Subtítulo / Párrafo</Label>
              <Textarea value={landingConfig.hero_subtitle} placeholder="Formación integral para jóvenes y adultos. Concluye tus estudios con validez oficial SEP en un ambiente de excelencia." onChange={(e) => handleChange('hero_subtitle', e.target.value)} className="h-24" />
            </div>
            <div className="space-y-2">
              <Label>Etiquetas (Separadas por |)</Label>
              <Input value={landingConfig.hero_badges} onChange={(e) => handleChange('hero_badges', e.target.value)} placeholder="Universidad | Bachillerato | Capacitaciones" />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Imagen de Fondo (Hero)</Label>
            <div className="relative w-full aspect-video rounded-xl overflow-hidden bg-gray-100 border-2 border-dashed border-gray-300 group flex items-center justify-center cursor-pointer hover:border-blue-500 transition-colors" onClick={() => triggerUpload('hero_image')}>
              {landingConfig.hero_image ? (
                <>
                  <Image src={landingConfig.hero_image} alt="Hero" fill className="object-cover group-hover:opacity-50 transition-opacity" />
                  <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity gap-3">
                    <span className="bg-black/80 text-white px-4 py-2 rounded-full font-bold flex items-center gap-2 hover:bg-black transition-colors"><ImagePlus size={18}/> Cambiar</span>
                    <Button size="icon" variant="destructive" className="h-10 w-10 rounded-full shadow-lg" onClick={async (e) => {
                      e.stopPropagation();
                      if (confirm("¿Estás seguro de que quieres eliminar esta imagen? La sección se mostrará con el color sólido del tema.")) {
                        if (landingConfig.hero_image.includes('supabase')) await deleteStorageFile(landingConfig.hero_image);
                        handleChange('hero_image', null);
                      }
                    }}>
                      <Trash2 size={18} />
                    </Button>
                  </div>
                </>
              ) : (
                <div className="text-gray-400 flex flex-col items-center"><ImageIcon size={48} /><span className="mt-2 font-medium">Click para subir imagen</span></div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* SECCIÓN MISION */}
      <Card>
        <CardHeader>
          <CardTitle>Sección Misión</CardTitle>
          <CardDescription>Mensaje grande y destacado debajo del Hero. Si no se escribe nada, se mostrará el texto predeterminado con palabras resaltadas y subrayadas.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-sm font-medium">
            💡 <strong>Nota:</strong> Si dejas este campo vacío, se mostrará el texto original con las palabras clave resaltadas con colores y subrayados decorativos (Bachillerato, Licenciaturas, Ingenierías, etc.).
          </div>
          <div className="space-y-2">
            <Label>Título de la Misión (Texto plano — dejar vacío para formato enriquecido original)</Label>
            <Textarea value={landingConfig.mission_title || ''} placeholder="Somos una institución comprometida con brindar educación para estudiantes jóvenes y adultos, ofreciendo la oportunidad de concluir su Bachillerato General, Licenciaturas, Ingenierías y Capacitaciones avaladas por la Secretaría de Educación Pública (SEP)." onChange={(e) => handleChange('mission_title', e.target.value)} className="h-32" />
          </div>
          <div className="space-y-2">
            <Label>Subtexto de la Misión</Label>
            <Textarea value={landingConfig.mission_text || ''} placeholder="Nuestro enfoque es proporcionar un ambiente de aprendizaje flexible y accesible para aquellos que desean continuar su Educación Media Superior y Superior." onChange={(e) => handleChange('mission_text', e.target.value)} className="h-24" />
          </div>
        </CardContent>
      </Card>

      {/* SECCIÓN ACERCA DE */}
      <Card>
        <CardHeader>
          <CardTitle>Sección "Acerca de Nosotros"</CardTitle>
          <CardDescription>Historia y descripción principal de la institución.</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <div className="space-y-6">
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Título de la Sección</Label>
                <Input value={landingConfig.about_title} placeholder="Nuestra Pasión por la Educación en México" onChange={(e) => handleChange('about_title', e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Texto descriptivo</Label>
                <Textarea value={landingConfig.about_text} placeholder="En nuestra institución educativa nos apasiona proporcionar programas de alta calidad que se adapten a las necesidades reales de los estudiantes, garantizando que cada egresado tenga las herramientas necesarias para triunfar en el mercado laboral actual." onChange={(e) => handleChange('about_text', e.target.value)} className="h-40" />
              </div>
            </div>

            <div className="p-4 border rounded-xl bg-gray-50 space-y-4">
              <h4 className="font-bold text-sm text-gray-500 uppercase tracking-widest">Insignia sobre Imagen</h4>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Título</Label>
                  <Input value={landingConfig.about_badge_title || ''} placeholder="Ej. Validez Oficial" onChange={(e) => handleChange('about_badge_title', e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Subtítulo</Label>
                  <Input value={landingConfig.about_badge_subtitle || ''} placeholder="Ej. Acuerdo 286 SEP" onChange={(e) => handleChange('about_badge_subtitle', e.target.value)} />
                </div>
              </div>
            </div>

            <div className="p-4 border rounded-xl bg-gray-50 space-y-4">
              <h4 className="font-bold text-sm text-gray-500 uppercase tracking-widest">Tarjeta 1 (Check)</h4>
              <div className="space-y-2">
                <Label>Título</Label>
                <Input value={landingConfig.about_card1_title || ''} placeholder="Ej. Acreditaciones" onChange={(e) => handleChange('about_card1_title', e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Texto</Label>
                <Textarea value={landingConfig.about_card1_text || ''} placeholder="Respaldo total de la SEP..." onChange={(e) => handleChange('about_card1_text', e.target.value)} />
              </div>
            </div>

            <div className="p-4 border rounded-xl bg-gray-50 space-y-4">
              <h4 className="font-bold text-sm text-gray-500 uppercase tracking-widest">Tarjeta 2 (Personas)</h4>
              <div className="space-y-2">
                <Label>Título</Label>
                <Input value={landingConfig.about_card2_title || ''} placeholder="Ej. Docentes" onChange={(e) => handleChange('about_card2_title', e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Texto</Label>
                <Textarea value={landingConfig.about_card2_text || ''} placeholder="Equipo altamente calificado..." onChange={(e) => handleChange('about_card2_text', e.target.value)} />
              </div>
            </div>
          </div>
          <div className="space-y-2">
            <Label>Imagen Lateral (Equipo / Instalaciones)</Label>
            <div className="relative w-full aspect-square md:aspect-[3/4] max-h-[800px] rounded-xl overflow-hidden bg-gray-100 border-2 border-dashed border-gray-300 group flex items-center justify-center cursor-pointer hover:border-blue-500 transition-colors" onClick={() => triggerUpload('about_image')}>
              {landingConfig.about_image ? (
                <>
                  <Image src={landingConfig.about_image} alt="About" fill className="object-cover group-hover:opacity-50 transition-opacity" />
                  <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity gap-3">
                    <span className="bg-black/80 text-white px-4 py-2 rounded-full font-bold flex items-center gap-2 hover:bg-black transition-colors"><ImagePlus size={18}/> Cambiar</span>
                    <Button size="icon" variant="destructive" className="h-10 w-10 rounded-full shadow-lg" onClick={async (e) => {
                      e.stopPropagation();
                      if (confirm("¿Estás seguro de que quieres eliminar esta imagen? La sección se mostrará vacía.")) {
                        if (landingConfig.about_image.includes('supabase')) await deleteStorageFile(landingConfig.about_image);
                        handleChange('about_image', null);
                      }
                    }}>
                      <Trash2 size={18} />
                    </Button>
                  </div>
                </>
              ) : (
                <div className="text-gray-400 flex flex-col items-center"><ImageIcon size={48} /><span className="mt-2 font-medium">Click para subir imagen</span></div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* SECCIÓN CARRUSEL DE BANNERS */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Carrusel de Imágenes (Banners)</CardTitle>
            <CardDescription>Fotos que van pasando automáticamente en la página.</CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={() => {
            const newBanners = [...(landingConfig.banner_images || []), ""];
            handleChange('banner_images', newBanners);
          }} className="gap-2">
            <Plus size={16} /> Añadir Imagen
          </Button>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {landingConfig.banner_images?.map((img: string, idx: number) => (
              <div key={idx} className="relative aspect-video rounded-lg border-2 border-dashed border-gray-300 overflow-hidden group">
                {img ? (
                  <>
                    <Image src={img} alt={`Banner ${idx}`} fill className="object-cover" />
                    <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                      <Button size="icon" variant="secondary" className="h-8 w-8 rounded-full" onClick={() => triggerUpload({type: 'banner', index: idx})}>
                        <ImagePlus size={14} />
                      </Button>
                      <Button size="icon" variant="destructive" className="h-8 w-8 rounded-full" onClick={async () => {
                        // Borrar del bucket si es una imagen de Supabase
                        if (img && img.includes('supabase')) await deleteStorageFile(img);
                        const newBanners = [...landingConfig.banner_images];
                        newBanners.splice(idx, 1);
                        handleChange('banner_images', newBanners);
                      }}>
                        <Trash2 size={14} />
                      </Button>
                    </div>
                  </>
                ) : (
                  <div className="absolute inset-0 flex flex-col items-center justify-center cursor-pointer hover:bg-gray-50" onClick={() => triggerUpload({type: 'banner', index: idx})}>
                    <ImageIcon className="text-gray-400 mb-2" size={24} />
                    <span className="text-xs font-medium text-gray-500">Subir foto</span>
                    <Button size="icon" variant="ghost" className="absolute top-1 right-1 h-6 w-6 text-red-500 hover:text-red-700" onClick={async (e) => {
                        e.stopPropagation();
                        const newBanners = [...landingConfig.banner_images];
                        newBanners.splice(idx, 1);
                        handleChange('banner_images', newBanners);
                      }}>
                        <X size={14} />
                      </Button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* SECCIÓN OPCIONES DE ESTUDIO DISPONIBLES */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Opciones de Estudio Disponibles</CardTitle>
            <CardDescription>Modalidades como Presencial, Virtual, Híbrida, etc.</CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={() => {
            const newOptions = [...(landingConfig.study_options || ['Presencial', 'Virtual', 'Híbrida']), "Nueva Opción"];
            handleChange('study_options', newOptions);
          }} className="gap-2">
            <Plus size={16} /> Añadir Modalidad
          </Button>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
            {(landingConfig.study_options || ['Presencial', 'Virtual', 'Híbrida']).map((opt: string, idx: number) => (
              <div key={idx} className="flex items-center gap-2">
                <Input 
                  value={opt} 
                  onChange={(e) => {
                    const newOptions = [...(landingConfig.study_options || ['Presencial', 'Virtual', 'Híbrida'])];
                    newOptions[idx] = e.target.value;
                    handleChange('study_options', newOptions);
                  }} 
                />
                <Button size="icon" variant="destructive" className="h-10 w-10 shrink-0" onClick={() => {
                  const newOptions = [...(landingConfig.study_options || ['Presencial', 'Virtual', 'Híbrida'])];
                  newOptions.splice(idx, 1);
                  handleChange('study_options', newOptions);
                }}>
                  <Trash2 size={16} />
                </Button>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* SECCIÓN OFERTA EDUCATIVA (PROGRAMAS) */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Oferta Educativa (Programas)</CardTitle>
            <CardDescription>Tarjetas con los programas, duración y detalles.</CardDescription>
          </div>
          <Button onClick={() => {
            const newPrograms = [...(landingConfig.programs || []), {
              id: `prog_${Date.now()}`,
              title: "Nuevo Programa",
              subtitle: "",
              duration: "Duración",
              badge: "Nuevo",
              description: "Descripción del programa",
              validez: "Validez SEP",
              image: "",
              iconType: "book",
              crop: "object-center"
            }];
            handleChange('programs', newPrograms);
          }} className="gap-2 bg-green-600 hover:bg-green-700">
            <Plus size={16} /> Añadir Programa
          </Button>
        </CardHeader>
        <CardContent className="space-y-6">
          {landingConfig.programs?.map((prog: any, idx: number) => (
            <div key={idx} className="p-5 border rounded-xl bg-gray-50 relative group">
              <Button size="icon" variant="destructive" className="absolute top-4 right-4 h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity" onClick={async () => {
                // Borrar imagen del programa del bucket si existe
                const programImg = landingConfig.programs[idx]?.image;
                if (programImg && programImg.includes('supabase')) await deleteStorageFile(programImg);
                const newPrograms = [...landingConfig.programs];
                newPrograms.splice(idx, 1);
                handleChange('programs', newPrograms);
              }}>
                <Trash2 size={16} />
              </Button>
              <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
                <div className="md:col-span-3 space-y-2">
                  <Label>Imagen</Label>
                  <div className="relative w-full aspect-square rounded-lg border-2 border-dashed border-gray-300 overflow-hidden cursor-pointer hover:border-blue-500" onClick={() => triggerUpload({type: 'program', index: idx})}>
                     {prog.image ? (
                        <>
                          <Image src={prog.image} alt={prog.title} fill className={`object-cover ${prog.crop === 'object-top' ? 'object-top' : prog.crop === 'object-bottom' ? 'object-bottom' : 'object-center'}`} />
                          <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 hover:opacity-100 transition-opacity"><ImagePlus className="text-white"/></div>
                        </>
                     ) : (
                        <div className="absolute inset-0 flex items-center justify-center text-gray-400"><ImageIcon size={32}/></div>
                     )}
                  </div>
                  <select className="w-full text-xs p-1 mt-1 border rounded" value={prog.crop || 'object-center'} onChange={(e) => {
                    const newPrograms = [...landingConfig.programs];
                    newPrograms[idx].crop = e.target.value;
                    handleChange('programs', newPrograms);
                  }}>
                    <option value="object-top">Alinear Arriba</option>
                    <option value="object-center">Alinear Centro</option>
                    <option value="object-bottom">Alinear Abajo</option>
                  </select>
                </div>
                
                <div className="md:col-span-9 grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Título del Programa</Label>
                    <Input value={prog.title} onChange={(e) => {
                      const newP = [...landingConfig.programs]; newP[idx].title = e.target.value; handleChange('programs', newP);
                    }} />
                  </div>
                  <div className="space-y-2">
                    <Label>Subtítulo (Opcional)</Label>
                    <Input value={prog.subtitle} onChange={(e) => {
                      const newP = [...landingConfig.programs]; newP[idx].subtitle = e.target.value; handleChange('programs', newP);
                    }} />
                  </div>
                  <div className="space-y-2">
                    <Label>Duración</Label>
                    <Input value={prog.duration} onChange={(e) => {
                      const newP = [...landingConfig.programs]; newP[idx].duration = e.target.value; handleChange('programs', newP);
                    }} />
                  </div>
                  <div className="space-y-2">
                    <Label>Insignia / Badge</Label>
                    <Input value={prog.badge} onChange={(e) => {
                      const newP = [...landingConfig.programs]; newP[idx].badge = e.target.value; handleChange('programs', newP);
                    }} />
                  </div>
                  <div className="space-y-2">
                    <Label>Icono</Label>
                    <select className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm" value={prog.iconType} onChange={(e) => {
                      const newP = [...landingConfig.programs]; newP[idx].iconType = e.target.value; handleChange('programs', newP);
                    }}>
                      <option value="graduation">Birrete (Universidad)</option>
                      <option value="book">Libro (Bachillerato)</option>
                      <option value="briefcase">Maletín (Cursos/Diplomados)</option>
                      <option value="award">Medalla (Excelencia)</option>
                      <option value="users">Usuarios (Comunidad)</option>
                    </select>
                  </div>
                  <div className="space-y-2">
                    <Label>Validez</Label>
                    <Input value={prog.validez} onChange={(e) => {
                      const newP = [...landingConfig.programs]; newP[idx].validez = e.target.value; handleChange('programs', newP);
                    }} />
                  </div>
                  <div className="space-y-2 md:col-span-2">
                    <Label>Descripción Breve</Label>
                    <Textarea value={prog.description} onChange={(e) => {
                      const newP = [...landingConfig.programs]; newP[idx].description = e.target.value; handleChange('programs', newP);
                    }} className="h-20" />
                  </div>
                </div>
              </div>

              {/* ── GESTOR DE ARCHIVOS ADJUNTOS ── */}
              <div className="mt-4 pt-4 border-t border-dashed border-gray-300">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <FileText size={16} className="text-blue-600" />
                    <Label className="text-sm font-bold text-gray-700">Archivos Adjuntos ({(prog.files || []).length}/10)</Label>
                  </div>
                  {(prog.files || []).length < 10 && (
                    <div className="flex items-center gap-2">
                      <Input
                        value={programFileName}
                        onChange={(e) => setProgramFileName(e.target.value)}
                        placeholder="Nombre del archivo (ej. Plan 2 meses)"
                        className="h-8 text-xs w-56"
                        onFocus={() => setProgramFileName('')}
                      />
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 gap-1 text-xs shrink-0"
                        onClick={() => {
                          setUploadingProgramFile({ progIdx: idx });
                          programFileInputRef.current?.click();
                        }}
                      >
                        <Upload size={14} /> Subir
                      </Button>
                    </div>
                  )}
                </div>

                {/* Lista de archivos subidos */}
                {(prog.files || []).length > 0 ? (
                  <div className="space-y-2">
                    {(prog.files || []).map((f: any, fIdx: number) => (
                      <div key={f.id || fIdx} className="flex items-center gap-2 p-2 rounded-lg bg-white border text-sm group">
                        <div className="w-8 h-8 rounded flex items-center justify-center shrink-0 bg-blue-50 text-blue-600">
                          {f.type === 'application/pdf' ? <FileText size={16} /> : <ImageIcon size={16} />}
                        </div>
                        <div className="flex-1 min-w-0">
                          {editingFileName?.progIdx === idx && editingFileName?.fileIdx === fIdx ? (
                            <div className="flex items-center gap-1">
                              <Input
                                value={editNameValue}
                                onChange={(e) => setEditNameValue(e.target.value)}
                                className="h-7 text-xs"
                                autoFocus
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') {
                                    const newP = [...landingConfig.programs];
                                    const files = [...(newP[idx].files || [])];
                                    files[fIdx] = { ...files[fIdx], name: editNameValue.trim() || files[fIdx].name };
                                    newP[idx] = { ...newP[idx], files };
                                    handleChange('programs', newP);
                                    setEditingFileName(null);
                                  }
                                  if (e.key === 'Escape') setEditingFileName(null);
                                }}
                              />
                              <Button size="sm" variant="ghost" className="h-7 text-xs px-2" onClick={() => {
                                const newP = [...landingConfig.programs];
                                const files = [...(newP[idx].files || [])];
                                files[fIdx] = { ...files[fIdx], name: editNameValue.trim() || files[fIdx].name };
                                newP[idx] = { ...newP[idx], files };
                                handleChange('programs', newP);
                                setEditingFileName(null);
                              }}>✓</Button>
                            </div>
                          ) : (
                            <p className="font-medium truncate text-xs">{f.name}</p>
                          )}
                          <p className="text-[10px] text-muted-foreground">{f.type === 'application/pdf' ? 'PDF' : 'Imagen'}</p>
                        </div>
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          {/* Preview */}
                          {f.url && (
                            <Button size="icon" variant="ghost" className="h-7 w-7" title="Ver" onClick={() => window.open(f.url, '_blank')}>
                              <Eye size={14} />
                            </Button>
                          )}
                          {/* Renombrar */}
                          <Button size="icon" variant="ghost" className="h-7 w-7" title="Renombrar" onClick={() => {
                            setEditingFileName({ progIdx: idx, fileIdx: fIdx });
                            setEditNameValue(f.name);
                          }}>
                            <Pencil size={14} />
                          </Button>
                          {/* Resubir archivo */}
                          <Button size="icon" variant="ghost" className="h-7 w-7" title="Reemplazar archivo" onClick={() => {
                            setUploadingProgramFile({ progIdx: idx, fileIdx: fIdx });
                            programFileInputRef.current?.click();
                          }}>
                            <Upload size={14} />
                          </Button>
                          {/* Borrar */}
                          <Button size="icon" variant="destructive" className="h-7 w-7" title="Eliminar" onClick={async () => {
                            if (!confirm(`¿Eliminar "${f.name}"? El archivo se borrará permanentemente.`)) return;
                            if (f.url) await deleteProgramFile(f.url);
                            const newP = [...landingConfig.programs];
                            const files = [...(newP[idx].files || [])];
                            files.splice(fIdx, 1);
                            newP[idx] = { ...newP[idx], files };
                            handleChange('programs', newP);
                            toast({ title: "🗑️ Eliminado", description: `"${f.name}" fue eliminado.` });
                          }}>
                            <Trash2 size={14} />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-4 text-muted-foreground text-xs border rounded-lg border-dashed">
                    No hay archivos adjuntos. Usa el botón "Subir" para agregar PDFs o imágenes.
                  </div>
                )}
              </div>
            </div>
          ))}
          {(!landingConfig.programs || landingConfig.programs.length === 0) && (
            <div className="text-center py-12 text-muted-foreground border-2 border-dashed rounded-xl">
              No hay programas registrados. Añade uno para que aparezca en la Oferta Educativa.
            </div>
          )}
        </CardContent>
      </Card>
      {/* FIN DEL PANEL IZQUIERDO */}
        </div>

        {/* PANEL DERECHO: VISTA PREVIA EN VIVO */}
        <div className="w-1/2 lg:w-7/12 border-l shadow-2xl relative bg-white overflow-hidden flex flex-col">
          <div className="bg-blue-900 text-white text-xs font-bold text-center py-1.5 uppercase tracking-widest shrink-0 flex items-center justify-center gap-2">
            <MonitorPlay size={14} /> Vista Previa en Vivo
          </div>
          
          <div className="flex-1 overflow-y-auto overflow-x-hidden relative">
            {/* Contenedor que desactiva clics para que no se salgan del preview */}
            <div className="pointer-events-none origin-top transition-all duration-300 transform scale-[0.85] md:scale-90 w-[111%] -ml-[5.5%] -mt-[2%]">
               <div className="bg-white min-h-screen">
                  <Hero theme={activeTheme} config={landingConfig} />
                  <MissionStatement theme={activeTheme} config={landingConfig} />
                  <About theme={activeTheme} config={landingConfig} />
                  <Programs theme={activeTheme} config={landingConfig} />
                  <Banner theme={activeTheme} config={landingConfig} />
               </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
