'use client';

import { useMemo, useState, useTransition } from 'react';
import { BookOpenCheck, Plus, Save, Trash2 } from 'lucide-react';
import { saveClassroomBankAction, type ClassroomQuestionInput } from '@/lib/actions/classroom-games';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';

const emptyQuestion = (): ClassroomQuestionInput => ({
  prompt: '', questionType: 'multiple_choice', options: ['', '', '', ''], correctIndex: 0, explanation: '',
});

export function QuestionBankManager({ initialData }: { initialData: any }) {
  const [banks, setBanks] = useState(initialData.banks || []);
  const [subjectId, setSubjectId] = useState(initialData.assignments?.[0]?.materia_id || '');
  const [title, setTitle] = useState('');
  const [unitName, setUnitName] = useState('');
  const [topicName, setTopicName] = useState('');
  const [questions, setQuestions] = useState<ClassroomQuestionInput[]>([emptyQuestion()]);
  const [message, setMessage] = useState('');
  const [pending, startTransition] = useTransition();
  const subjects = useMemo(() => {
    const map = new Map<string, string>();
    for (const item of initialData.assignments || []) map.set(item.materia_id, item.materias?.nombre || 'Materia');
    return [...map.entries()];
  }, [initialData.assignments]);

  function updateQuestion(index: number, patch: Partial<ClassroomQuestionInput>) {
    setQuestions((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item));
  }

  function save() {
    setMessage('');
    startTransition(async () => {
      const result = await saveClassroomBankAction({ subjectId, title, unitName, topicName, questions });
      if (!result.ok) return setMessage(result.message);
      setBanks((current: any[]) => [{ id: result.data.id, title, unit_name: unitName, topic_name: topicName, classroom_question_items: questions }, ...current]);
      setTitle(''); setUnitName(''); setTopicName(''); setQuestions([emptyQuestion()]);
      setMessage('Banco guardado y listo para usar en una actividad de clase.');
    });
  }

  return <main className="mx-auto max-w-7xl space-y-6 pb-16">
    <header className="rounded-3xl bg-gradient-to-br from-slate-950 via-blue-950 to-cyan-800 p-7 text-white shadow-xl">
      <div className="flex items-center gap-3"><BookOpenCheck className="size-9 text-cyan-300"/><div><p className="text-xs font-bold uppercase tracking-[.22em] text-cyan-200">Práctica independiente</p><h1 className="text-3xl font-black">Banco de actividades</h1></div></div>
      <p className="mt-3 max-w-3xl text-sm text-blue-100">Crea preguntas reutilizables por materia, unidad y tema. Este banco no genera tareas, entregas ni calificaciones.</p>
    </header>
    <section className="rounded-3xl border bg-card p-6 shadow-sm">
      <h2 className="text-xl font-black">Nuevo banco</h2>
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <label className="space-y-1 text-sm font-semibold">Materia<select className="h-11 w-full rounded-lg border bg-background px-3" value={subjectId} onChange={(event) => setSubjectId(event.target.value)}>{subjects.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label>
        <label className="space-y-1 text-sm font-semibold">Nombre del banco<Input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Repaso de verbos irregulares"/></label>
        <label className="space-y-1 text-sm font-semibold">Unidad (opcional)<Input value={unitName} onChange={(event) => setUnitName(event.target.value)} /></label>
        <label className="space-y-1 text-sm font-semibold">Tema (opcional)<Input value={topicName} onChange={(event) => setTopicName(event.target.value)} /></label>
      </div>
      <div className="mt-6 space-y-4">{questions.map((question, index) => <article key={index} className="rounded-2xl border bg-muted/20 p-4">
        <div className="flex items-center justify-between"><h3 className="font-bold">Pregunta {index + 1}</h3>{questions.length > 1 && <Button size="sm" variant="ghost" onClick={() => setQuestions((items) => items.filter((_, i) => i !== index))}><Trash2 className="size-4"/> Quitar</Button>}</div>
        <label className="mt-3 block space-y-1 text-sm font-semibold">Tipo de pregunta<select className="h-10 w-full rounded-lg border bg-background px-3" value={question.questionType} onChange={(event) => {
          const questionType = event.target.value as ClassroomQuestionInput['questionType'];
          updateQuestion(index, questionType === 'true_false' ? { questionType, options: ['Verdadero', 'Falso'], correctIndex: 0 } : { questionType, options: ['', '', '', ''], correctIndex: 0 });
        }}><option value="multiple_choice">Opción múltiple</option><option value="true_false">Verdadero o falso</option></select></label>
        <Textarea className="mt-3" value={question.prompt} onChange={(event) => updateQuestion(index, { prompt: event.target.value })} placeholder="Escribe la pregunta" />
        <div className="mt-3 grid gap-3 sm:grid-cols-2">{question.options.map((option, optionIndex) => <label key={optionIndex} className="flex items-center gap-2 rounded-xl border bg-background p-2 text-sm"><input type="radio" name={`correct-${index}`} checked={question.correctIndex === optionIndex} onChange={() => updateQuestion(index, { correctIndex: optionIndex })}/><Input aria-label={`Opción ${optionIndex + 1}`} value={option} onChange={(event) => updateQuestion(index, { options: question.options.map((item, i) => i === optionIndex ? event.target.value : item) })}/></label>)}</div>
      </article>)}</div>
      <div className="mt-5 flex flex-wrap gap-3"><Button variant="outline" onClick={() => setQuestions((items) => [...items, emptyQuestion()])}><Plus className="size-4"/> Agregar pregunta</Button><Button disabled={pending || !subjectId || !title.trim()} onClick={save}><Save className="size-4"/> {pending ? 'Guardando…' : 'Guardar banco'}</Button></div>
      {message && <p role="status" className="mt-3 text-sm font-semibold text-primary">{message}</p>}
    </section>
    <section><h2 className="mb-3 text-xl font-black">Mis bancos</h2><div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{banks.map((bank: any) => <article key={bank.id} className="rounded-2xl border bg-card p-5"><p className="text-xs font-bold uppercase tracking-wider text-primary">{bank.unit_name || 'Sin unidad'} · {bank.topic_name || 'Tema general'}</p><h3 className="mt-2 text-lg font-black">{bank.title}</h3><p className="mt-3 text-sm text-muted-foreground">{bank.classroom_question_items?.length || 0} preguntas · Listo para jugar</p></article>)}</div></section>
  </main>;
}
