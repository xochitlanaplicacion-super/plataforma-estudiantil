'use client';

import type { ReactNode } from 'react';
import { Copy, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import {
  createBackroomsScapeContent,
  createBackroomsScapeQuestion,
  normalizeBackroomsScapeContent,
  type BackroomsQuestionType,
  type BackroomsScapeContent,
} from '@/lib/activities/backrooms-scape';

function Segmented({ value, onChange, choices }: {
  value: string;
  onChange: (value: string) => void;
  choices: Array<{ value: string; label: string }>;
}) {
  return <div className="grid grid-flow-col auto-cols-fr gap-1 rounded-2xl border bg-slate-50 p-1">
    {choices.map((choice) => <button key={choice.value} type="button" onClick={() => onChange(choice.value)}
      className={`rounded-xl px-2 py-2 text-[10px] font-black uppercase transition ${value === choice.value ? 'bg-primary text-primary-foreground shadow' : 'text-slate-500 hover:bg-white'}`}>
      {choice.label}
    </button>)}
  </div>;
}

export function BackroomsScapeEditor({ content: rawContent, updateContent, aiControls }: {
  content: unknown;
  updateContent: (content: BackroomsScapeContent) => void;
  aiControls?: ReactNode;
}) {
  const content = normalizeBackroomsScapeContent(rawContent || createBackroomsScapeContent());
  const patch = (changes: Partial<BackroomsScapeContent>) => updateContent({ ...content, ...changes });
  const patchSettings = (changes: Partial<BackroomsScapeContent['settings']>) =>
    patch({ settings: { ...content.settings, ...changes } });
  const updateItem = (index: number, changes: Partial<BackroomsScapeContent['items'][number]>) =>
    patch({ items: content.items.map((item, itemIndex) => itemIndex === index ? { ...item, ...changes } : item) });
  const changeType = (index: number, type: BackroomsQuestionType) => {
    const current = content.items[index];
    updateItem(index, {
      type,
      options: type === 'true_false' ? ['Verdadero', 'Falso']
        : current.options.length === 4 ? current.options : ['', '', '', ''],
      correctIndex: 0,
    });
  };

  return <div className="space-y-6">
    {aiControls}
    <section className="rounded-3xl border-2 border-slate-100 bg-white p-6 shadow-sm">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h3 className="font-black uppercase text-slate-800">Preset de Backrooms Scape</h3>
          <p className="text-xs font-medium text-slate-500">El laberinto, la amenaza y las preguntas se guardan dentro del ejercicio del tenant.</p>
        </div>
        <label className="flex items-center gap-3 rounded-2xl bg-slate-50 px-4 py-3 text-xs font-black text-slate-700">
          Mostrar explicación <Switch checked={content.showFeedback} onCheckedChange={(checked) => patch({ showFeedback: checked })} />
        </label>
      </div>
      <label className="block">
        <span className="mb-2 block text-[10px] font-black uppercase tracking-widest text-slate-400">Instrucciones</span>
        <textarea value={content.instructions} rows={2} onChange={(event) => patch({ instructions: event.target.value })}
          className="w-full resize-none rounded-2xl border-2 border-slate-100 p-4 text-sm outline-none focus:border-primary/40" />
      </label>
      <div className="mt-5 grid gap-5 md:grid-cols-2">
        <div><span className="mb-2 block text-[10px] font-black uppercase tracking-widest text-slate-400">Dificultad del Merodeador</span>
          <Segmented value={content.settings.difficulty} onChange={(value) => patchSettings({ difficulty: value as any })}
            choices={[{ value: 'easy', label: 'Fácil' }, { value: 'normal', label: 'Normal' }, { value: 'hard', label: 'Difícil' }]} /></div>
        <div><span className="mb-2 block text-[10px] font-black uppercase tracking-widest text-slate-400">Tamaño del laberinto</span>
          <Segmented value={content.settings.mazeSize} onChange={(value) => patchSettings({ mazeSize: value as any })}
            choices={[{ value: 'small', label: 'Pequeño' }, { value: 'medium', label: 'Mediano' }, { value: 'large', label: 'Grande' }]} /></div>
        <label><span className="mb-2 block text-[10px] font-black uppercase tracking-widest text-slate-400">Bioma</span>
          <select value={content.settings.biome} onChange={(event) => patchSettings({ biome: event.target.value as any })}
            className="h-11 w-full rounded-xl border bg-white px-3 text-xs font-bold">
            <option value="liminal_halls">Pasillos liminales</option><option value="flooded_rooms">Salas inundadas</option>
            <option value="toy_rooms">Juguetes gigantes</option><option value="storage_maze">Almacén</option><option value="mixed">Mezcla procedural</option>
          </select></label>
        <div><span className="mb-2 block text-[10px] font-black uppercase tracking-widest text-slate-400">Mapa para alumnos</span>
          <Segmented value={content.settings.seedMode} onChange={(value) => patchSettings({ seedMode: value as any })}
            choices={[{ value: 'unique', label: 'Distinto' }, { value: 'fixed', label: 'Mismo mapa' }]} />
          {content.settings.seedMode === 'fixed' && <Input className="mt-2 font-mono tracking-widest" value={content.settings.fixedSeed}
            onChange={(event) => patchSettings({ fixedSeed: event.target.value.replace(/\D/g, '').slice(0, 8) })} />}</div>
        <label><span className="mb-2 block text-[10px] font-black uppercase tracking-widest text-slate-400">Tiempo por pregunta (10–60 s)</span>
          <Input type="number" min={10} max={60} value={content.settings.questionTime} onChange={(event) => patchSettings({ questionTime: Number(event.target.value) })} /></label>
        <label><span className="mb-2 block text-[10px] font-black uppercase tracking-widest text-slate-400">Puerta bloqueada al fallar (5–20 s)</span>
          <Input type="number" min={5} max={20} value={content.settings.doorLockSeconds} onChange={(event) => patchSettings({ doorLockSeconds: Number(event.target.value) })} /></label>
        <label><span className="mb-2 block text-[10px] font-black uppercase tracking-widest text-slate-400">Fragmentos para escapar</span>
          <Input type="number" min={1} max={content.items.length} value={content.settings.requiredFragments}
            onChange={(event) => patchSettings({ requiredFragments: Number(event.target.value) })} /></label>
      </div>
    </section>

    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><h3 className="font-black uppercase text-slate-800">Preguntas de las salas seguras</h3>
        <p className="text-xs text-slate-500">Puedes mezclar opción múltiple y verdadero/falso.</p></div>
      <div className="flex gap-2"><Button type="button" variant="outline" onClick={() => patch({ items: [...content.items, createBackroomsScapeQuestion('multiple_choice')] })}><Plus size={15} className="mr-2" />Opción múltiple</Button>
        <Button type="button" variant="outline" onClick={() => patch({ items: [...content.items, createBackroomsScapeQuestion('true_false')] })}><Plus size={15} className="mr-2" />Verdadero/Falso</Button></div>
    </div>

    {content.items.map((item, questionIndex) => <section key={item.id} className="space-y-4 rounded-3xl border-2 border-slate-100 bg-slate-50/60 p-5">
      <div className="flex flex-wrap items-center gap-3">
        <span className="grid h-8 w-8 place-items-center rounded-xl bg-primary text-xs font-black text-primary-foreground">{questionIndex + 1}</span>
        <div className="min-w-[15rem] flex-1"><Segmented value={item.type} onChange={(value) => changeType(questionIndex, value as BackroomsQuestionType)}
          choices={[{ value: 'multiple_choice', label: 'Opción múltiple' }, { value: 'true_false', label: 'Verdadero / Falso' }]} /></div>
        <Button type="button" variant="ghost" size="icon" title="Duplicar" onClick={() => {
          const items = [...content.items]; items.splice(questionIndex + 1, 0, { ...item, id: crypto.randomUUID(), options: [...item.options] }); patch({ items });
        }}><Copy size={15} /></Button>
        <Button type="button" variant="ghost" size="icon" className="text-destructive" disabled={content.items.length === 1}
          onClick={() => patch({ items: content.items.filter((_, index) => index !== questionIndex), settings: { ...content.settings, requiredFragments: Math.min(content.settings.requiredFragments, content.items.length - 1) } })}><Trash2 size={15} /></Button>
      </div>
      <Input className="bg-white font-bold" placeholder={item.type === 'true_false' ? 'Escribe una afirmación…' : 'Escribe la pregunta…'} value={item.prompt}
        onChange={(event) => updateItem(questionIndex, { prompt: event.target.value })} />
      <div className={`grid gap-3 ${item.type === 'true_false' ? 'grid-cols-2' : 'md:grid-cols-2'}`}>
        {item.options.map((option, optionIndex) => <label key={optionIndex}
          className={`flex items-center gap-3 rounded-2xl border-2 bg-white p-3 ${item.correctIndex === optionIndex ? 'border-primary/50' : 'border-slate-100'}`}>
          <input type="radio" name={`backrooms-correct-${questionIndex}`} checked={item.correctIndex === optionIndex}
            onChange={() => updateItem(questionIndex, { correctIndex: optionIndex })} />
          {item.type === 'true_false' ? <span className="font-black text-slate-700">{option}</span>
            : <Input className="border-0 shadow-none" value={option} placeholder={`Respuesta ${optionIndex + 1}`}
              onChange={(event) => updateItem(questionIndex, { options: item.options.map((current, index) => index === optionIndex ? event.target.value : current) })} />}
        </label>)}
      </div>
      <label className="block"><span className="mb-2 block text-[10px] font-black uppercase tracking-widest text-slate-400">Justificación guardada</span>
        <textarea value={item.feedback} rows={2} onChange={(event) => updateItem(questionIndex, { feedback: event.target.value })}
          placeholder="Explica por qué la respuesta es correcta…" className="w-full resize-none rounded-2xl border-2 border-slate-100 bg-white p-4 text-sm outline-none focus:border-primary/40" /></label>
    </section>)}
  </div>;
}
