import { useMemo, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  Copy,
  Download,
  Eye,
  HelpCircle,
  Plus,
  Save,
  Trash2,
  Upload,
  Wand2,
} from "lucide-react";
import {
  Activity,
  COURSE_COLORS,
  Question,
  blankActivity,
  clamp,
  randomSeed,
  seedCode,
  uid,
  upsertActivity,
  validateImported,
} from "../lib/core";
import { useStore } from "../store";
import { sfx } from "../game/sfx";
import { cn } from "../utils/cn";

const LETTERS = ["A", "B", "C", "D"];

export default function Editor() {
  const storeActivity = useStore((s) => s.activity);
  const { setScreen, startGame } = useStore();
  const [a, setA] = useState<Activity>(() => storeActivity ?? blankActivity());
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const canGenerate = useMemo(
    () => a.title.trim().length > 0 && a.questions.length > 0 && a.questions.every((q) => q.prompt.trim() && q.answers.every((x) => String(x).trim())),
    [a]
  );

  const patch = (p: Partial<Activity>) => {
    setA((prev) => ({ ...prev, ...p }));
    setSaved(false);
  };
  const patchSettings = (p: Partial<Activity["settings"]>) => {
    setA((prev) => ({ ...prev, settings: { ...prev.settings, ...p } }));
    setSaved(false);
  };

  const updateQuestion = (id: string, p: Partial<Question>) => {
    setA((prev) => ({
      ...prev,
      questions: prev.questions.map((q) => (q.id === id ? { ...q, ...p } : q)),
    }));
    setSaved(false);
  };

  const addQuestion = () => {
    sfx.ui();
    setA((prev) => ({
      ...prev,
      questions: [
        ...prev.questions,
        { id: uid(), prompt: "", answers: ["", "", "", ""], correctIndex: 0 },
      ],
    }));
    setSaved(false);
  };

  const moveQuestion = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= a.questions.length) return;
    const qs = [...a.questions];
    [qs[i], qs[j]] = [qs[j], qs[i]];
    patch({ questions: qs });
  };

  const duplicateQuestion = (i: number) => {
    const qs = [...a.questions];
    const src = qs[i];
    qs.splice(i + 1, 0, { ...src, id: uid(), answers: [...src.answers] });
    patch({ questions: qs });
  };

  const deleteQuestion = (i: number) => {
    if (a.questions.length <= 1) return;
    patch({ questions: a.questions.filter((_, idx) => idx !== i) });
  };

  const save = (): Activity => {
    const clean = { ...a, questions: a.questions.map((q) => ({ ...q, answers: q.answers.slice(0, 4) })) };
    upsertActivity(clean);
    setSaved(true);
    setTimeout(() => setSaved(false), 2200);
    return clean;
  };

  const preview = () => {
    if (!canGenerate) {
      setError("Revisa el título y que todas las preguntas y respuestas estén completas.");
      return;
    }
    sfx.ui();
    const act = save();
    const seed =
      act.settings.seedMode === "unique"
        ? randomSeed()
        : parseInt(act.settings.fixedSeed.replace(/\D/g, "")) || randomSeed();
    startGame(act, seed);
  };

  const exportJson = () => {
    const blob = new Blob([JSON.stringify(a, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const el = document.createElement("a");
    el.href = url;
    el.download = `${a.title.replace(/[^a-z0-9]+/gi, "_").toLowerCase()}.json`;
    el.click();
    URL.revokeObjectURL(url);
  };

  const onImportFile = async (file: File) => {
    try {
      const act = validateImported(JSON.parse(await file.text()));
      if (act) setA(act);
      else setError("El archivo no es una actividad válida.");
    } catch {
      setError("No se pudo leer el archivo JSON.");
    }
  };

  return (
    <div className="relative h-full w-full overflow-hidden bg-[#0E1330] text-white">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -top-40 right-0 h-[460px] w-[460px] rounded-full bg-[#8A7CFF]/12 blur-3xl" />
        <div className="absolute bottom-0 -left-40 h-[420px] w-[420px] rounded-full bg-[#4DD6C1]/10 blur-3xl" />
      </div>

      {/* header */}
      <header className="relative z-10 flex flex-wrap items-center gap-3 border-b border-white/10 bg-[#0B1026]/80 px-5 py-3 backdrop-blur-md">
        <button
          onClick={() => setScreen("home")}
          className="btn-candy flex items-center gap-2 rounded-xl bg-white/10 px-3 py-2 text-sm font-bold"
        >
          <ArrowLeft size={16} /> Inicio
        </button>
        <h1 className="font-display text-lg font-extrabold tracking-tight">Editor del profesor</h1>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <button onClick={() => fileRef.current?.click()} className="btn-candy flex items-center gap-2 rounded-xl bg-white/10 px-3 py-2 text-sm font-bold">
            <Upload size={15} /> Importar
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onImportFile(f);
              e.target.value = "";
            }}
          />
          <button onClick={exportJson} className="btn-candy flex items-center gap-2 rounded-xl bg-white/10 px-3 py-2 text-sm font-bold">
            <Download size={15} /> Exportar
          </button>
          <button
            onClick={() => save()}
            className={cn(
              "btn-candy flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-bold shadow-lg",
              saved ? "bg-emerald-500 text-white" : "bg-white/10"
            )}
          >
            <Save size={15} /> {saved ? "¡Guardado!" : "Guardar"}
          </button>
          <button
            onClick={preview}
            className={cn(
              "btn-candy flex items-center gap-2 rounded-xl bg-gradient-to-r from-[#4DD6C1] to-[#5DB9FF] px-5 py-2 text-sm font-extrabold text-[#06281F] shadow-xl shadow-[#4DD6C1]/25",
              !canGenerate && "opacity-50"
            )}
          >
            <Eye size={16} /> Generar vista previa
          </button>
        </div>
      </header>

      {error && (
        <div className="anim-fade-in relative z-10 mx-5 mt-3 rounded-xl border border-red-400/40 bg-red-500/15 px-4 py-2 text-sm text-red-200">
          {error}
        </div>
      )}

      <div className="nice-scroll relative z-10 mx-auto grid h-[calc(100%-64px)] max-w-6xl grid-cols-1 gap-6 overflow-y-auto px-5 py-6 lg:grid-cols-[1.5fr_1fr]">
        {/* -------- columna principal -------- */}
        <div className="space-y-5 pb-16">
          {/* datos básicos */}
          <section className="rounded-3xl border border-white/10 bg-white/[0.04] p-5 backdrop-blur-sm">
            <div className="grid gap-4">
              <label className="block">
                <span className="mb-1 block text-xs font-extrabold uppercase tracking-widest text-slate-400">Título de la actividad</span>
                <input
                  value={a.title}
                  onChange={(e) => patch({ title: e.target.value })}
                  className="w-full rounded-xl border border-white/10 bg-[#0B1026] px-4 py-3 font-display text-lg font-bold outline-none transition focus:border-[#4DD6C1]"
                  placeholder="Ej. English Vocabulary Adventure"
                />
              </label>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block">
                  <span className="mb-1 block text-xs font-extrabold uppercase tracking-widest text-slate-400">Asignatura</span>
                  <input
                    value={a.subject}
                    onChange={(e) => patch({ subject: e.target.value })}
                    className="w-full rounded-xl border border-white/10 bg-[#0B1026] px-4 py-2.5 outline-none transition focus:border-[#4DD6C1]"
                    placeholder="Inglés · Matemáticas · Historia…"
                  />
                </label>
                <div>
                  <span className="mb-1 block text-xs font-extrabold uppercase tracking-widest text-slate-400">Color de la isla</span>
                  <div className="flex items-center gap-2">
                    {COURSE_COLORS.map((c) => (
                      <button
                        key={c}
                        onClick={() => patch({ color: c })}
                        className={cn("h-8 w-8 rounded-full transition", a.color === c && "ring-2 ring-white ring-offset-2 ring-offset-[#0E1330]")}
                        style={{ background: c }}
                      />
                    ))}
                  </div>
                </div>
              </div>
              <label className="block">
                <span className="mb-1 block text-xs font-extrabold uppercase tracking-widest text-slate-400">Instrucciones para el alumno</span>
                <textarea
                  value={a.instructions}
                  onChange={(e) => patch({ instructions: e.target.value })}
                  rows={2}
                  className="nice-scroll w-full resize-none rounded-xl border border-white/10 bg-[#0B1026] px-4 py-2.5 text-sm outline-none transition focus:border-[#4DD6C1]"
                  placeholder="Supera el parkour, responde en cada estación y llega al portal final."
                />
              </label>
            </div>
          </section>

          {/* preguntas */}
          <div className="flex items-center justify-between">
            <h2 className="font-display flex items-center gap-2 text-xl font-bold">
              <HelpCircle size={20} className="text-[#FFB84D]" /> Banco de preguntas
              <span className="rounded-full bg-white/10 px-2.5 py-0.5 text-xs font-bold text-slate-300">{a.questions.length}</span>
            </h2>
            <button
              onClick={addQuestion}
              className="btn-candy flex items-center gap-2 rounded-xl bg-gradient-to-r from-[#FF6B8A] to-[#FFB84D] px-4 py-2 text-sm font-extrabold text-[#33101B] shadow-lg shadow-[#FF6B8A]/25"
            >
              <Plus size={16} /> Añadir pregunta
            </button>
          </div>

          {a.questions.map((q, i) => (
            <section
              key={q.id}
              className="rounded-3xl border border-white/10 bg-white/[0.04] p-5 backdrop-blur-sm transition hover:border-white/20"
            >
              <div className="mb-3 flex items-center gap-2">
                <span className="font-display grid h-8 w-8 place-items-center rounded-xl bg-gradient-to-br from-[#8A7CFF] to-[#5DB9FF] text-sm font-extrabold">
                  {i + 1}
                </span>
                <div className="ml-auto flex items-center gap-1">
                  <IconBtn title="Subir" onClick={() => moveQuestion(i, -1)} disabled={i === 0}><ArrowUp size={15} /></IconBtn>
                  <IconBtn title="Bajar" onClick={() => moveQuestion(i, 1)} disabled={i === a.questions.length - 1}><ArrowDown size={15} /></IconBtn>
                  <IconBtn title="Duplicar" onClick={() => duplicateQuestion(i)}><Copy size={15} /></IconBtn>
                  <IconBtn title="Eliminar" danger onClick={() => deleteQuestion(i)} disabled={a.questions.length <= 1}><Trash2 size={15} /></IconBtn>
                </div>
              </div>
              <input
                value={q.prompt}
                onChange={(e) => updateQuestion(q.id, { prompt: e.target.value })}
                className="mb-3 w-full rounded-xl border border-white/10 bg-[#0B1026] px-4 py-2.5 font-semibold outline-none transition focus:border-[#8A7CFF]"
                placeholder="Escribe la pregunta…"
              />
              <div className="grid gap-2 sm:grid-cols-2">
                {q.answers.map((ans, ai) => (
                  <label
                    key={ai}
                    className={cn(
                      "flex items-center gap-2 rounded-xl border px-3 py-2 transition",
                      q.correctIndex === ai
                        ? "border-emerald-400/60 bg-emerald-500/10"
                        : "border-white/10 bg-[#0B1026]"
                    )}
                  >
                    <input
                      type="radio"
                      name={`correct-${q.id}`}
                      checked={q.correctIndex === ai}
                      onChange={() => updateQuestion(q.id, { correctIndex: ai })}
                      className="accent-emerald-400"
                      title="Marcar como correcta"
                    />
                    <span className={cn("font-display w-6 text-center font-extrabold", q.correctIndex === ai ? "text-emerald-300" : "text-slate-500")}>
                      {LETTERS[ai]}
                    </span>
                    <input
                      value={ans}
                      onChange={(e) => {
                        const answers = [...q.answers];
                        answers[ai] = e.target.value;
                        updateQuestion(q.id, { answers });
                      }}
                      className="w-full bg-transparent text-sm outline-none"
                      placeholder={`Respuesta ${LETTERS[ai]}`}
                    />
                  </label>
                ))}
              </div>
              <p className="mt-2 text-[11px] text-slate-500">El círculo marca la respuesta correcta.</p>
              <label className="mt-3 block">
                <span className="mb-1 block text-[11px] font-bold text-slate-400">Retroalimentación / justificación</span>
                <textarea
                  value={q.feedback || ""}
                  onChange={(e) => updateQuestion(q.id, { feedback: e.target.value })}
                  rows={2}
                  className="nice-scroll w-full resize-none rounded-xl border border-white/10 bg-[#0B1026] px-4 py-2.5 text-sm outline-none transition focus:border-[#4DD6C1]"
                  placeholder="Explica por qué la respuesta correcta es correcta…"
                />
              </label>
            </section>
          ))}
        </div>

        {/* -------- columna de configuración -------- */}
        <div className="space-y-5 pb-16">
          <section className="rounded-3xl border border-white/10 bg-white/[0.04] p-5 backdrop-blur-sm">
            <h3 className="font-display mb-4 flex items-center gap-2 text-lg font-bold">
              <Wand2 size={18} className="text-[#4DD6C1]" /> Configuración del mapa
            </h3>

            <Field label="Tamaño del mapa">
              <Segmented
                value={a.settings.mapSize}
                onChange={(v) => patchSettings({ mapSize: v as Activity["settings"]["mapSize"] })}
                options={[
                  { value: "small", label: "Pequeño" },
                  { value: "medium", label: "Mediano" },
                  { value: "large", label: "Grande" },
                  { value: "custom", label: "Custom" },
                ]}
              />
              {a.settings.mapSize === "custom" && (
                <div className="mt-3">
                  <span className="mb-1 block text-[11px] font-bold text-slate-400">Nº de estaciones (1–20)</span>
                  <input
                    type="number"
                    min={1}
                    max={20}
                    value={a.settings.customStations}
                    onChange={(e) => patchSettings({ customStations: clamp(parseInt(e.target.value) || 1, 1, 20) })}
                    className="w-full rounded-xl border border-white/10 bg-[#0B1026] px-4 py-2 outline-none focus:border-[#4DD6C1]"
                  />
                </div>
              )}
              <p className="mt-2 text-[11px] leading-snug text-slate-500">
                Pequeño 3–5 · Mediano 5–7 · Grande 10–13 estaciones (limitado al nº de preguntas).
              </p>
            </Field>

            <Field label="Dificultad">
              <Segmented
                value={a.settings.difficulty}
                onChange={(v) => patchSettings({ difficulty: v as Activity["settings"]["difficulty"] })}
                options={[
                  { value: "easy", label: "Fácil" },
                  { value: "normal", label: "Normal" },
                  { value: "hard", label: "Difícil" },
                ]}
              />
              <p className="mt-2 text-[11px] leading-snug text-slate-500">
                Fácil usa ~60% de la capacidad de salto · Normal ~75% · Difícil ~90%. Nunca el 100%.
              </p>
            </Field>

            <Field label="Intensidad de parkour">
              <Segmented
                value={a.settings.parkour}
                onChange={(v) => patchSettings({ parkour: v as Activity["settings"]["parkour"] })}
                options={[
                  { value: "low", label: "Baja" },
                  { value: "medium", label: "Media" },
                  { value: "high", label: "Alta" },
                ]}
              />
            </Field>

            <Field label="Modo de seed">
              <Segmented
                value={a.settings.seedMode}
                onChange={(v) => patchSettings({ seedMode: v as Activity["settings"]["seedMode"] })}
                options={[
                  { value: "unique", label: "Único" },
                  { value: "fixed", label: "Fijo" },
                  { value: "manual", label: "Manual" },
                ]}
              />
              <p className="mt-2 text-[11px] leading-snug text-slate-500">
                Único: cada alumno recibe un mapa distinto · Fijo: todos el mismo · Manual: reutiliza un código conocido.
              </p>
              {a.settings.seedMode !== "unique" && (
                <div className="mt-3 flex items-center gap-2">
                  <input
                    value={a.settings.fixedSeed}
                    onChange={(e) => patchSettings({ fixedSeed: e.target.value.replace(/\D/g, "").slice(0, 8) })}
                    className="w-full rounded-xl border border-white/10 bg-[#0B1026] px-4 py-2 font-mono tracking-[0.3em] outline-none focus:border-[#4DD6C1]"
                    placeholder="38172914"
                  />
                  <button
                    onClick={() => patchSettings({ fixedSeed: seedCode(randomSeed()) })}
                    className="btn-candy shrink-0 rounded-xl bg-white/10 px-3 py-2 text-xs font-bold"
                  >
                    Aleatorio
                  </button>
                </div>
              )}
            </Field>

            <Field label="Retroalimentación explicada">
              <Segmented
                value={a.settings.showFeedback ? "on" : "off"}
                onChange={(v) => patchSettings({ showFeedback: v === "on" })}
                options={[
                  { value: "on", label: "Mostrar" },
                  { value: "off", label: "Ocultar" },
                ]}
              />
              <p className="mt-2 text-[11px] leading-snug text-slate-500">
                Si está activa, cada respuesta mostrará la justificación antes de continuar.
              </p>
            </Field>
          </section>

          <section className="rounded-3xl border border-[#4DD6C1]/25 bg-gradient-to-br from-[#4DD6C1]/10 to-transparent p-5">
            <h3 className="font-display mb-2 text-base font-bold text-[#7BE3D1]">Así funciona</h3>
            <ul className="space-y-1.5 text-[13px] leading-snug text-slate-300">
              <li>· El motor conecta módulos de parkour como piezas de un grafo: inicio → retos → estación → portal bloqueado.</li>
              <li>· Cada estación se desbloquea respondiendo; no se pueden saltar preguntas.</li>
              <li>· Misma seed = mismo mapa. Ideal para reintentos o partidas espejo.</li>
              <li>· Todos los saltos respetan una envolvente segura: nada es imposible.</li>
            </ul>
            <button
              onClick={preview}
              className={cn(
                "btn-candy mt-4 flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-[#4DD6C1] to-[#5DB9FF] px-5 py-3 font-display text-base font-extrabold text-[#06281F] shadow-xl shadow-[#4DD6C1]/25",
                !canGenerate && "opacity-50"
              )}
            >
              <Eye size={18} /> Generar vista previa
            </button>
          </section>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-5">
      <span className="mb-2 block text-xs font-extrabold uppercase tracking-widest text-slate-400">{label}</span>
      {children}
    </div>
  );
}

function Segmented({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div className="grid grid-flow-col gap-1 rounded-2xl border border-white/10 bg-[#0B1026] p-1 auto-cols-fr">
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            "btn-candy rounded-xl px-2 py-2 text-xs font-extrabold transition",
            value === o.value ? "bg-gradient-to-r from-[#8A7CFF] to-[#5DB9FF] text-white shadow-lg" : "text-slate-400 hover:text-white"
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function IconBtn({
  children,
  onClick,
  title,
  danger,
  disabled,
}: {
  children: React.ReactNode;
  onClick: () => void;
  title: string;
  danger?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      disabled={disabled}
      className={cn(
        "btn-candy grid h-8 w-8 place-items-center rounded-lg bg-white/10 text-slate-300 disabled:opacity-30",
        danger && "text-red-300 hover:bg-red-500/25"
      )}
    >
      {children}
    </button>
  );
}
