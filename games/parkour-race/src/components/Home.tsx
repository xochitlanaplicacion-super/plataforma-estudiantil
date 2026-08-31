import { useRef, useState } from "react";
import {
  BookOpenText,
  Cloud,
  Download,
  FolderOpen,
  GraduationCap,
  Mountain,
  Pencil,
  Play,
  Plus,
  Sparkles,
  Trash2,
  Upload,
} from "lucide-react";
import {
  buildDemoActivity,
  blankActivity,
  deleteActivity,
  loadActivities,
  randomSeed,
  upsertActivity,
  validateImported,
  Activity,
  fmtTime,
} from "../lib/core";
import { useStore } from "../store";
import { sfx } from "../game/sfx";

export default function Home() {
  const { startGame, setScreen } = useStore();
  const [activities, setActivities] = useState<Activity[]>(() => loadActivities());
  const [importError, setImportError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const playActivity = (a: Activity) => {
    sfx.ui();
    const seed = a.settings.seedMode === "unique" ? randomSeed() : parseInt(a.settings.fixedSeed) || randomSeed();
    startGame(a, seed);
  };

  const createNew = () => {
    sfx.ui();
    const a = blankActivity();
    upsertActivity(a);
    useStore.setState({ activity: a });
    setScreen("editor");
  };

  const playDemo = () => {
    sfx.ui();
    const demo = buildDemoActivity();
    startGame(demo, demo.settings.seedMode === "unique" ? randomSeed() : parseInt(demo.settings.fixedSeed));
  };

  const onImportFile = async (file: File) => {
    try {
      const text = await file.text();
      const obj = JSON.parse(text);
      const act = validateImported(obj);
      if (!act) {
        setImportError("El archivo no parece una actividad válida de Isla Saber.");
        return;
      }
      upsertActivity(act);
      setActivities(loadActivities());
      useStore.setState({ activity: act });
      setScreen("editor");
    } catch {
      setImportError("No se pudo leer el JSON de la actividad.");
    }
  };

  const exportActivity = (a: Activity) => {
    const blob = new Blob([JSON.stringify(a, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const el = document.createElement("a");
    el.href = url;
    el.download = `${a.title.replace(/[^a-z0-9]+/gi, "_").toLowerCase()}.json`;
    el.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="relative h-full w-full overflow-hidden bg-[#0B1026] text-white">
      {/* fondo */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -top-32 -left-32 h-[520px] w-[520px] rounded-full bg-[#4DD6C1]/15 blur-3xl" />
        <div className="absolute top-1/3 -right-40 h-[560px] w-[560px] rounded-full bg-[#8A7CFF]/15 blur-3xl" />
        <div className="absolute -bottom-48 left-1/3 h-[480px] w-[480px] rounded-full bg-[#FF6B8A]/12 blur-3xl" />
        <div className="anim-floaty absolute top-[16%] right-[14%] hidden opacity-70 lg:block">
          <Mountain size={84} className="text-[#4DD6C1]" strokeWidth={1.4} />
        </div>
        <div className="anim-floaty-soft absolute bottom-[18%] left-[9%] hidden opacity-60 lg:block" style={{ animationDelay: "1.2s" }}>
          <Cloud size={96} className="text-[#8A7CFF]" strokeWidth={1.2} />
        </div>
        <div className="anim-bob absolute top-[22%] left-[26%] hidden opacity-50 lg:block" style={{ animationDelay: "0.6s" }}>
          <Sparkles size={42} className="text-[#FFB84D]" />
        </div>
      </div>

      <div className="nice-scroll relative z-10 mx-auto flex h-full max-w-5xl flex-col items-center overflow-y-auto px-6 py-10">
        {/* logo */}
        <div className="anim-pop-in flex flex-col items-center text-center">
          <div className="mb-5 flex items-center gap-3 rounded-3xl border border-white/10 bg-white/5 px-6 py-3 shadow-2xl backdrop-blur-md">
            <span className="grid h-12 w-12 place-items-center rounded-2xl bg-gradient-to-br from-[#FF6B8A] to-[#8A7CFF] text-2xl shadow-lg">
              <GraduationCap size={26} className="text-white" />
            </span>
            <div className="text-left">
              <h1 className="font-display text-3xl font-extrabold tracking-tight md:text-4xl">
                ISLA SABER
              </h1>
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-[#7BE3D1]">
                Aventura educativa 3D
              </p>
            </div>
          </div>
          <p className="max-w-xl text-sm leading-relaxed text-slate-300 md:text-base">
            El profesor escribe las preguntas. El motor genera{" "}
            <span className="font-bold text-white">un mundo de parkour diferente en cada partida</span>,
            con la misma dificultad para todos los alumnos.
          </p>
        </div>

        {/* acciones principales */}
        <div className="anim-slide-up mt-8 grid w-full max-w-3xl grid-cols-1 gap-4 sm:grid-cols-2" style={{ animationDelay: "0.1s" }}>
          <button
            onClick={createNew}
            className="btn-candy group flex items-center gap-4 rounded-3xl bg-gradient-to-br from-[#FF6B8A] to-[#FF8A5C] p-5 text-left shadow-xl shadow-[#FF6B8A]/20"
          >
            <span className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-white/20">
              <Plus size={28} strokeWidth={2.6} />
            </span>
            <span>
              <span className="font-display block text-xl font-bold">Crear actividad</span>
              <span className="text-sm text-white/85">Editor del profesor · preguntas y mapa</span>
            </span>
          </button>

          <button
            onClick={playDemo}
            className="btn-candy group flex items-center gap-4 rounded-3xl bg-gradient-to-br from-[#4DD6C1] to-[#5DB9FF] p-5 text-left shadow-xl shadow-[#4DD6C1]/20"
          >
            <span className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-white/20">
              <Play size={28} strokeWidth={2.6} />
            </span>
            <span>
              <span className="font-display block text-xl font-bold">Jugar demo</span>
              <span className="text-sm text-white/85">English Vocabulary Adventure · 5 estaciones</span>
            </span>
          </button>

          <button
            onClick={() => fileRef.current?.click()}
            className="btn-candy flex items-center gap-4 rounded-3xl border border-white/15 bg-white/5 p-5 text-left backdrop-blur-sm transition hover:border-[#FFB84D]/50"
          >
            <span className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-white/10">
              <Upload size={26} strokeWidth={2.4} />
            </span>
            <span>
              <span className="font-display block text-lg font-bold">Importar actividad</span>
              <span className="text-sm text-slate-300">Carga un JSON compartido</span>
            </span>
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

          <div className="flex items-center gap-4 rounded-3xl border border-white/15 bg-white/5 p-5 backdrop-blur-sm">
            <span className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-white/10">
              <FolderOpen size={26} strokeWidth={2.2} />
            </span>
            <span>
              <span className="font-display block text-lg font-bold">Mis actividades</span>
              <span className="text-sm text-slate-300">
                {activities.length === 0 ? "Aún no hay actividades guardadas" : `${activities.length} guardada${activities.length > 1 ? "s" : ""} en este navegador`}
              </span>
            </span>
          </div>
        </div>

        {importError && (
          <div className="anim-fade-in mt-4 rounded-2xl border border-red-400/40 bg-red-500/15 px-5 py-3 text-sm text-red-200">
            {importError}
          </div>
        )}

        {/* lista de actividades */}
        {activities.length > 0 && (
          <div className="anim-fade-in mt-8 w-full max-w-3xl">
            <h2 className="font-display mb-3 flex items-center gap-2 text-lg font-bold text-slate-200">
              <BookOpenText size={18} className="text-[#7BE3D1]" /> Biblioteca de actividades
            </h2>
            <div className="space-y-3 pb-10">
              {activities.map((a) => (
                <div
                  key={a.id}
                  className="flex flex-wrap items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.04] px-5 py-4 backdrop-blur-sm transition hover:border-white/25"
                >
                  <span className="h-10 w-2.5 rounded-full" style={{ background: a.color }} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-bold">{a.title}</p>
                    <p className="text-xs text-slate-400">
                      {a.questions.length} preguntas · {a.settings.mapSize} · {a.settings.difficulty} · parkour {a.settings.parkour}
                      {a.createdAt ? ` · ${fmtTime(0)}` : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => playActivity(a)}
                      className="btn-candy grid h-10 w-10 place-items-center rounded-xl bg-emerald-500/90 text-white shadow-lg shadow-emerald-500/25"
                      title="Jugar"
                    >
                      <Play size={18} />
                    </button>
                    <button
                      onClick={() => {
                        useStore.setState({ activity: a });
                        setScreen("editor");
                      }}
                      className="btn-candy grid h-10 w-10 place-items-center rounded-xl bg-sky-500/90 text-white shadow-lg shadow-sky-500/25"
                      title="Editar"
                    >
                      <Pencil size={17} />
                    </button>
                    <button
                      onClick={() => exportActivity(a)}
                      className="btn-candy grid h-10 w-10 place-items-center rounded-xl bg-white/10 text-white"
                      title="Exportar JSON"
                    >
                      <Download size={17} />
                    </button>
                    <button
                      onClick={() => setActivities(deleteActivity(a.id))}
                      className="btn-candy grid h-10 w-10 place-items-center rounded-xl bg-white/10 text-red-300 hover:bg-red-500/30"
                      title="Eliminar"
                    >
                      <Trash2 size={17} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <p className="mt-auto pb-4 pt-8 text-center text-xs text-slate-500">
          Cada partida usa una <span className="font-semibold text-slate-300">seed determinística</span>: comparte el código de mapa
          para que dos alumnos recorran exactamente el mismo circuito.
        </p>
      </div>
    </div>
  );
}
