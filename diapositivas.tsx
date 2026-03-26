import React, { useState, useEffect, useCallback } from 'react';
import { Play, Plus, Trash2, Edit2, X, ChevronLeft, ChevronRight, Image as ImageIcon, Presentation } from 'lucide-react';

type Slide = {
  id: string;
  title: string;
  content: string;
  imageUrl: string;
};

const defaultUniversitySlides: Slide[] = [
  {
    id: '1',
    title: 'Física: Introducción a la Mecánica Cuántica',
    content: 'La mecánica cuántica es la rama de la física que estudia la naturaleza a escalas espaciales pequeñas. En este tema, exploraremos la dualidad onda-partícula, el principio de incertidumbre de Heisenberg y la ecuación de Schrödinger. Estos conceptos revolucionaron nuestra comprensión de la materia y la energía a principios del siglo XX.',
    imageUrl: 'https://images.unsplash.com/photo-1635070041078-e363dbe005cb?auto=format&fit=crop&q=80&w=800',
  },
  {
    id: '2',
    title: 'Historia: El Renacimiento Europeo',
    content: 'Un período histórico que abarcó desde el siglo XIV hasta el siglo XVII, marcando la transición de la Edad Media a la modernidad. Se caracterizó por un resurgimiento del interés en la filosofía, la literatura y el arte de la antigüedad clásica, con epicentro en ciudades italianas como Florencia.',
    imageUrl: 'https://images.unsplash.com/photo-1574780654030-ad6a908a8e1f?auto=format&fit=crop&q=80&w=800',
  },
  {
    id: '3',
    title: 'Ciencias de la Computación: Estructuras de Datos',
    content: 'Las estructuras de datos son formas particulares de organizar datos en una computadora para que puedan ser utilizados de manera eficiente. En este bloque cubriremos arreglos, listas enlazadas, pilas, colas, árboles y grafos, herramientas esenciales para el desarrollo de algoritmos óptimos.',
    imageUrl: 'https://images.unsplash.com/photo-1555066931-4365d14bab8c?auto=format&fit=crop&q=80&w=800',
  },
  {
    id: '4',
    title: 'Economía: Macroeconomía, Inflación y Desempleo',
    content: 'La macroeconomía estudia el comportamiento de la economía en su conjunto. Analizaremos indicadores clave como el Producto Interno Bruto (PIB), las causas y consecuencias de la inflación, y cómo las tasas de desempleo afectan el crecimiento económico y las políticas monetarias.',
    imageUrl: 'https://images.unsplash.com/photo-1611974789855-9c2a0a7236a3?auto=format&fit=crop&q=80&w=800',
  },
  {
    id: '5',
    title: 'Química: Fundamentos de Química Orgánica',
    content: 'La química orgánica es el estudio de la estructura, propiedades, composición, reacciones y preparación de compuestos que contienen carbono. Estudiaremos la nomenclatura, las propiedades de los alcanos, alquenos, alquinos, y los grupos funcionales básicos que forman la vida.',
    imageUrl: 'https://images.unsplash.com/photo-1532094349884-543bc11b234d?auto=format&fit=crop&q=80&w=800',
  }
];

export default function App() {
  const [slides, setSlides] = useState<Slide[]>(defaultUniversitySlides);
  const [mode, setMode] = useState<'edit' | 'present'>('edit');
  const [currentSlideIndex, setCurrentSlideIndex] = useState(0);
  const [activeSlideId, setActiveSlideId] = useState<string>(slides[0]?.id || '');

  // Presentation Mode Navigation
  const nextSlide = useCallback(() => {
    setCurrentSlideIndex((prev) => (prev < slides.length - 1 ? prev + 1 : prev));
  }, [slides.length]);

  const prevSlide = useCallback(() => {
    setCurrentSlideIndex((prev) => (prev > 0 ? prev - 1 : prev));
  }, []);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (mode === 'present') {
      if (e.key === 'ArrowRight' || e.key === 'Space') {
        nextSlide();
      } else if (e.key === 'ArrowLeft') {
        prevSlide();
      } else if (e.key === 'Escape') {
        setMode('edit');
      }
    }
  }, [mode, nextSlide, prevSlide]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  const addSlide = () => {
    const newSlide: Slide = {
      id: Date.now().toString(),
      title: 'Nueva Diapositiva',
      content: 'Añade el contenido de tu tema aquí...',
      imageUrl: ''
    };
    setSlides([...slides, newSlide]);
    setActiveSlideId(newSlide.id);
  };

  const removeSlide = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (slides.length <= 1) return;
    const newSlides = slides.filter(s => s.id !== id);
    setSlides(newSlides);
    if (activeSlideId === id) {
      setActiveSlideId(newSlides[0].id);
    }
  };

  const updateActiveSlide = (updates: Partial<Slide>) => {
    setSlides(slides.map(s => s.id === activeSlideId ? { ...s, ...updates } : s));
  };

  const activeSlide = slides.find(s => s.id === activeSlideId) || slides[0];

  const startPresentation = () => {
    setCurrentSlideIndex(slides.findIndex(s => s.id === activeSlideId) || 0);
    setMode('present');
  };

  if (mode === 'present') {
    const slide = slides[currentSlideIndex];
    return (
      <div className="fixed inset-0 bg-slate-900 text-white flex flex-col items-center justify-center overflow-hidden">
        {/* Progress Bar */}
        <div className="absolute top-0 left-0 h-1 bg-blue-500 transition-all duration-300" style={{ width: `${((currentSlideIndex + 1) / slides.length) * 100}%` }} />
        
        {/* Slide Content */}
        <div className="w-full h-full max-w-7xl mx-auto flex flex-col md:flex-row p-8 md:p-16 gap-8 items-center justify-center transition-all duration-500 ease-in-out">
          
          <div className="flex-1 flex flex-col justify-center max-w-2xl z-10">
            <h1 className="text-4xl md:text-6xl font-bold mb-6 text-blue-400 leading-tight">
              {slide.title || 'Sin Título'}
            </h1>
            <p className="text-xl md:text-3xl leading-relaxed text-slate-300">
              {slide.content || 'Sin Contenido'}
            </p>
          </div>

          <div className="flex-1 w-full h-full max-h-[50vh] md:max-h-full flex items-center justify-center relative">
            {slide.imageUrl ? (
              <img 
                src={slide.imageUrl} 
                alt={slide.title}
                className="max-w-full max-h-full object-contain rounded-2xl shadow-2xl shadow-blue-900/50 border border-slate-700 bg-slate-800"
                onError={(e) => { (e.target as HTMLImageElement).src = 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?q=80&w=800&auto=format&fit=crop'; }}
              />
            ) : (
              <div className="w-full h-full min-h-[300px] flex flex-col items-center justify-center bg-slate-800/50 rounded-2xl border border-slate-700 border-dashed text-slate-500">
                <ImageIcon size={64} className="mb-4 opacity-50" />
                <p className="text-xl">Sin imagen (URL no proporcionada)</p>
              </div>
            )}
          </div>
        </div>

        {/* Controls Overlay */}
        <div className="absolute bottom-8 flex gap-6 px-6 py-3 bg-slate-800/80 backdrop-blur rounded-full shadow-lg border border-slate-700">
          <button 
            onClick={prevSlide}
            disabled={currentSlideIndex === 0}
            className="p-3 text-white hover:bg-slate-700 rounded-full disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
          >
            <ChevronLeft size={32} />
          </button>
          
          <div className="flex items-center text-lg font-medium text-slate-400 min-w-[80px] justify-center">
            {currentSlideIndex + 1} / {slides.length}
          </div>

          <button 
            onClick={nextSlide}
            disabled={currentSlideIndex === slides.length - 1}
            className="p-3 text-white hover:bg-slate-700 rounded-full disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
          >
            <ChevronRight size={32} />
          </button>
        </div>

        {/* Exit Button */}
        <button 
          onClick={() => setMode('edit')}
          className="absolute top-6 right-6 p-3 bg-slate-800/80 text-white hover:bg-slate-700 hover:text-red-400 rounded-full backdrop-blur border border-slate-700 transition-colors flex items-center gap-2"
        >
          <X size={24} />
          <span className="hidden md:inline pr-2 font-medium">Salir (Esc)</span>
        </button>
      </div>
    );
  }

  // Edit Mode
  return (
    <div className="min-h-screen bg-slate-50 flex flex-col md:flex-row font-sans text-slate-900">
      
      {/* Sidebar */}
      <aside className="w-full md:w-80 bg-white border-r border-slate-200 flex flex-col h-[30vh] md:h-screen sticky top-0">
        <div className="p-4 border-b border-slate-200 flex items-center gap-3 bg-blue-600 text-white">
          <Presentation size={24} />
          <h2 className="font-bold text-lg tracking-wide">EduSlides Base</h2>
        </div>
        
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {slides.map((slide, index) => (
            <div 
              key={slide.id}
              onClick={() => setActiveSlideId(slide.id)}
              className={`group flex items-center gap-3 p-3 rounded-xl cursor-pointer border transition-all ${
                activeSlideId === slide.id 
                  ? 'bg-blue-50 border-blue-200 shadow-sm' 
                  : 'bg-white border-slate-100 hover:border-slate-300 hover:bg-slate-50'
              }`}
            >
              <div className={`w-8 h-8 rounded-md flex items-center justify-center font-bold text-sm shrink-0 ${
                activeSlideId === slide.id ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-500'
              }`}>
                {index + 1}
              </div>
              <div className="flex-1 truncate">
                <p className={`font-medium truncate text-sm ${activeSlideId === slide.id ? 'text-blue-900' : 'text-slate-700'}`}>
                  {slide.title || 'Sin Título'}
                </p>
              </div>
              {slides.length > 1 && (
                <button 
                  onClick={(e) => removeSlide(slide.id, e)}
                  className="opacity-0 group-hover:opacity-100 p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-md transition-all"
                  title="Eliminar diapositiva"
                >
                  <Trash2 size={16} />
                </button>
              )}
            </div>
          ))}
          
          <button 
            onClick={addSlide}
            className="w-full flex items-center justify-center gap-2 p-3 mt-4 border-2 border-dashed border-slate-300 text-slate-600 rounded-xl hover:bg-slate-50 hover:border-blue-400 hover:text-blue-600 transition-colors font-medium"
          >
            <Plus size={20} />
            Nueva Diapositiva
          </button>
        </div>
      </aside>

      {/* Main Editor Area */}
      <main className="flex-1 flex flex-col min-h-[70vh] bg-slate-50 relative">
        {/* Top bar */}
        <header className="bg-white border-b border-slate-200 px-6 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 sticky top-0 z-10 shadow-sm">
          <div className="flex items-center gap-2">
            <Edit2 size={20} className="text-slate-400" />
            <h1 className="text-xl font-semibold text-slate-800">Modo Edición</h1>
          </div>
          <button 
            onClick={startPresentation}
            className="flex items-center justify-center gap-2 bg-green-600 hover:bg-green-700 text-white px-6 py-2.5 rounded-lg font-medium shadow-md shadow-green-600/20 transition-all transform hover:-translate-y-0.5"
          >
            <Play size={20} className="fill-current" />
            Presentar Clase
          </button>
        </header>

        {/* Editor Form */}
        {activeSlide && (
          <div className="flex-1 overflow-y-auto p-4 md:p-8">
            <div className="max-w-4xl mx-auto bg-white rounded-2xl shadow-sm border border-slate-200 p-6 md:p-10 space-y-8">
              
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2 uppercase tracking-wide">
                  Título del Tema
                </label>
                <input
                  type="text"
                  value={activeSlide.title}
                  onChange={(e) => updateActiveSlide({ title: e.target.value })}
                  placeholder="Ej. Introducción a la Inteligencia Artificial"
                  className="w-full text-2xl md:text-3xl font-bold bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all placeholder:text-slate-300 placeholder:font-normal"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2 uppercase tracking-wide">
                  Contenido / Texto Explicativo
                </label>
                <textarea
                  value={activeSlide.content}
                  onChange={(e) => updateActiveSlide({ content: e.target.value })}
                  placeholder="Escribe el desarrollo de tu clase aquí. Este texto se mostrará en grande durante la presentación..."
                  className="w-full h-48 md:h-64 text-lg bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all resize-y placeholder:text-slate-300"
                />
              </div>

              <div className="bg-blue-50/50 rounded-xl p-6 border border-blue-100">
                <label className="block text-sm font-semibold text-slate-700 mb-2 uppercase tracking-wide flex items-center gap-2">
                  <ImageIcon size={18} className="text-blue-500" />
                  Hipervínculo de Imagen (URL de Internet)
                </label>
                <p className="text-sm text-slate-500 mb-4">Pega la URL de una imagen pública de internet (terminada en .jpg, .png). La plataforma la jalará automáticamente para tu presentación.</p>
                
                <div className="flex flex-col lg:flex-row gap-6">
                  <div className="flex-1">
                    <input
                      type="url"
                      value={activeSlide.imageUrl}
                      onChange={(e) => updateActiveSlide({ imageUrl: e.target.value })}
                      placeholder="https://ejemplo.com/imagen.jpg"
                      className="w-full bg-white border border-slate-300 rounded-xl px-4 py-3 text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                    />
                  </div>
                  
                  {/* Image Preview */}
                  <div className="w-full lg:w-64 h-40 bg-slate-100 rounded-xl border border-slate-200 flex items-center justify-center overflow-hidden shrink-0 relative group">
                    {activeSlide.imageUrl ? (
                      <>
                        <img 
                          src={activeSlide.imageUrl} 
                          alt="Previsualización" 
                          className="w-full h-full object-cover"
                          onError={(e) => { (e.target as HTMLImageElement).src = 'https://via.placeholder.com/400x300?text=Error+al+cargar+imagen'; }}
                        />
                        <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                          <span className="text-white text-sm font-medium">Previsualización</span>
                        </div>
                      </>
                    ) : (
                      <div className="text-slate-400 flex flex-col items-center">
                        <ImageIcon size={32} className="mb-2 opacity-50" />
                        <span className="text-sm">Vista previa</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
              
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
