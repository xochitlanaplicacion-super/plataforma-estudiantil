"use client";

import React, { useState, useEffect } from "react";
import { X, BookOpen, MessageSquare, Loader2, FileText } from "lucide-react";
import { getMateriasYTemasParaAlumno } from "@/lib/actions/alumno";

interface AlumnoExerciseModalProps {
  isOpen: boolean;
  onClose: () => void;
  onGenerate: (config: {
    source: "texto" | "materia";
    textoLibre?: string;
    materiaId?: string;
    unidadId?: string;
    temaId?: string;
    materiaNombre?: string;
    unidadNombre?: string;
    temaNombre?: string;
    type: "multiple" | "boolean";
    count: number;
  }) => void;
  userId: string;
}

export function AlumnoExerciseModal({ isOpen, onClose, onGenerate, userId }: AlumnoExerciseModalProps) {
  const [source, setSource] = useState<"texto" | "materia">("texto");
  const [textoLibre, setTextoLibre] = useState<string>("");
  const [type, setType] = useState<"multiple" | "boolean">("multiple");
  const [count, setCount] = useState<number>(5);
  
  // Datos para los selectores
  const [materias, setMaterias] = useState<any[]>([]);
  const [unidades, setUnidades] = useState<any[]>([]);
  const [temas, setTemas] = useState<any[]>([]);
  
  const [selectedMateria, setSelectedMateria] = useState<string>("");
  const [selectedUnidad, setSelectedUnidad] = useState<string>("");
  const [selectedTema, setSelectedTema] = useState<string>("");
  
  const [isLoadingMaterias, setIsLoadingMaterias] = useState(false);

  useEffect(() => {
    if (isOpen && source === "materia" && materias.length === 0) {
      cargarMaterias();
    }
  }, [isOpen, source]);

  useEffect(() => {
    if (selectedMateria) {
      const mat = materias.find(m => m.id === selectedMateria);
      setUnidades(mat?.unidades || []);
      setSelectedUnidad("");
    } else { 
      setUnidades([]); 
      setSelectedUnidad(""); 
    }
  }, [selectedMateria, materias]);

  useEffect(() => {
    if (selectedUnidad) {
      const uni = unidades.find(u => u.id === selectedUnidad);
      setTemas(uni?.temas || []);
      setSelectedTema("");
    } else { 
      setTemas([]); 
      setSelectedTema(""); 
    }
  }, [selectedUnidad, unidades]);

  const cargarMaterias = async () => {
    setIsLoadingMaterias(true);
    try {
      const data = await getMateriasYTemasParaAlumno(userId);
      setMaterias(data || []);
    } catch (e) {
      console.error("Error cargando materias", e);
    } finally {
      setIsLoadingMaterias(false);
    }
  };

  const handleGenerate = () => {
    const materiaNombre = materias.find(m => m.id === selectedMateria)?.nombre;
    const unidadNombre = unidades.find(u => u.id === selectedUnidad)?.titulo;
    const temaNombre = temas.find(t => t.id === selectedTema)?.titulo;

    onGenerate({
      source,
      textoLibre: source === "texto" ? textoLibre : undefined,
      materiaId: selectedMateria || undefined,
      unidadId: selectedUnidad || undefined,
      temaId: selectedTema || undefined,
      materiaNombre,
      unidadNombre,
      temaNombre,
      type,
      count
    });
    onClose();
  };

  if (!isOpen) return null;

  const isFormValid = (source === "texto" && textoLibre.trim().length > 0) || (source === "materia" && selectedTema);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm px-4">
      <div className="bg-[#130f2a] border border-indigo-500/30 w-full max-w-md rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between p-5 border-b border-indigo-500/20 bg-indigo-950/20">
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <span className="text-2xl">🧠</span> Generar Ejercicio IA
          </h2>
          <button onClick={onClose} className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition">
            <X size={20} />
          </button>
        </div>

        <div className="p-6 overflow-y-auto custom-scrollbar flex-1 space-y-6">
          {/* 1. Origen del contexto */}
          <div className="space-y-3">
            <label className="text-sm font-semibold text-indigo-300">Origen de la información</label>
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => setSource("texto")}
                className={`flex flex-col items-center justify-center gap-2 p-4 rounded-xl border transition ${
                  source === "texto" ? "bg-indigo-600/20 border-indigo-500 text-indigo-200" : "bg-white/5 border-white/10 text-slate-400 hover:bg-white/10"
                }`}
              >
                <FileText size={24} />
                <span className="text-xs font-medium text-center">Sobre este texto / tema<br/><span className="text-[10px] opacity-70">(Pega información)</span></span>
              </button>
              <button
                onClick={() => setSource("materia")}
                className={`flex flex-col items-center justify-center gap-2 p-4 rounded-xl border transition ${
                  source === "materia" ? "bg-indigo-600/20 border-indigo-500 text-indigo-200" : "bg-white/5 border-white/10 text-slate-400 hover:bg-white/10"
                }`}
              >
                <BookOpen size={24} />
                <span className="text-xs font-medium text-center">De mis materias<br/><span className="text-[10px] opacity-70">(Diapositivas y material)</span></span>
              </button>
            </div>
          </div>

          {source === "texto" && (
            <div className="space-y-3 p-4 rounded-xl bg-black/20 border border-indigo-900/50">
              <label className="text-xs text-slate-400">Texto libre o instrucciones</label>
              <textarea 
                className="w-full h-32 bg-[#130f2a] border border-indigo-800/50 rounded-xl p-3 text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-indigo-500/70 resize-none"
                placeholder="Pega aquí el texto, apuntes o indicaciones para crear el ejercicio..."
                value={textoLibre}
                onChange={e => setTextoLibre(e.target.value)}
              />
            </div>
          )}

          {/* Selectores si es Materia */}
          {source === "materia" && (
            <div className="space-y-4 p-4 rounded-xl bg-black/20 border border-indigo-900/50">
              {isLoadingMaterias ? (
                <div className="flex justify-center py-4"><Loader2 className="animate-spin text-indigo-400" /></div>
              ) : (
                <>
                  <div className="space-y-1.5">
                    <label className="text-xs text-slate-400">Materia</label>
                    <select
                      value={selectedMateria}
                      onChange={e => setSelectedMateria(e.target.value)}
                      className="w-full bg-[#0a0710] border border-indigo-800/50 rounded-lg p-2.5 text-sm text-white focus:outline-none focus:border-indigo-500"
                    >
                      <option value="">-- Selecciona una materia --</option>
                      {materias.map(m => (
                        <option key={m.id} value={m.id}>{m.nombre}</option>
                      ))}
                    </select>
                  </div>

                  {selectedMateria && (
                    <div className="space-y-1.5">
                      <label className="text-xs text-slate-400">Unidad</label>
                      <select
                        value={selectedUnidad}
                        onChange={e => setSelectedUnidad(e.target.value)}
                        className="w-full bg-[#0a0710] border border-indigo-800/50 rounded-lg p-2.5 text-sm text-white focus:outline-none focus:border-indigo-500"
                      >
                        <option value="">-- Selecciona una unidad --</option>
                        {unidades.map(u => (
                          <option key={u.id} value={u.id}>{u.titulo}</option>
                        ))}
                      </select>
                    </div>
                  )}

                  {selectedUnidad && (
                    <div className="space-y-1.5">
                      <label className="text-xs text-slate-400">Tema (Requerido)</label>
                      <select
                        value={selectedTema}
                        onChange={e => setSelectedTema(e.target.value)}
                        className="w-full bg-[#0a0710] border border-indigo-800/50 rounded-lg p-2.5 text-sm text-white focus:outline-none focus:border-indigo-500"
                      >
                        <option value="">-- Selecciona un tema --</option>
                        {temas.map(t => (
                          <option key={t.id} value={t.id}>{t.titulo}</option>
                        ))}
                      </select>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* Tipo de Ejercicio */}
          <div className="space-y-3">
            <label className="text-sm font-semibold text-indigo-300">Tipo de Reactivos</label>
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => setType("multiple")}
                className={`p-3 rounded-lg border text-sm transition ${
                  type === "multiple" ? "bg-blue-600/20 border-blue-500 text-blue-200" : "bg-white/5 border-white/10 text-slate-400 hover:bg-white/10"
                }`}
              >
                Opción Múltiple
              </button>
              <button
                onClick={() => setType("boolean")}
                className={`p-3 rounded-lg border text-sm transition ${
                  type === "boolean" ? "bg-emerald-600/20 border-emerald-500 text-emerald-200" : "bg-white/5 border-white/10 text-slate-400 hover:bg-white/10"
                }`}
              >
                Verdadero / Falso
              </button>
            </div>
          </div>

          {/* Cantidad de preguntas */}
          <div className="space-y-3">
            <label className="text-sm font-semibold text-indigo-300">Cantidad de preguntas</label>
            <div className="flex items-center gap-4">
              <input
                type="range"
                min="1"
                max="20"
                value={count}
                onChange={e => setCount(parseInt(e.target.value))}
                className="flex-1 accent-indigo-500"
              />
              <div className="w-12 h-10 bg-[#0a0710] border border-indigo-800/50 rounded-lg flex items-center justify-center font-bold text-white">
                {count}
              </div>
            </div>
          </div>

        </div>

        <div className="p-5 border-t border-indigo-500/20 bg-black/40 flex justify-end gap-3">
          <button onClick={onClose} className="px-5 py-2.5 rounded-xl text-sm font-medium text-slate-300 hover:bg-white/5 transition">
            Cancelar
          </button>
          <button
            onClick={handleGenerate}
            disabled={!isFormValid}
            className="px-6 py-2.5 rounded-xl text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed shadow-[0_0_15px_rgba(79,70,229,0.3)] transition"
          >
            Generar Ejercicio
          </button>
        </div>
      </div>
    </div>
  );
}
