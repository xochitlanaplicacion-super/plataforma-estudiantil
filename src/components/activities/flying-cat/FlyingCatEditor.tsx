'use client';

import { useRef, useState, type ReactNode } from 'react';
import { Copy, Download, Plus, Trash2, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import {
  createFlyingCatContent,
  createFlyingCatQuestion,
  normalizeFlyingCatContent,
  validateFlyingCatContent,
  FLYING_CAT_MAX_ITEMS,
  FLYING_CAT_MAX_OPTION_CHARACTERS,
  type FlyingCatContent,
  type FlyingCatDifficulty,
} from '@/lib/activities/flying-cat';

const JSON_EXAMPLE: FlyingCatContent = {
  version: 1,
  instructions: 'Lee la definición y pilota hacia el concepto correcto. Evita los obstáculos.',
  showFeedback: true,
  settings: { difficulty: 'normal' },
  items: [{
    id: 'definicion-1',
    prompt: 'Profesional que cuida la salud de los animales, diagnostica enfermedades y recomienda tratamientos para mascotas o animales de granja. ¿Qué concepto corresponde a esta descripción?',
    options: ['Veterinario', 'Dentista', 'Bombero', 'Piloto'],
    correctIndex: 0,
    feedback: 'El veterinario estudia, previene y trata las enfermedades de los animales; las otras profesiones realizan funciones distintas.',
  }],
};

export function FlyingCatEditor({ content: rawContent, updateContent, aiControls }: {
  content: unknown;
  updateContent: (content: FlyingCatContent) => void;
  aiControls?: ReactNode;
}) {
  const content = normalizeFlyingCatContent(rawContent || createFlyingCatContent());
  const [jsonOpen, setJsonOpen] = useState(false);
  const [jsonText, setJsonText] = useState('');
  const [jsonError, setJsonError] = useState('');
  const fileInput = useRef<HTMLInputElement>(null);
  const patch = (changes: Partial<FlyingCatContent>) => updateContent({ ...content, ...changes });
  const updateItem = (index: number, changes: Partial<FlyingCatContent['items'][number]>) =>
    patch({ items: content.items.map((item, current) => current === index ? { ...item, ...changes } : item) });
  const importJson = (text: string) => {
    try {
      const parsed: unknown = JSON.parse(text);
      const error = validateFlyingCatContent(parsed);
      if (error) { setJsonError(error); return; }
      updateContent(normalizeFlyingCatContent(parsed));
      setJsonError('');
      setJsonOpen(false);
    } catch { setJsonError('El archivo no contiene JSON válido. Revisa comas, comillas y llaves.'); }
  };
  const exportJson = () => {
    const error = validateFlyingCatContent(content);
    if (error) { setJsonError(error); setJsonOpen(true); return; }
    const url = URL.createObjectURL(new Blob([JSON.stringify(content, null, 2)], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url; link.download = 'flying-cat.json'; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return <div className="space-y-5">
    {aiControls}
    <section className="space-y-4 rounded-3xl border-2 border-orange-100 bg-orange-50/40 p-5">
      <div><h3 className="text-lg font-black text-slate-800">Flying Cat · definiciones y conceptos</h3>
        <p className="mt-1 text-sm text-slate-600">Describe una definición o caso de uso completo. El alumno pilota hacia el concepto correcto; los conceptos aparecen espaciados, no todos juntos.</p></div>
      <label className="block text-sm font-bold">Instrucciones para el alumno
        <textarea rows={2} maxLength={1000} value={content.instructions} onChange={(event) => patch({ instructions: event.target.value })}
          className="mt-2 w-full rounded-xl border bg-white p-3 font-normal" /></label>
      <div className="flex flex-wrap items-center gap-4">
        <label className="text-sm font-bold">Dificultad inicial
          <select value={content.settings.difficulty} onChange={(event) => patch({ settings: { difficulty: event.target.value as FlyingCatDifficulty } })}
            className="ml-3 rounded-xl border bg-white p-2 font-normal">
            <option value="easy">Fácil</option><option value="normal">Normal</option><option value="hard">Difícil</option>
          </select></label>
        <label className="flex items-center gap-3 text-sm font-bold">Explicación al responder
          <Switch checked={content.showFeedback} onCheckedChange={(checked) => patch({ showFeedback: checked })} /></label>
      </div>
      <p className="text-xs text-slate-600">La velocidad aumenta al avanzar. Durante la explicación el vuelo se pausa; al continuar hay 3 segundos de protección. Las posiciones cambian en cada intento.</p>
    </section>

    <div className="flex flex-wrap items-center justify-between gap-2">
      <h3 className="font-bold">Definiciones ({content.items.length}/{FLYING_CAT_MAX_ITEMS})</h3>
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" onClick={() => { setJsonOpen(!jsonOpen); setJsonError(''); }}><Upload size={16} className="mr-2" />Importar JSON</Button>
        <Button type="button" variant="outline" onClick={exportJson}><Download size={16} className="mr-2" />Exportar JSON</Button>
        <Button type="button" disabled={content.items.length >= FLYING_CAT_MAX_ITEMS} onClick={() => patch({ items: [...content.items, createFlyingCatQuestion()] })}><Plus size={16} className="mr-2" />Definición</Button>
      </div>
    </div>

    {jsonOpen && <section className="space-y-3 rounded-2xl border bg-slate-50 p-4">
      <p className="text-sm">Importa el JSON completo: versión 1, instrucciones, showFeedback, dificultad e items. correctIndex empieza en 0. Se reemplazan las definiciones sólo si todo el archivo es válido.</p>
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" onClick={() => { setJsonText(JSON.stringify(JSON_EXAMPLE, null, 2)); setJsonError(''); }}>Ver ejemplo JSON</Button>
        <Button type="button" variant="outline" onClick={() => fileInput.current?.click()}>Elegir archivo .json</Button>
        <input ref={fileInput} type="file" accept=".json,application/json" className="hidden" aria-label="Archivo JSON de Flying Cat" onChange={async (event) => {
          const file = event.target.files?.[0];
          event.target.value = '';
          if (!file) return;
          if (file.size > 200_000) { setJsonError('El JSON no puede superar 200 KB.'); return; }
          try { const text = await file.text(); setJsonText(text); importJson(text); }
          catch { setJsonError('No se pudo leer el archivo.'); }
        }} />
      </div>
      <textarea rows={10} value={jsonText} onChange={(event) => setJsonText(event.target.value)} spellCheck={false} placeholder="Pega aquí el JSON…"
        aria-label="JSON de Flying Cat" className="w-full rounded-xl border bg-white p-3 font-mono text-xs" />
      {jsonError && <p role="alert" className="text-sm font-bold text-red-700">{jsonError}</p>}
      <Button type="button" disabled={!jsonText.trim()} onClick={() => importJson(jsonText)}>Validar e importar</Button>
    </section>}

    {content.items.map((item, questionIndex) => <section key={item.id} className="space-y-4 rounded-3xl border-2 border-slate-100 bg-white p-5">
      <div className="flex items-center justify-between gap-2">
        <h4 className="font-bold">Definición {questionIndex + 1}</h4>
        <div className="flex gap-1">
          <Button type="button" variant="ghost" size="icon" aria-label={`Duplicar definición ${questionIndex + 1}`} disabled={content.items.length >= FLYING_CAT_MAX_ITEMS} onClick={() => {
            const items = [...content.items]; items.splice(questionIndex + 1, 0, { ...item, id: crypto.randomUUID(), options: [...item.options] }); patch({ items });
          }}><Copy size={16} /></Button>
          <Button type="button" variant="ghost" size="icon" aria-label={`Eliminar definición ${questionIndex + 1}`} disabled={content.items.length === 1}
            onClick={() => patch({ items: content.items.filter((_, index) => index !== questionIndex) })}><Trash2 size={16} /></Button>
        </div>
      </div>
      <label className="block text-sm font-bold">Descripción, definición o caso de uso
        <textarea rows={4} maxLength={1600} value={item.prompt} onChange={(event) => updateItem(questionIndex, { prompt: event.target.value })}
          placeholder="Describe las características o un caso completo para que el alumno identifique el concepto…"
          className="mt-2 w-full rounded-xl border bg-slate-50 p-3 font-normal" />
        <span className="mt-1 block text-xs font-normal text-slate-500">30–1600 caracteres. Aquí puedes explicar ampliamente; las tarjetas llevan sólo conceptos cortos.</span>
      </label>
      <p className="text-sm font-bold">Conceptos · marca la respuesta correcta</p>
      <div className="grid gap-3 md:grid-cols-2">
        {item.options.map((option, optionIndex) => <div key={optionIndex} className={`flex items-center gap-2 rounded-xl border-2 p-2 ${item.correctIndex === optionIndex ? 'border-primary bg-primary/5' : 'border-slate-100'}`}>
          <input type="radio" name={`flying-cat-correct-${item.id}`} aria-label={`Concepto ${optionIndex + 1} correcto de definición ${questionIndex + 1}`}
            checked={item.correctIndex === optionIndex} onChange={() => updateItem(questionIndex, { correctIndex: optionIndex })} />
          <Input value={option} maxLength={FLYING_CAT_MAX_OPTION_CHARACTERS} aria-label={`Concepto ${optionIndex + 1} de definición ${questionIndex + 1}`} placeholder={`Concepto ${optionIndex + 1}`}
            onChange={(event) => updateItem(questionIndex, { options: item.options.map((current, index) => index === optionIndex ? event.target.value : current) })} />
          <Button type="button" variant="ghost" size="icon" disabled={item.options.length <= 2} aria-label={`Quitar concepto ${optionIndex + 1} de definición ${questionIndex + 1}`} onClick={() => updateItem(questionIndex, {
            options: item.options.filter((_, index) => index !== optionIndex),
            correctIndex: item.correctIndex === optionIndex ? -1 : item.correctIndex > optionIndex ? item.correctIndex - 1 : item.correctIndex,
          })}><Trash2 size={14} /></Button>
        </div>)}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" variant="outline" disabled={item.options.length >= 4} onClick={() => updateItem(questionIndex, { options: [...item.options, ''] })}><Plus size={14} className="mr-2" />Concepto</Button>
        <span className="text-xs text-slate-500">2–4 conceptos · máximo 2 palabras y 24 caracteres cada uno.</span>
      </div>
      <label className="block text-sm font-bold">Explicación de la respuesta
        <textarea rows={3} maxLength={2000} value={item.feedback} onChange={(event) => updateItem(questionIndex, { feedback: event.target.value })}
          placeholder="Explica por qué ese concepto corresponde a la definición. La IA también genera esta explicación."
          className="mt-2 w-full rounded-xl border bg-slate-50 p-3 font-normal" /></label>
    </section>)}
  </div>;
}
