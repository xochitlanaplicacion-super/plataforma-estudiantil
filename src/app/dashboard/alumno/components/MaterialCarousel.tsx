"use client";

import React, { useRef, useState, useCallback, useEffect } from 'react';
import { useGSAP } from '@gsap/react';
import gsap from 'gsap';
import {
  FileText,
  FileSpreadsheet,
  File,
  Presentation,
  Download,
  ChevronLeft,
  ChevronRight,
  BookOpen,
  Loader2,
  Eye,
  ChevronDown,
} from 'lucide-react';
import { generateSignedUrl, generateSignedUrlPreview } from '@/lib/actions/material';

// Register GSAP plugin (required for @gsap/react)
gsap.registerPlugin(useGSAP);

interface MaterialItem {
  id: string;
  titulo: string;
  categoria: string;
  descripcion: string | null;
  archivo_url: string;
  tipo_archivo: string;
  tamano_bytes: number;
  created_at: string;
}

interface Props {
  materiales: MaterialItem[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const getFileGradient = (tipo: string) => {
  switch (tipo) {
    case 'pdf':        return 'from-red-50 to-red-100/60 border-red-200/40';
    case 'word':       return 'from-blue-50 to-blue-100/60 border-blue-200/40';
    case 'excel':      return 'from-emerald-50 to-emerald-100/60 border-emerald-200/40';
    case 'powerpoint': return 'from-orange-50 to-orange-100/60 border-orange-200/40';
    default:           return 'from-gray-50 to-gray-100/60 border-gray-200/40';
  }
};

const getFileIconColor = (tipo: string) => {
  switch (tipo) {
    case 'pdf':        return 'text-red-500';
    case 'word':       return 'text-blue-500';
    case 'excel':      return 'text-emerald-500';
    case 'powerpoint': return 'text-orange-500';
    default:           return 'text-gray-400';
  }
};

const getFileBadge = (tipo: string) => {
  switch (tipo) {
    case 'pdf':        return 'bg-red-100 text-red-700';
    case 'word':       return 'bg-blue-100 text-blue-700';
    case 'excel':      return 'bg-emerald-100 text-emerald-700';
    case 'powerpoint': return 'bg-orange-100 text-orange-700';
    default:           return 'bg-gray-100 text-gray-600';
  }
};

const getFileIcon = (tipo: string, size = 'w-12 h-12') => {
  const cls = `${size} ${getFileIconColor(tipo)}`;
  switch (tipo) {
    case 'pdf':        return <FileText className={cls} />;
    case 'word':       return <File className={cls} />;
    case 'excel':      return <FileSpreadsheet className={cls} />;
    case 'powerpoint': return <Presentation className={cls} />;
    default:           return <FileText className={cls} />;
  }
};

const formatSize = (bytes: number) => {
  if (bytes < 1024)    return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
};

/** Removes leading timestamp prefix (e.g. "1777170543102_") from filename */
const stripTimestamp = (name: string) => name.replace(/^\d+_/, '');

/** Removes file extension for display */
const stripExtension = (name: string) => name.replace(/\.[^/.]+$/, '');

// ─── PDF Thumbnail ─────────────────────────────────────────────────────────────

function PdfThumbnail({ archivoUrl }: { archivoUrl: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [loaded, setLoaded]   = useState(false);
  const [failed, setFailed]   = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function render() {
      try {
        // 1. Use same-origin proxy to bypass CORS restrictions
        const proxyUrl = `/api/pdf-thumbnail?path=${encodeURIComponent(archivoUrl)}`;

        // 2. Dynamically import pdfjs-dist (client-only)
        const pdfjsLib = await import('pdfjs-dist');
        pdfjsLib.GlobalWorkerOptions.workerSrc =
          `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;

        // 3. Load PDF via proxy with range-request support
        //    pdfjs will send Range headers → only downloads the bytes it needs
        const pdf = await pdfjsLib.getDocument({
          url: proxyUrl,
          disableStream: false,       // enable streaming (range requests)
          disableAutoFetch: false,    // allow pdfjs to auto-fetch needed chunks
          rangeChunkSize: 65536,      // 64 KB chunks (good balance speed/overhead)
          isEvalSupported: false,     // slightly faster, no eval() required
        }).promise;
        if (cancelled) return;

        // 4. Render page 1
        const page     = await pdf.getPage(1);
        const viewport = page.getViewport({ scale: 1 });
        const scale    = 280 / viewport.width;
        const scaled   = page.getViewport({ scale });

        const canvas = canvasRef.current;
        if (!canvas || cancelled) return;
        canvas.width  = scaled.width;
        canvas.height = scaled.height;

        const ctx = canvas.getContext('2d');
        if (!ctx) { setFailed(true); return; }

        await page.render({ canvasContext: ctx, viewport: scaled }).promise;
        if (!cancelled) setLoaded(true);
      } catch (err) {
        console.error('PDF thumbnail render error:', err);
        if (!cancelled) setFailed(true);
      }
    }

    render();
    return () => { cancelled = true; };
  }, [archivoUrl]);

  if (failed) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-red-50 to-red-100 gap-2">
        <FileText className="w-14 h-14 text-red-300" />
        <span className="text-[10px] text-red-400 font-semibold uppercase tracking-wider">PDF</span>
      </div>
    );
  }

  return (
    <div className="relative w-full h-full">
      {!loaded && (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-50">
          <Loader2 className="w-8 h-8 text-gray-300 animate-spin" />
        </div>
      )}
      <canvas
        ref={canvasRef}
        className={`w-full h-full transition-opacity duration-500 ${loaded ? 'opacity-100' : 'opacity-0'}`}
        style={{ objectFit: 'cover' }}
      />
    </div>
  );
}

// ─── Main Carousel Component ────────────────────────────────────────────────────

export default function MaterialCarousel({ materiales }: Props) {
  const containerRef  = useRef<HTMLDivElement>(null);
  const scrollRef     = useRef<HTMLDivElement>(null);

  const [categoriaActiva, setCategoriaActiva] = useState('');
  const [dropdownOpen, setDropdownOpen]       = useState(false);
  const [downloading, setDownloading]         = useState<string | null>(null);

  // ── Derived data ──
  const categorias = React.useMemo(() => {
    const map = new Map<string, MaterialItem[]>();
    materiales.forEach(m => {
      const list = map.get(m.categoria) ?? [];
      list.push(m);
      map.set(m.categoria, list);
    });
    return map;
  }, [materiales]);

  const categoriasArray     = React.useMemo(() => Array.from(categorias.keys()), [categorias]);
  const materialesFiltrados = categorias.get(categoriaActiva) ?? [];

  // Set default category on first render
  useEffect(() => {
    if (categoriasArray.length > 0 && !categoriaActiva) {
      setCategoriaActiva(categoriasArray[0]);
    }
  }, [categoriasArray, categoriaActiva]);

  // ── GSAP stagger entrance (runs when category changes) ──
  useGSAP(() => {
    if (materialesFiltrados.length === 0) return;
    gsap.fromTo('.mc-card', 
      { y: 40, opacity: 0, scale: 0.93 },
      { y: 0, opacity: 1, scale: 1, duration: 0.45, stagger: 0.07, ease: 'power2.out', clearProps: 'transform' }
    );
  }, { scope: containerRef, dependencies: [categoriaActiva] });

  // ── GSAP hover (contextSafe via regular callbacks) ──
  const onCardEnter = useCallback((el: HTMLDivElement) => {
    gsap.to(el, { y: -8, scale: 1.03, boxShadow: '0 20px 40px rgba(0,0,0,0.13)', duration: 0.28, ease: 'power2.out' });
  }, []);

  const onCardLeave = useCallback((el: HTMLDivElement) => {
    gsap.to(el, { y: 0, scale: 1, boxShadow: '0 4px 14px rgba(0,0,0,0.06)', duration: 0.28, ease: 'power2.out' });
  }, []);

  // ── Smooth scroll arrows with GSAP ──
  const scroll = useCallback((dir: 'left' | 'right') => {
    if (!scrollRef.current) return;
    const amount = 300;
    gsap.to(scrollRef.current, {
      scrollLeft: scrollRef.current.scrollLeft + (dir === 'left' ? -amount : amount),
      duration: 0.5,
      ease: 'power2.inOut',
    });
  }, []);

  // ── Download (with clean filename) ──
  const handleDownload = useCallback(async (item: MaterialItem) => {
    setDownloading(item.id);
    try {
      const cleanName = stripTimestamp(item.titulo);
      const result = await generateSignedUrl(item.archivo_url, cleanName);
      if (result.success && result.signedUrl) {
        const a = document.createElement('a');
        a.href = result.signedUrl;
        a.download = cleanName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      }
    } finally {
      setDownloading(null);
    }
  }, []);

  // ── Preview (open in new tab) ──
  const handlePreview = useCallback(async (item: MaterialItem) => {
    const result = await generateSignedUrlPreview(item.archivo_url);
    if (result.success && result.signedUrl) window.open(result.signedUrl, '_blank');
  }, []);

  if (materiales.length === 0) return null;

  return (
    <section ref={containerRef} className="space-y-5">
      
      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div>
          <h4 className="text-xl md:text-2xl font-bold font-headline text-primary tracking-tight flex items-center gap-2">
            <BookOpen className="w-6 h-6 text-[#CEA62C]" />
            Material de Apoyo
          </h4>
          <p className="text-sm text-muted-foreground font-medium mt-0.5">
            Documentos y guías oficiales del Instituto
          </p>
        </div>

        {/* ── Folder Selector: always visible ── */}
        <div className="relative flex-shrink-0">
          {categoriasArray.length <= 1 ? (
            /* Single folder → static badge */
            <div className="flex items-center gap-2 px-4 py-2.5 bg-white border border-gray-200 rounded-xl shadow-sm text-sm font-semibold text-gray-700 min-w-[200px]">
              <span className="w-2 h-2 rounded-full bg-[#CEA62C] flex-shrink-0" />
              <span className="truncate max-w-[180px]">{categoriaActiva || 'Sin categoría'}</span>
            </div>
          ) : (
            /* Multiple folders → dropdown */
            <>
              <button
                onClick={() => setDropdownOpen(o => !o)}
                className="flex items-center gap-2 px-4 py-2.5 bg-white border border-gray-200 rounded-xl shadow-sm hover:shadow-md transition-all text-sm font-semibold text-gray-700 min-w-[200px] justify-between"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span className="w-2 h-2 rounded-full bg-[#CEA62C] flex-shrink-0" />
                  <span className="truncate max-w-[160px]">{categoriaActiva}</span>
                </div>
                <ChevronDown className={`w-4 h-4 flex-shrink-0 transition-transform duration-200 ${dropdownOpen ? 'rotate-180' : ''}`} />
              </button>

              {dropdownOpen && (
                <>
                  {/* Backdrop */}
                  <div className="fixed inset-0 z-40" onClick={() => setDropdownOpen(false)} />
                  {/* Menu */}
                  <div className="absolute right-0 mt-2 w-full min-w-[240px] bg-white border border-gray-100 rounded-xl shadow-xl z-50 py-1.5 max-h-72 overflow-y-auto">
                    {categoriasArray.map((cat, i) => (
                      <button
                        key={cat}
                        onClick={() => { setCategoriaActiva(cat); setDropdownOpen(false); }}
                        className={`w-full text-left px-4 py-3 text-sm transition-colors flex items-center gap-3 ${
                          cat === categoriaActiva
                            ? 'bg-primary/5 text-primary font-bold'
                            : 'text-gray-700 hover:bg-gray-50 font-medium'
                        }`}
                      >
                        <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0 ${
                          cat === categoriaActiva ? 'bg-primary text-white' : 'bg-gray-100 text-gray-500'
                        }`}>
                          {i + 1}
                        </span>
                        <span className="truncate">{cat}</span>
                        <span className="ml-auto text-[10px] text-gray-400 font-medium flex-shrink-0">
                          {categorias.get(cat)?.length ?? 0} doc{(categorias.get(cat)?.length ?? 0) !== 1 ? 's' : ''}
                        </span>
                      </button>
                    ))}
                  </div>
                </>
              )}
            </>
          )}
        </div>
      </div>

      {/* ── Carousel ── */}
      <div className="relative group/track">

        {/* Left arrow */}
        <button
          onClick={() => scroll('left')}
          aria-label="Anterior"
          className="absolute -left-4 top-1/2 -translate-y-1/2 z-20 w-10 h-10 bg-white/95 backdrop-blur-sm border border-gray-200 rounded-full shadow-lg flex items-center justify-center opacity-0 group-hover/track:opacity-100 transition-opacity duration-200 hover:bg-gray-50 hover:scale-110"
        >
          <ChevronLeft className="w-5 h-5 text-gray-600" />
        </button>

        {/* Right arrow */}
        <button
          onClick={() => scroll('right')}
          aria-label="Siguiente"
          className="absolute -right-4 top-1/2 -translate-y-1/2 z-20 w-10 h-10 bg-white/95 backdrop-blur-sm border border-gray-200 rounded-full shadow-lg flex items-center justify-center opacity-0 group-hover/track:opacity-100 transition-opacity duration-200 hover:bg-gray-50 hover:scale-110"
        >
          <ChevronRight className="w-5 h-5 text-gray-600" />
        </button>

        {/* Left fade edge */}
        <div className="absolute left-0 top-0 w-10 h-full bg-gradient-to-r from-white/80 to-transparent pointer-events-none z-10" />
        {/* Right fade edge */}
        <div className="absolute right-0 top-0 w-10 h-full bg-gradient-to-l from-white/80 to-transparent pointer-events-none z-10" />

        {/* Scrollable track — hide scrollbar cross-browser via inline styles */}
        <div
          ref={scrollRef}
          className="flex gap-5 overflow-x-auto pb-4 pt-1 px-2"
          style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' } as React.CSSProperties}
        >
          {materialesFiltrados.map((item) => (
            <div
              key={item.id}
              className="mc-card flex-shrink-0 w-[230px] md:w-[250px] bg-white rounded-2xl border border-gray-100 overflow-hidden cursor-pointer group/card select-none"
              style={{ boxShadow: '0 4px 14px rgba(0,0,0,0.06)' }}
              onMouseEnter={e => onCardEnter(e.currentTarget)}
              onMouseLeave={e => onCardLeave(e.currentTarget)}
            >
              {/* ── Cover / Thumbnail ── */}
              <div className="relative w-full h-[170px] overflow-hidden bg-gray-50">

                {item.tipo_archivo === 'pdf' ? (
                  <PdfThumbnail archivoUrl={item.archivo_url} />
                ) : (
                  <div className={`w-full h-full flex flex-col items-center justify-center bg-gradient-to-br ${getFileGradient(item.tipo_archivo)}`}>
                    {getFileIcon(item.tipo_archivo)}
                  </div>
                )}

                {/* Hover overlay with action buttons */}
                <div className="absolute inset-0 bg-black/0 group-hover/card:bg-black/35 flex items-center justify-center gap-3 transition-all duration-300 opacity-0 group-hover/card:opacity-100">
                  <button
                    onClick={e => { e.stopPropagation(); handlePreview(item); }}
                    title="Vista previa"
                    className="w-11 h-11 bg-white/90 backdrop-blur-sm rounded-full flex items-center justify-center shadow-lg hover:bg-white hover:scale-110 transition-all"
                  >
                    <Eye className="w-4 h-4 text-gray-700" />
                  </button>
                  <button
                    onClick={e => { e.stopPropagation(); handleDownload(item); }}
                    title="Descargar"
                    disabled={downloading === item.id}
                    className="w-11 h-11 bg-white/90 backdrop-blur-sm rounded-full flex items-center justify-center shadow-lg hover:bg-white hover:scale-110 transition-all disabled:opacity-50"
                  >
                    {downloading === item.id
                      ? <Loader2 className="w-4 h-4 text-gray-500 animate-spin" />
                      : <Download className="w-4 h-4 text-gray-700" />}
                  </button>
                </div>

                {/* Type badge (top-right) */}
                <span className={`absolute top-2 right-2 text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md ${getFileBadge(item.tipo_archivo)}`}>
                  {item.tipo_archivo}
                </span>
              </div>

              {/* ── Card Body ── */}
              <div className="p-4 space-y-2.5">
                <h5
                  className="text-sm font-bold text-gray-800 leading-snug line-clamp-2 min-h-[40px]"
                  title={stripTimestamp(item.titulo)}
                >
                  {stripExtension(stripTimestamp(item.titulo))}
                </h5>

                <div className="flex items-center justify-between pt-0.5">
                  <span className="text-[11px] text-gray-400 font-medium">
                    {formatSize(item.tamano_bytes)}
                  </span>
                  <button
                    onClick={() => handleDownload(item)}
                    disabled={downloading === item.id}
                    className="flex items-center gap-1 text-[11px] font-bold text-primary hover:text-primary/70 transition-colors disabled:opacity-50"
                  >
                    {downloading === item.id
                      ? <Loader2 className="w-3 h-3 animate-spin" />
                      : <Download className="w-3 h-3" />}
                    Descargar
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Cross-browser scrollbar hide */}
      <style>{`
        .mc-scroll::-webkit-scrollbar { display: none; }
      `}</style>
    </section>
  );
}
