'use client';

import { useMemo, useRef, useState, useTransition } from 'react';
import { BookOpenCheck, BrainCircuit, Loader2, Pencil, Plus, Save, Shuffle, Sparkles, Trash2, X } from 'lucide-react';
import { deleteClassroomBankAction, saveClassroomBankAction, type ClassroomQuestionInput } from '@/lib/actions/classroom-games';
import { shuffleEachQuestionOptions, shuffleQuestionOptions, type ClassroomQuestionMode } from '@/lib/activities/classroom-question-options';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';

const emptyQuestion = (): ClassroomQuestionInput => ({
  prompt: '', questionType: 'multiple_choice', options: ['', '', '', ''], correctIndex: 0, explanation: '',
});

export function QuestionBankManager({ initialData }: { initialData: any }) {
  const [banks, setBanks] = useState(initialData.banks || []);
  const [subjectId, setSubjectId] = useState(initialData.assignments?.[0]?.materia_id || '');
  const [title, setTitle] = useState('');
  const [unitName, setUnitName] = useState('');
  const [topicName, setTopicName] = useState('');
  const [description, setDescription] = useState('');
  const [questions, setQuestions] = useState<ClassroomQuestionInput[]>([emptyQuestion()]);
  const [editingBankId, setEditingBankId] = useState<string | null>(null);
  const [deletingBank, setDeletingBank] = useState<any | null>(null);
  const [message, setMessage] = useState('');
  const [aiPrompt, setAiPrompt] = useState('');
  const [aiCount, setAiCount] = useState(5);
  const [aiMode, setAiMode] = useState<ClassroomQuestionMode>('mixed');
  const [shuffleGeneratedOptions, setShuffleGeneratedOptions] = useState(true);
  const [aiPending, setAiPending] = useState(false);
  const [pending, startTransition] = useTransition();
  const editorRef = useRef<HTMLElement>(null);
  const subjects = useMemo(() => {
    const map = new Map<string, string>();
    for (const item of initialData.assignments || []) map.set(item.materia_id, item.materias?.nombre || 'Materia');
    return [...map.entries()];
  }, [initialData.assignments]);

  function updateQuestion(index: number, patch: Partial<ClassroomQuestionInput>) {
    setQuestions((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item));
  }

  function resetEditor() {
    setEditingBankId(null);
    setTitle('');
    setUnitName('');
    setTopicName('');
    setDescription('');
    setQuestions([emptyQuestion()]);
    setAiPrompt('');
  }

  function editBank(bank: any) {
    const bankQuestions = [...(bank.classroom_question_items || [])]
      .sort((a: any, b: any) => Number(a.position || 0) - Number(b.position || 0))
      .map((question: any): ClassroomQuestionInput => ({
        prompt: question.prompt,
        questionType: question.question_type,
        options: Array.isArray(question.options) ? [...question.options] : [],
        correctIndex: Number(question.correct_index),
        explanation: question.explanation || '',
      }));
    setEditingBankId(bank.id);
    setSubjectId(bank.subject_id);
    setTitle(bank.title || '');
    setUnitName(bank.unit_name || '');
    setTopicName(bank.topic_name || '');
    setDescription(bank.description || '');
    setQuestions(bankQuestions.length ? bankQuestions : [emptyQuestion()]);
    setMessage(`Editando “${bank.title}”. Los cambios sólo se aplicarán al guardar.`);
    requestAnimationFrame(() => editorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  }

  function save() {
    setMessage('');
    startTransition(async () => {
      const result = await saveClassroomBankAction({ bankId: editingBankId || undefined, subjectId, title, unitName, topicName, description, questions });
      if (!result.ok) return setMessage(result.message);
      const saved = {
        id: result.data.id, subject_id: subjectId, title, unit_name: unitName,
        topic_name: topicName, description, status: 'ready',
        classroom_question_items: questions.map((question, position) => ({
          id: `${result.data.id}-${position}`, position, question_type: question.questionType,
          prompt: question.prompt, options: question.options, correct_index: question.correctIndex,
          explanation: question.explanation || '',
        })),
      };
      setBanks((current: any[]) => editingBankId
        ? current.map((bank) => bank.id === editingBankId ? saved : bank)
        : [saved, ...current]);
      resetEditor();
      setMessage(editingBankId ? 'Cambios guardados y persistidos correctamente.' : 'Banco guardado y listo para usar en una actividad de clase.');
    });
  }

  function removeBank() {
    if (!deletingBank) return;
    const bank = deletingBank;
    startTransition(async () => {
      const result = await deleteClassroomBankAction(bank.id);
      if (!result.ok) return setMessage(result.message);
      setBanks((current: any[]) => current.filter((item) => item.id !== bank.id));
      if (editingBankId === bank.id) resetEditor();
      setDeletingBank(null);
      setMessage(result.data.archived
        ? 'El banco se ocultó y el historial de las partidas que lo utilizaron quedó protegido.'
        : 'Banco eliminado correctamente.');
    });
  }

  async function generateWithAI() {
    const prompt = aiPrompt.trim();
    if (prompt.length < 5) return setMessage('Describe el tema, contenido o instrucciones para generar las preguntas.');
    setMessage('');
    setAiPending(true);
    try {
      const response = await fetch('/api/exercises/generate-classroom-bank', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, count: aiCount, mode: aiMode }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || 'No fue posible generar las preguntas.');
      let generated = result.items as ClassroomQuestionInput[];
      if (!Array.isArray(generated) || generated.length < 1) throw new Error('La IA no devolvió preguntas válidas.');
      if (shuffleGeneratedOptions) generated = shuffleEachQuestionOptions(generated);
      setQuestions((current) => {
        const hasWrittenQuestions = current.some((question) => question.prompt.trim() || question.options.some((option) => option.trim() && !['Verdadero', 'Falso'].includes(option)));
        return hasWrittenQuestions ? [...current, ...generated] : generated;
      });
      if (!title.trim()) setTitle(topicName.trim() || unitName.trim() || 'Banco generado con IA');
      setMessage(`${generated.length} preguntas generadas y listas para revisión. Verifica las respuestas antes de guardar.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No fue posible generar las preguntas.');
    } finally {
      setAiPending(false);
    }
  }

  return <main className="mx-auto max-w-7xl space-y-6 pb-16">
    <header className="rounded-3xl bg-gradient-to-br from-slate-950 via-blue-950 to-cyan-800 p-7 text-white shadow-xl">
      <div className="flex items-center gap-3"><BookOpenCheck className="size-9 text-cyan-300"/><div><p className="text-xs font-bold uppercase tracking-[.22em] text-cyan-200">Práctica independiente</p><h1 className="text-3xl font-black">Banco de actividades</h1></div></div>
      <p className="mt-3 max-w-3xl text-sm text-blue-100">Crea preguntas reutilizables por materia, unidad y tema. Este banco no genera tareas, entregas ni calificaciones.</p>
    </header>
    <section ref={editorRef} className={`scroll-mt-6 rounded-3xl border bg-card p-6 shadow-sm ${editingBankId ? 'border-blue-500 ring-2 ring-blue-500/10' : ''}`}>
      <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-wider text-primary">{editingBankId ? 'Edición completa' : 'Nuevo contenido'}</p><h2 className="text-xl font-black">{editingBankId ? `Editar: ${title || 'Banco'}` : 'Nuevo banco'}</h2></div>{editingBankId && <Button type="button" variant="outline" onClick={() => { resetEditor(); setMessage('Edición cancelada; no se modificó el banco.'); }}><X className="size-4" /> Cancelar edición</Button>}</div>
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <label className="space-y-1 text-sm font-semibold">Materia<select className="h-11 w-full rounded-lg border bg-background px-3" value={subjectId} onChange={(event) => setSubjectId(event.target.value)}>{subjects.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label>
        <label className="space-y-1 text-sm font-semibold">Nombre del banco<Input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Repaso de verbos irregulares"/></label>
        <label className="space-y-1 text-sm font-semibold">Unidad (opcional)<Input value={unitName} onChange={(event) => setUnitName(event.target.value)} /></label>
        <label className="space-y-1 text-sm font-semibold">Tema (opcional)<Input value={topicName} onChange={(event) => setTopicName(event.target.value)} /></label>
        <label className="space-y-1 text-sm font-semibold md:col-span-2">Descripción (opcional)<Textarea value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Propósito o notas de uso de este banco" /></label>
      </div>
      <div className="mt-6 overflow-hidden rounded-2xl border border-blue-200 bg-gradient-to-br from-blue-50 via-cyan-50 to-violet-50 dark:border-blue-900 dark:from-slate-950 dark:via-blue-950/60 dark:to-violet-950/50">
        <div className="flex items-start gap-3 border-b border-blue-200/70 p-5 dark:border-blue-900">
          <span className="rounded-xl bg-blue-600 p-2.5 text-white shadow-lg shadow-blue-600/20"><BrainCircuit className="size-5" /></span>
          <div><h3 className="font-black text-slate-950 dark:text-white">Generar preguntas con IA</h3><p className="mt-1 text-sm text-slate-600 dark:text-slate-300">Elige un tipo, genera el contenido y revísalo en el mismo editor manual antes de guardarlo.</p></div>
        </div>
        <div className="grid gap-4 p-5 lg:grid-cols-[1fr_180px]">
          <label className="space-y-1 text-sm font-semibold lg:col-span-2">Tema, texto o instrucciones
            <Textarea value={aiPrompt} onChange={(event) => setAiPrompt(event.target.value)} placeholder="Ejemplo: Presente simple en inglés para segundo de secundaria, con situaciones de la vida cotidiana." className="min-h-24 bg-background" />
          </label>
          <fieldset className="space-y-2"><legend className="text-sm font-semibold">Tipo de reactivos</legend><div className="grid gap-2 sm:grid-cols-3">
            {([['multiple_choice', 'Opción múltiple'], ['true_false', 'Verdadero o falso'], ['mixed', 'Combinados']] as const).map(([value, label]) => <label key={value} className={`cursor-pointer rounded-xl border p-3 text-sm font-bold transition ${aiMode === value ? 'border-blue-600 bg-blue-600 text-white shadow-md' : 'bg-background hover:border-blue-400'}`}><input className="sr-only" type="radio" name="ai-question-mode" value={value} checked={aiMode === value} onChange={() => setAiMode(value)} />{label}</label>)}
          </div></fieldset>
          <label className="space-y-2 text-sm font-semibold">Cantidad de preguntas<Input type="number" min={1} max={40} value={aiCount} onChange={(event) => setAiCount(Math.max(1, Math.min(40, Number(event.target.value) || 1)))} className="bg-background" /></label>
          <label className="flex items-start gap-3 rounded-xl border bg-background p-4 text-sm lg:col-span-2"><input type="checkbox" className="mt-1 size-4 accent-blue-600" checked={shuffleGeneratedOptions} onChange={(event) => setShuffleGeneratedOptions(event.target.checked)} /><span><strong className="block">Mezclar incisos dentro de cada pregunta</strong><span className="text-muted-foreground">Reordena A, B, C y D de manera independiente y conserva la respuesta correcta. Nunca mezcla opciones entre preguntas diferentes.</span></span></label>
          <div className="lg:col-span-2"><Button type="button" onClick={generateWithAI} disabled={aiPending || aiPrompt.trim().length < 5} className="h-11 bg-blue-600 font-bold text-white hover:bg-blue-700">{aiPending ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}{aiPending ? 'Generando preguntas…' : 'Generar con IA'}</Button></div>
        </div>
      </div>
      <div className="mt-6 flex flex-wrap items-center justify-between gap-3"><div><h3 className="font-black">Editor manual</h3><p className="text-sm text-muted-foreground">Puedes escribir, corregir o cambiar el tipo de cada pregunta.</p></div><Button type="button" variant="outline" onClick={() => setQuestions((current) => shuffleEachQuestionOptions(current))}><Shuffle className="size-4" /> Mezclar todos los incisos</Button></div>
      <div className="mt-6 space-y-4">{questions.map((question, index) => <article key={index} className="rounded-2xl border bg-muted/20 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-bold">Pregunta {index + 1}</h3><div className="flex gap-1">{question.questionType === 'multiple_choice' && <Button type="button" size="sm" variant="ghost" onClick={() => updateQuestion(index, shuffleQuestionOptions(question))}><Shuffle className="size-4" /> Mezclar incisos</Button>}{questions.length > 1 && <Button type="button" size="sm" variant="ghost" onClick={() => setQuestions((items) => items.filter((_, i) => i !== index))}><Trash2 className="size-4"/> Quitar</Button>}</div></div>
        <label className="mt-3 block space-y-1 text-sm font-semibold">Tipo de pregunta<select className="h-10 w-full rounded-lg border bg-background px-3" value={question.questionType} onChange={(event) => {
          const questionType = event.target.value as ClassroomQuestionInput['questionType'];
          updateQuestion(index, questionType === 'true_false' ? { questionType, options: ['Verdadero', 'Falso'], correctIndex: 0 } : { questionType, options: ['', '', '', ''], correctIndex: 0 });
        }}><option value="multiple_choice">Opción múltiple</option><option value="true_false">Verdadero o falso</option></select></label>
        <Textarea className="mt-3" value={question.prompt} onChange={(event) => updateQuestion(index, { prompt: event.target.value })} placeholder="Escribe la pregunta" />
        <div className="mt-3 grid gap-3 sm:grid-cols-2">{question.options.map((option, optionIndex) => <label key={optionIndex} className={`flex items-center gap-2 rounded-xl border bg-background p-2 text-sm ${question.correctIndex === optionIndex ? 'border-emerald-500 ring-1 ring-emerald-500/30' : ''}`}><input type="radio" name={`correct-${index}`} checked={question.correctIndex === optionIndex} onChange={() => updateQuestion(index, { correctIndex: optionIndex })}/><span className="w-5 shrink-0 text-center font-black text-muted-foreground">{String.fromCharCode(65 + optionIndex)}</span><Input aria-label={`Opción ${optionIndex + 1}`} value={option} readOnly={question.questionType === 'true_false'} onChange={(event) => updateQuestion(index, { options: question.options.map((item, i) => i === optionIndex ? event.target.value : item) })}/></label>)}</div>
        <label className="mt-3 block space-y-1 text-sm font-semibold">Explicación para el profesor (opcional)<Textarea value={question.explanation || ''} onChange={(event) => updateQuestion(index, { explanation: event.target.value })} placeholder="Justificación de la respuesta correcta" /></label>
      </article>)}</div>
      <div className="mt-5 flex flex-wrap gap-3"><Button variant="outline" onClick={() => setQuestions((items) => [...items, emptyQuestion()])}><Plus className="size-4"/> Agregar pregunta</Button><Button disabled={pending || !subjectId || !title.trim()} onClick={save}><Save className="size-4"/> {pending ? 'Guardando…' : editingBankId ? 'Guardar cambios' : 'Guardar banco'}</Button></div>
      {message && <p role="status" className="mt-3 text-sm font-semibold text-primary">{message}</p>}
    </section>
    <section><h2 className="mb-3 text-xl font-black">Mis bancos</h2><div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{banks.map((bank: any) => <article key={bank.id} className={`rounded-2xl border bg-card p-5 transition ${editingBankId === bank.id ? 'border-blue-500 ring-2 ring-blue-500/20' : 'hover:border-primary/50 hover:shadow-md'}`}><p className="text-xs font-bold uppercase tracking-wider text-primary">{bank.unit_name || 'Sin unidad'} · {bank.topic_name || 'Tema general'}</p><h3 className="mt-2 text-lg font-black">{bank.title}</h3>{bank.description && <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">{bank.description}</p>}<p className="mt-3 text-sm text-muted-foreground">{bank.classroom_question_items?.length || 0} preguntas · Listo para jugar</p><div className="mt-4 flex flex-wrap gap-2"><Button type="button" size="sm" onClick={() => editBank(bank)}><Pencil className="size-4" /> Abrir y editar</Button><Button type="button" size="sm" variant="outline" className="text-destructive hover:text-destructive" onClick={() => setDeletingBank(bank)}><Trash2 className="size-4" /> Eliminar</Button></div></article>)}</div></section>
    <AlertDialog open={!!deletingBank} onOpenChange={(open) => { if (!open && !pending) setDeletingBank(null); }}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>¿Eliminar “{deletingBank?.title}”?</AlertDialogTitle><AlertDialogDescription>Se eliminarán sus preguntas si nunca fue utilizado. Si ya forma parte de una partida, se ocultará del banco para proteger el historial de los alumnos. Esta acción no se puede deshacer desde esta pantalla.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel disabled={pending}>Conservar banco</AlertDialogCancel><AlertDialogAction disabled={pending} onClick={(event) => { event.preventDefault(); removeBank(); }} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">{pending ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />} {pending ? 'Eliminando…' : 'Sí, eliminar'}</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
  </main>;
}
