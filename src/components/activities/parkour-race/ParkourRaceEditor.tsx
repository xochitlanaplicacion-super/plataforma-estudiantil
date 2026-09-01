'use client';

import type { ReactNode } from 'react';
import { Copy, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import {
  createParkourRaceContent,
  createParkourRaceQuestion,
  normalizeParkourRaceContent,
  type ParkourQuestionType,
  type ParkourRaceContent,
} from '@/lib/activities/parkour-race';

const OPTIONS = ['A', 'B', 'C', 'D'];

function ChoiceGroup({
  value,
  onChange,
  choices,
}: {
  value: string;
  onChange: (value: string) => void;
  choices: { value: string; label: string }[];
}) {
  return (
    <div className="grid grid-flow-col auto-cols-fr gap-1 rounded-2xl border bg-slate-50 p-1">
      {choices.map((choice) => (
        <button
          key={choice.value}
          type="button"
          onClick={() => onChange(choice.value)}
          className={`rounded-xl px-2 py-2 text-[10px] font-black uppercase transition ${
            value === choice.value ? 'bg-primary text-white shadow' : 'text-slate-500 hover:bg-white'
          }`}
        >
          {choice.label}
        </button>
      ))}
    </div>
  );
}

export function ParkourRaceEditor({
  content: rawContent,
  updateContent,
  aiControls,
}: {
  content: unknown;
  updateContent: (content: ParkourRaceContent) => void;
  aiControls?: ReactNode;
}) {
  const content = normalizeParkourRaceContent(rawContent || createParkourRaceContent());
  const patch = (changes: Partial<ParkourRaceContent>) => updateContent({ ...content, ...changes });
  const patchSettings = (changes: Partial<ParkourRaceContent['settings']>) => {
    patch({ settings: { ...content.settings, ...changes } });
  };
  const updateItem = (index: number, changes: Record<string, unknown>) => {
    const items = content.items.map((item, itemIndex) => itemIndex === index ? { ...item, ...changes } : item);
    patch({ items });
  };
  const changeQuestionType = (index: number, type: ParkourQuestionType) => {
    updateItem(index, {
      type,
      options: createParkourRaceQuestion(type).options,
      correctId: '1',
    });
  };

  return (
    <div className="space-y-6">
      {aiControls}

      <div className="rounded-3xl border-2 border-slate-100 bg-white p-6 shadow-sm">
        <div className="mb-5 flex items-center justify-between gap-4">
          <div>
            <h3 className="font-black uppercase text-slate-800">Preset de Parkour Race</h3>
            <p className="text-xs font-medium text-slate-500">Estas opciones se guardarán con el ejercicio del profesor.</p>
          </div>
          <label className="flex items-center gap-3 rounded-2xl bg-slate-50 px-4 py-3 text-xs font-black text-slate-700">
            Mostrar retroalimentación
            <Switch checked={content.showFeedback} onCheckedChange={(checked) => patch({ showFeedback: checked })} />
          </label>
        </div>

        <label className="block">
          <span className="mb-2 block text-[10px] font-black uppercase tracking-widest text-slate-400">Instrucciones del juego</span>
          <textarea
            value={content.instructions}
            onChange={(event) => patch({ instructions: event.target.value })}
            rows={2}
            className="w-full resize-none rounded-2xl border-2 border-slate-100 p-4 text-sm outline-none focus:border-primary/40"
          />
        </label>

        <div className="mt-5 grid gap-5 md:grid-cols-2">
          <div>
            <span className="mb-2 block text-[10px] font-black uppercase tracking-widest text-slate-400">Tamaño del mapa</span>
            <ChoiceGroup value={content.settings.mapSize} onChange={(value) => patchSettings({ mapSize: value as any })} choices={[
              { value: 'small', label: 'Pequeño' }, { value: 'medium', label: 'Mediano' },
              { value: 'large', label: 'Grande' }, { value: 'custom', label: 'Personalizado' },
            ]} />
            {content.settings.mapSize === 'custom' && (
              <Input className="mt-2" type="number" min={1} max={20} value={content.settings.customStations}
                onChange={(event) => patchSettings({ customStations: Math.max(1, Math.min(20, Number(event.target.value) || 1)) })} />
            )}
          </div>
          <div>
            <span className="mb-2 block text-[10px] font-black uppercase tracking-widest text-slate-400">Dificultad</span>
            <ChoiceGroup value={content.settings.difficulty} onChange={(value) => patchSettings({ difficulty: value as any })} choices={[
              { value: 'easy', label: 'Fácil' }, { value: 'normal', label: 'Normal' }, { value: 'hard', label: 'Difícil' },
            ]} />
          </div>
          <div>
            <span className="mb-2 block text-[10px] font-black uppercase tracking-widest text-slate-400">Intensidad de parkour</span>
            <ChoiceGroup value={content.settings.parkour} onChange={(value) => patchSettings({ parkour: value as any })} choices={[
              { value: 'low', label: 'Baja' }, { value: 'medium', label: 'Media' }, { value: 'high', label: 'Alta' },
            ]} />
          </div>
          <div>
            <span className="mb-2 block text-[10px] font-black uppercase tracking-widest text-slate-400">Mapa para alumnos</span>
            <ChoiceGroup value={content.settings.seedMode} onChange={(value) => patchSettings({ seedMode: value as any })} choices={[
              { value: 'unique', label: 'Distinto' }, { value: 'fixed', label: 'Mismo' }, { value: 'manual', label: 'Código' },
            ]} />
            {content.settings.seedMode !== 'unique' && (
              <Input className="mt-2 font-mono tracking-widest" value={content.settings.fixedSeed}
                onChange={(event) => patchSettings({ fixedSeed: event.target.value.replace(/\D/g, '').slice(0, 8) })} />
            )}
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-black uppercase text-slate-800">Preguntas del recorrido</h3>
          <p className="text-xs text-slate-500">Cada pregunta corresponde a una estación del juego.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" className="rounded-xl" onClick={() => patch({ items: [...content.items, createParkourRaceQuestion('multiple_choice')] })}>
            <Plus size={15} className="mr-2" /> Opción múltiple
          </Button>
          <Button type="button" variant="outline" className="rounded-xl" onClick={() => patch({ items: [...content.items, createParkourRaceQuestion('true_false')] })}>
            <Plus size={15} className="mr-2" /> Verdadero/Falso
          </Button>
        </div>
      </div>

      {content.items.map((item, questionIndex) => (
        <div key={questionIndex} className="space-y-4 rounded-3xl border-2 border-slate-100 bg-slate-50/60 p-5">
          <div className="flex items-center gap-3">
            <span className="grid h-8 w-8 place-items-center rounded-xl bg-primary text-xs font-black text-white">{questionIndex + 1}</span>
            <Input className="flex-1 bg-white font-bold" placeholder="Escribe la pregunta…" value={item.question}
              onChange={(event) => updateItem(questionIndex, { question: event.target.value })} />
            <Button type="button" variant="ghost" size="icon" title="Duplicar pregunta" onClick={() => {
              const items = [...content.items];
              items.splice(questionIndex + 1, 0, { ...item, options: item.options.map((option) => ({ ...option })) });
              patch({ items });
            }}><Copy size={15} /></Button>
            <Button type="button" variant="ghost" size="icon" className="text-destructive" disabled={content.items.length === 1}
              onClick={() => patch({ items: content.items.filter((_, index) => index !== questionIndex) })}><Trash2 size={15} /></Button>
          </div>

          <ChoiceGroup value={item.type} onChange={(value) => changeQuestionType(questionIndex, value as ParkourQuestionType)} choices={[
            { value: 'multiple_choice', label: 'Opción múltiple' },
            { value: 'true_false', label: 'Verdadero / Falso' },
          ]} />

          <div className="grid gap-3 md:grid-cols-2">
            {item.options.map((option, optionIndex) => (
              <label key={option.id} className={`flex items-center gap-3 rounded-2xl border-2 bg-white p-3 ${item.correctId === option.id ? 'border-primary/50' : 'border-slate-100'}`}>
                <input type="radio" name={`parkour-correct-${questionIndex}`} checked={item.correctId === option.id}
                  onChange={() => updateItem(questionIndex, { correctId: option.id })} />
                <span className="w-5 text-center text-xs font-black text-slate-500">{OPTIONS[optionIndex]}</span>
                {item.type === 'true_false' ? <span className="font-bold text-slate-700">{option.text}</span> :
                  <Input className="border-0 shadow-none" value={option.text} placeholder={`Respuesta ${OPTIONS[optionIndex]}`}
                    onChange={(event) => updateItem(questionIndex, {
                      options: item.options.map((current, index) => index === optionIndex ? { ...current, text: event.target.value } : current),
                    })} />}
              </label>
            ))}
          </div>

          <label className="block">
            <span className="mb-2 block text-[10px] font-black uppercase tracking-widest text-slate-400">Justificación guardada</span>
            <textarea value={item.feedback} onChange={(event) => updateItem(questionIndex, { feedback: event.target.value })}
              rows={2} placeholder="Explica por qué la respuesta es correcta…"
              className="w-full resize-none rounded-2xl border-2 border-slate-100 bg-white p-4 text-sm outline-none focus:border-primary/40" />
          </label>
        </div>
      ))}
    </div>
  );
}
