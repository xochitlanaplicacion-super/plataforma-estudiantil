
"use client";

import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { BookOpen, GraduationCap, Users, Clock, MapPin, Phone, Mail, ChevronUp, Menu, X, CheckCircle, Award, Loader2, Briefcase, ArrowRight } from 'lucide-react';

if (typeof window !== 'undefined') {
  gsap.registerPlugin(useGSAP, ScrollTrigger);
}
import { cn } from '@/lib/utils';
import { Variants } from 'framer-motion';
import { createContactoRecord } from '@/lib/actions/contacto';
import { useToast } from '@/hooks/use-toast';
import Image from 'next/image';
import { useInstitucion } from '@/hooks/use-institucion';

// Eliminamos la lista de themes "hardcodeados" para que respete la tabla configuracion_sistema.

// Custom hook to detect scroll position
const useScroll = () => {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 50);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);
  return scrolled;
};

// Animation Variants
const fadeUp: Variants = {
  hidden: { opacity: 0, y: 40 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.8, ease: "easeOut" } }
};

const staggerContainer: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.2 }
  }
};

const LOGO_FALLBACK = '/images/logo_placeholder.svg';

const Navbar = ({ theme }: { theme: any }) => {
  const scrolled = useScroll();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { config: inst } = useInstitucion();

  const links = [
    { name: 'Inicio', href: '#inicio' },
    { name: 'Quiénes somos', href: '#quienes-somos' },
    { name: 'Oferta Educativa', href: '#oferta-educativa' },
    { name: 'Contacto', href: '#contacto' },
  ];

  return (
    <nav
      className={cn(
        'fixed top-0 left-0 right-0 z-50 transition-all duration-300',
        scrolled ? 'bg-white shadow-md py-3' : 'bg-transparent py-5'
      )}
    >
      <div className="container mx-auto px-4 lg:px-8 flex justify-between items-center">
        <a href="#inicio" className="flex items-center gap-4 group">
          <div className="relative h-16 w-16 md:h-20 md:w-20 transition-transform duration-300 group-hover:scale-105">
            <img
              src={inst.logo_url || LOGO_FALLBACK}
              alt="Logo IEEZ"
              className="w-full h-full object-contain drop-shadow-md"
            />
          </div>
          <div className="flex flex-col">
            <span className={cn(
              "font-extrabold text-xl md:text-2xl leading-none transition-colors duration-300",
              scrolled ? "" : "text-white"
            )}
            style={scrolled ? { color: theme.primary } : {}}>
              {inst.siglas}
            </span>
            <span className={cn(
              "text-[10px] md:text-[11px] uppercase font-bold tracking-[0.1em] transition-colors duration-300",
              scrolled ? "text-gray-600" : "text-gray-200"
            )}>
              {inst.nombre_corto}<br />{inst.siglas !== inst.nombre_corto ? '' : ''}
            </span>
          </div>
        </a>

        {/* Desktop Nav */}
        <div className="hidden md:flex items-center gap-8">
          <div className="flex gap-6">
            {links.map((link) => (
              <a
                key={link.name}
                href={link.href}
                className={cn(
                  "text-sm font-bold uppercase tracking-wide transition-colors duration-300",
                  scrolled ? "text-gray-700 hover:text-blue-600" : "text-white hover:text-gray-300"
                )}
              >
                {link.name}
              </a>
            ))}
          </div>
          <Magnetic intensity={0.4}>
            <a
              href="/"
              className={cn(
                "px-8 py-3 rounded-full font-bold text-sm uppercase tracking-widest transition-all duration-300 transform hover:scale-105 hover:shadow-xl",
                scrolled
                  ? "text-white shadow-lg"
                  : "bg-white text-gray-900 hover:bg-gray-100"
              )}
              style={scrolled ? { backgroundColor: theme.primary } : {}}
            >
              Plataforma
            </a>
          </Magnetic>
        </div>

        {/* Mobile Toggle */}
        <button
          className={cn("md:hidden p-2", scrolled ? "text-gray-800" : "text-white")}
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
        >
          {mobileMenuOpen ? <X size={28} /> : <Menu size={28} />}
        </button>
      </div>

      {/* Mobile Nav */}
      <AnimatePresence>
        {mobileMenuOpen && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="absolute top-full left-0 right-0 bg-white shadow-2xl py-8 px-6 md:hidden flex flex-col gap-5"
          >
            {links.map((link) => (
              <a
                key={link.name}
                href={link.href}
                onClick={() => setMobileMenuOpen(false)}
                className="text-gray-900 font-bold text-lg py-2 border-b border-gray-100 uppercase tracking-widest"
              >
                {link.name}
              </a>
            ))}
            <a
              href="/"
              onClick={() => setMobileMenuOpen(false)}
              className="mt-4 text-center text-white px-6 py-4 rounded-xl font-bold text-sm uppercase tracking-widest shadow-lg"
              style={{ backgroundColor: theme.primary }}
            >
              Acceso Plataforma
            </a>
          </motion.div>
        )}
      </AnimatePresence>
    </nav>
  );
};

const Magnetic = ({ children, intensity = 0.5, className }: { children: React.ReactNode, intensity?: number, className?: string }) => {
  const ref = useRef<HTMLDivElement>(null);

  useGSAP(() => {
    const el = ref.current;
    if (!el) return;

    const xTo = gsap.utils.pipe(
      gsap.utils.clamp(-30, 30),
      (v) => gsap.quickTo(el, "x", { duration: 1, ease: "elastic.out(1, 0.3)" })(v)
    );
    const yTo = gsap.utils.pipe(
      gsap.utils.clamp(-30, 30),
      (v) => gsap.quickTo(el, "y", { duration: 1, ease: "elastic.out(1, 0.3)" })(v)
    );

    const handleMouseMove = (e: MouseEvent) => {
      const { clientX, clientY } = e;
      const { left, top, width, height } = el.getBoundingClientRect();
      const centerX = left + width / 2;
      const centerY = top + height / 2;
      
      const distanceX = (clientX - centerX) * intensity;
      const distanceY = (clientY - centerY) * intensity;
      
      xTo(distanceX);
      yTo(distanceY);
    };

    const handleMouseLeave = () => {
      xTo(0);
      yTo(0);
    };

    el.addEventListener("mousemove", handleMouseMove);
    el.addEventListener("mouseleave", handleMouseLeave);

    return () => {
      el.removeEventListener("mousemove", handleMouseMove);
      el.removeEventListener("mouseleave", handleMouseLeave);
    };
  }, { scope: ref });

  return <div ref={ref} className={cn("inline-block transition-transform duration-100", className)}>{children}</div>;
};

export const Hero = ({ theme, config }: { theme: any, config: any }) => {
  return (
    <section id="inicio" className="relative min-h-screen flex items-center pt-20 overflow-hidden" style={{ backgroundColor: theme.primary }}>
      <div className="absolute inset-0 z-0">
        <div
          className="absolute inset-0 z-10 opacity-80"
          style={{ background: `linear-gradient(to right, ${theme.primary}, ${theme.primary}CC, transparent)` }}
        />
        <img
          src={config.hero_image || "/images/hero-about.jpeg"}
          alt="Hero"
          className="w-full h-full object-cover object-center"
        />
      </div>

      <div className="container mx-auto px-4 lg:px-8 relative z-20">
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
          variants={staggerContainer}
          className="max-w-3xl text-white"
        >
            {config.hero_badges !== null && (
              <motion.div variants={fadeUp} className="inline-block bg-white/20 backdrop-blur-md border border-white/30 px-6 py-2 rounded-full mb-8">
                <span className="text-sm font-bold tracking-[0.2em] uppercase">
                  {config.hero_badges || "Universidad | Bachillerato | Capacitaciones"}
                </span>
              </motion.div>
            )}

            <motion.h1 variants={fadeUp} className="text-5xl md:text-8xl font-black leading-tight mb-8 uppercase drop-shadow-2xl">
              {config.hero_title || "LA EDUCACIÓN ES EL PRIMER PASO HACIA EL"} <span className="block mt-4 inline-block border-b-8" style={{ borderBottomColor: theme.accent, color: theme.accent }}>{config.hero_highlight || "éxito"}</span>
            </motion.h1>

            <motion.p variants={fadeUp} className="text-xl md:text-2xl text-gray-100 mb-12 max-w-2xl font-medium leading-relaxed">
              {config.hero_subtitle || "Formación integral para jóvenes y adultos. Concluye tus estudios con validez oficial SEP en un ambiente de excelencia."}
            </motion.p>

          <motion.div variants={fadeUp} className="flex flex-col sm:flex-row gap-6 relative z-10">
            <Magnetic intensity={0.4}>
              <a
                href="/preregistro"
                className="px-10 py-5 bg-white text-gray-900 font-black rounded-xl text-center transition-all duration-300 shadow-2xl hover:scale-105 flex justify-center items-center gap-3 uppercase tracking-widest"
              >
                Inicia Hoy <GraduationCap size={24} />
              </a>
            </Magnetic>
            <Magnetic intensity={0.3}>
              <a
                href="#quienes-somos"
                className="px-10 py-5 bg-black/30 hover:bg-black/40 backdrop-blur-md text-white font-black rounded-xl text-center transition-all duration-300 border border-white/30 uppercase tracking-widest"
              >
                Leer Más
              </a>
            </Magnetic>
          </motion.div>
        </motion.div>
      </div>

      {/* Hero Logo Drawing SVG Decoration */}
      <div className="absolute right-0 bottom-0 w-full h-full pointer-events-none overflow-hidden z-10">
        <svg viewBox="0 0 1000 1000" className="w-full h-full opacity-20">
          <motion.path
            d="M -100 900 Q 200 800 400 500 T 1100 100"
            fill="none"
            stroke="white"
            strokeWidth="2"
            initial={{ pathLength: 0, opacity: 0 }}
            animate={{ pathLength: 1, opacity: 1 }}
            transition={{ duration: 3, ease: "easeInOut", delay: 1 }}
          />
          <motion.path
            d="M -100 950 Q 300 850 500 550 T 1200 150"
            fill="none"
            stroke={theme.accent}
            strokeWidth="1"
            initial={{ pathLength: 0, opacity: 0 }}
            animate={{ pathLength: 1, opacity: 0.5 }}
            transition={{ duration: 4, ease: "easeInOut", delay: 1.5 }}
          />
        </svg>
      </div>
    </section>
  );
};

export const MissionStatement = ({ theme, config }: { theme: any, config: any }) => {
  const containerRef = useRef(null);
  const textRef = useRef(null);
  const descRef = useRef(null);
  const iconRightRef = useRef(null);
  const iconLeftRef = useRef(null);

  useGSAP(() => {
    // Parallax para los iconos de fondo
    gsap.to(iconRightRef.current, {
      y: -100,
      rotation: 20,
      scrollTrigger: {
        trigger: containerRef.current,
        start: "top bottom",
        end: "bottom top",
        scrub: 1
      }
    });

    gsap.to(iconLeftRef.current, {
      y: 100,
      rotation: -20,
      scrollTrigger: {
        trigger: containerRef.current,
        start: "top bottom",
        end: "bottom top",
        scrub: 1
      }
    });

    // Revelación del texto principal
    gsap.from(textRef.current, {
      opacity: 0,
      y: 50,
      duration: 1.2,
      ease: "power4.out",
      scrollTrigger: {
        trigger: textRef.current,
        start: "top 85%",
        toggleActions: "play none none reverse"
      }
    });

    // Revelación de la descripción
    gsap.from(descRef.current, {
      opacity: 0,
      scale: 0.95,
      y: 20,
      duration: 1,
      delay: 0.3,
      ease: "back.out(1.7)",
      scrollTrigger: {
        trigger: descRef.current,
        start: "top 90%",
        toggleActions: "play none none reverse"
      }
    });
  }, { scope: containerRef });

  return (
    <section ref={containerRef} className="py-24 md:py-32 relative overflow-hidden" style={{ backgroundColor: `${theme.primary}08` }}>
      <div className="container mx-auto px-4 lg:px-8 relative z-10">
        <div className="max-w-5xl mx-auto text-center">
          <div className="mb-10 flex justify-center">
            <div className="w-20 h-1 bg-gradient-to-r rounded-full" style={{ backgroundImage: `linear-gradient(to right, transparent, ${theme.primary}, transparent)` }}></div>
          </div>

          {config.mission_title ? (
            <h2 ref={textRef} className="text-2xl md:text-4xl lg:text-5xl font-black text-gray-900 leading-[1.3] md:leading-tight tracking-tight">
              {config.mission_title}
            </h2>
          ) : (
            <h2 ref={textRef} className="text-2xl md:text-4xl lg:text-5xl font-black text-gray-900 leading-[1.3] md:leading-tight tracking-tight">
              Somos una institución <span style={{ color: theme.primary }}>comprometida</span> con brindar educación para estudiantes jóvenes y adultos, ofreciendo la oportunidad de concluir su <span className="underline decoration-4" style={{ textDecorationColor: `${theme.accent}60` }}>Bachillerato General</span>, <span className="underline decoration-4" style={{ textDecorationColor: `${theme.accent}60` }}>Licenciaturas</span>, <span className="underline decoration-4" style={{ textDecorationColor: `${theme.accent}60` }}>Ingenierías</span> y <span className="underline decoration-4" style={{ textDecorationColor: `${theme.accent}60` }}>Capacitaciones</span> avaladas por la <span className="font-black italic">Secretaría de Educación Pública (SEP)</span>.
            </h2>
          )}

          <div ref={descRef} className="mt-12 text-xl md:text-2xl text-gray-600 font-medium max-w-4xl mx-auto leading-relaxed">
            {config.mission_text || "Nuestro enfoque es proporcionar un ambiente de aprendizaje flexible y accesible para aquellos que desean continuar su Educación Media Superior y Superior."}
          </div>

          <div className="mt-10 flex justify-center">
            <div className="w-20 h-1 bg-gradient-to-r rounded-full opacity-50" style={{ backgroundImage: `linear-gradient(to right, transparent, ${theme.primary}, transparent)` }}></div>
          </div>
        </div>
      </div>

      {/* Decorative background elements with GSAP Parallax */}
      <div ref={iconRightRef} className="absolute top-0 right-0 w-64 h-64 opacity-[0.04] pointer-events-none -translate-y-1/2 translate-x-1/2">
        <BookOpen size={256} style={{ color: theme.primary }} />
      </div>
      <div ref={iconLeftRef} className="absolute bottom-0 left-0 w-64 h-64 opacity-[0.04] pointer-events-none translate-y-1/2 -translate-x-1/2">
        <GraduationCap size={256} style={{ color: theme.primary }} />
      </div>
    </section>
  );
};

export const About = ({ theme, config }: { theme: any, config: any }) => {
  return (
    <section id="quienes-somos" className="py-32 bg-gray-50">
      <div className="container mx-auto px-4 lg:px-8">
        <div className="flex flex-col lg:flex-row gap-12 lg:gap-20 items-center">
          <motion.div
            initial={{ opacity: 0, x: -50 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true, margin: "-100px" }}
            transition={{ duration: 0.8 }}
            className="lg:w-[55%] relative"
          >
            <div className="relative rounded-3xl overflow-hidden shadow-[0_32px_64px_-12px_rgba(0,0,0,0.2)] aspect-square md:aspect-[4/3]">
              <img
                src={config.about_image || "/images/about-team.jpeg"}
                alt="Nosotros"
                className="w-full h-full object-cover object-right contrast-110 saturate-105 brightness-105"
              />
              <div className="absolute inset-0 bg-blue-900/10 mix-blend-multiply"></div>
            </div>
            <div className="absolute -bottom-10 -right-10 bg-white p-8 rounded-2xl shadow-2xl max-w-xs hidden md:block border border-gray-100">
              <div className="flex items-center gap-5">
                <div className="p-4 rounded-xl text-white shadow-lg" style={{ backgroundColor: theme.primary }}>
                  <Award size={32} />
                </div>
                <div>
                  <h4 className="font-black text-gray-900 text-lg">{config.about_badge_title || "Validez Oficial"}</h4>
                  <p className="text-sm font-bold text-gray-500 uppercase tracking-tighter">{config.about_badge_subtitle || "Acuerdo 286 SEP"}</p>
                </div>
              </div>
            </div>
          </motion.div>

          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-100px" }}
            variants={staggerContainer}
            className="lg:w-[45%]"
          >
            <motion.div variants={fadeUp} className="mb-6 flex items-center gap-3 font-black uppercase tracking-[0.2em] text-sm" style={{ color: theme.primary }}>
              <Users size={20} /> Quiénes somos
            </motion.div>
            <motion.h2 variants={fadeUp} className="text-5xl md:text-6xl font-black text-gray-900 mb-10 leading-tight">
              {config.about_title || "Nuestra Pasión por la Educación en México"}
            </motion.h2>
            <motion.div variants={fadeUp} className="space-y-8 text-gray-600 text-xl leading-relaxed font-medium">
              <p>
                {config.about_text || "En Instituto Emiliano Zapata nos apasiona proporcionar programas de alta calidad que se adapten a las necesidades reales de los estudiantes, garantizando que cada egresado tenga las herramientas necesarias para triunfar en el mercado laboral actual."}
              </p>
            </motion.div>

            <motion.div variants={fadeUp} className="grid sm:grid-cols-2 gap-8 mt-14">
              <div className="bg-white p-8 rounded-2xl shadow-sm border border-gray-100 hover:shadow-xl transition-all group">
                <div className="w-14 h-14 flex items-center justify-center rounded-xl mb-6 transition-colors" style={{ backgroundColor: `${theme.primary}15`, color: theme.primary }}>
                  <CheckCircle size={28} />
                </div>
                <h3 className="font-black text-gray-900 text-2xl mb-3">{config.about_card1_title || "Acreditaciones"}</h3>
                <p className="text-gray-500 font-medium">
                  {config.about_card1_text || "Respaldo total de la SEP, garantizando la validez oficial de tus estudios."}
                </p>
              </div>
              <div className="bg-white p-8 rounded-2xl shadow-sm border border-gray-100 hover:shadow-xl transition-all group">
                <div className="w-14 h-14 flex items-center justify-center rounded-xl mb-6 transition-colors" style={{ backgroundColor: `${theme.primary}15`, color: theme.primary }}>
                  <Users size={28} />
                </div>
                <h3 className="font-black text-gray-900 text-2xl mb-3">{config.about_card2_title || "Docentes"}</h3>
                <p className="text-gray-500 font-medium">
                  {config.about_card2_text || "Equipo altamente calificado y comprometido con tu éxito académico."}
                </p>
              </div>
            </motion.div>
          </motion.div>
        </div>
      </div>
    </section>
  );
};

export const Programs = ({ theme, config }: { theme: any, config: any }) => {
  const defaultPrograms = [
    {
      id: "prepa-joven",
      title: "PREPA JOVEN",
      subtitle: "",
      duration: "Duración de: 4 MESES",
      badge: "Excelencia Académica",
      description: "Para continuar tus estudios e ingresar a cualquier Universidad pública o privada",
      validez: "Con validez oficial SEP",
      image: "/images/universidad.jpeg",
      iconType: "users",
      crop: "object-top"
    },
    {
      id: "prepa-adultos",
      title: "BACHILLERATO ADULTOS",
      subtitle: "",
      duration: "Duración: 2 MESES",
      badge: "Meta Cumplida",
      description: "Para trabajar o ingresar a la universidad",
      validez: "Con validez oficial SEP",
      image: "/images/imagen2.jpeg",
      iconType: "award",
      crop: "object-top"
    },
    {
      id: "universidad",
      title: "UNIVERSIDAD",
      subtitle: "",
      duration: "EN 10 MESES",
      badge: "Grado Superior",
      description: "LICENCIATURAS\nINGENIERÍAS\n\nTITULACIÓN POR EXPERIENCIA PROFESIONAL EN 2 MESES",
      validez: "Titulo y Cédula con validez oficial SEP",
      image: "/images/grad-2.jpeg",
      iconType: "book",
      crop: "object-center"
    },
    {
      id: "capacitaciones",
      title: "CAPACITACIONES LABORALES",
      subtitle: "",
      duration: "Duración: 4 MESES",
      badge: "Formación Real",
      description: "Profesionalizate en áreas laborales",
      validez: "Con validez oficial SEP",
      image: "/images/adultos.jpeg",
      iconType: "briefcase",
      crop: "object-center"
    }
  ];

  const educationalPrograms = config.programs?.length > 0 ? config.programs : defaultPrograms;

  const defaultModalities = ['Presencial', 'Virtual', 'Híbrida'];
  const studyOptions = config.study_options?.length > 0 ? config.study_options : defaultModalities;

  // We can map them dynamically
  const getIconForModality = (mod: string) => {
    const l = mod.toLowerCase();
    if (l.includes('presencial')) return <Users size={24} />;
    if (l.includes('virtual') || l.includes('linea')) return <BookOpen size={24} />;
    if (l.includes('híbrida') || l.includes('mixta')) return <Clock size={24} />;
    return <CheckCircle size={24} />;
  };

  return (
    <section id="oferta-educativa" className="py-32 bg-white relative">
      <div className="container mx-auto px-4 lg:px-8 relative z-10">
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
          variants={staggerContainer}
          className="text-center max-w-4xl mx-auto mb-20"
        >
          <motion.div variants={fadeUp} className="inline-flex items-center gap-3 px-6 py-2 rounded-full font-black uppercase tracking-[0.2em] text-sm mb-6" style={{ backgroundColor: `${theme.primary}10`, color: theme.primary }}>
            <BookOpen size={20} /> Oferta Educativa
          </motion.div>
          <motion.h2 variants={fadeUp} className="text-5xl md:text-7xl font-black text-gray-900 mb-8">
            Explora nuestros programas
          </motion.h2>
          <motion.p variants={fadeUp} className="text-2xl text-gray-600 font-medium">
            Formación integral con validez oficial para cada etapa de tu vida.
          </motion.p>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 lg:gap-14 max-w-7xl mx-auto">
          {educationalPrograms.map((program, idx) => (
            <motion.div
              key={idx}
              initial={{ opacity: 0, y: 50 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6, delay: program.delay }}
              className="flex flex-col bg-white rounded-[2.5rem] shadow-xl hover:shadow-2xl overflow-hidden group hover:-translate-y-2 transition-all duration-500 border border-gray-100/50"
            >
              <div className="relative min-h-[320px] lg:min-h-[380px] overflow-hidden group">
                {/* Image Background con Nanobanana style cropping */}
                <img
                  src={program.image}
                  alt={program.title}
                  className={cn(
                    "absolute inset-0 w-full h-full object-cover transition-transform duration-700 group-hover:scale-110",
                    program.crop
                  )}
                />

                {/* Overlays */}
                <div className="absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-black/90 via-black/40 to-transparent z-10"></div>
                <div
                  className="absolute inset-0 opacity-20 group-hover:opacity-40 transition-opacity duration-500 z-10"
                  style={{ backgroundColor: idx % 2 === 0 ? theme.primary : theme.accent }}
                ></div>

                {/* Floating Badge */}
                <div className="absolute top-8 left-8 z-20">
                  <span className="inline-block px-4 py-2 bg-white/10 backdrop-blur-md border border-white/20 rounded-full text-white font-black tracking-widest uppercase text-[10px]">
                    {program.badge}
                  </span>
                </div>

                {/* Card Header Content */}
                <div className="absolute inset-x-0 bottom-0 p-8 lg:p-10 z-20">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="p-2 rounded-lg bg-white/20 backdrop-blur-sm text-white">
                      {program.iconType === 'graduation' ? <GraduationCap size={20} /> :
                       program.iconType === 'book' ? <BookOpen size={20} /> :
                       program.iconType === 'briefcase' ? <Briefcase size={20} /> :
                       program.iconType === 'award' ? <Award size={20} /> :
                       <Users size={20} />}
                    </div>
                    <span className="text-white/90 font-black text-xs tracking-widest uppercase">{program.duration}</span>
                  </div>
                  <h3 className="text-3xl lg:text-4xl font-black text-white leading-tight mb-2">{program.title}</h3>
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse"></div>
                    <span className="text-white/80 font-bold text-xs uppercase tracking-wider">{program.subtitle}</span>
                  </div>
                </div>
              </div>

              <div className="p-8 lg:p-10 flex flex-col flex-grow">
                <p className="text-gray-600 mb-8 text-lg font-medium leading-relaxed flex-grow whitespace-pre-line">
                  {program.description}
                </p>
                <div className="flex items-center gap-4 text-gray-900 font-extrabold mb-10 p-5 rounded-2xl border border-gray-100 bg-gray-50 group-hover:bg-white transition-colors">
                  <CheckCircle size={24} className="text-green-500" /> {program.validez}
                </div>
                <Magnetic intensity={0.4} className="w-full">
                  <a
                    href="/preregistro"
                    className="w-full relative overflow-hidden text-center text-white font-black py-5 rounded-2xl transition-all duration-300 uppercase tracking-[0.2em] shadow-lg hover:shadow-xl group/btn flex items-center justify-center gap-3"
                    style={{ backgroundColor: idx % 2 === 0 ? theme.primary : theme.accent }}
                  >
                    <span className="relative z-10 transition-transform duration-300 group-hover/btn:-translate-x-1">INSCRÍBETE AHORA</span>
                    <ArrowRight className="relative z-10 opacity-0 -translate-x-4 transition-all duration-300 group-hover/btn:opacity-100 group-hover/btn:translate-x-0" size={20} />
                  </a>
                </Magnetic>
              </div>
            </motion.div>
          ))}
        </div>

        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.8, delay: 0.5 }}
          className="mt-28 md:mt-32 pt-16 border-t border-gray-200/60 text-center"
        >
          <h3 className="text-sm font-black text-gray-400 mb-8 uppercase tracking-[0.3em]">Opciones de Estudio Disponibles</h3>
          <div className="flex flex-wrap justify-center gap-4 md:gap-8 mt-12">
            {studyOptions.map((modality: string, idx: number) => (
              <Magnetic key={idx} intensity={0.2}>
                <div className="flex items-center gap-4 md:gap-6 px-8 md:px-12 py-5 md:py-6 bg-white text-gray-900 font-black text-base md:text-xl uppercase tracking-widest rounded-full border shadow-md hover:shadow-lg hover:scale-105 transition-all cursor-default" style={{ borderColor: `${theme.primary}40` }}>
                  <span style={{ color: theme.primary }}>{getIconForModality(modality)}</span>
                  {modality}
                </div>
              </Magnetic>
            ))}
          </div>
        </motion.div>
      </div>
    </section>
  );
};

export const Banner = ({ theme, config }: { theme: any, config: any }) => {
  const [currentIdx, setCurrentIdx] = useState(0);
  const images = config.banner_images?.length > 0 ? config.banner_images : ["/images/grad-1.jpeg", "/images/grad-2.jpeg"];

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentIdx((prev) => (prev + 1) % images.length);
    }, 4000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="relative h-[50vh] min-h-[500px] flex items-center justify-center overflow-hidden">
      <div className="absolute inset-0 z-0 bg-black">
        <AnimatePresence mode="popLayout">
          <motion.img
            key={currentIdx}
            initial={{ opacity: 0, scale: 1.05 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 1.5, ease: "easeInOut" }}
            src={images[currentIdx]}
            alt="Graduación"
            className="absolute inset-0 w-full h-full object-cover contrast-110 saturate-105 brightness-105"
          />
        </AnimatePresence>
        <div className="absolute inset-0 z-10" style={{ background: `linear-gradient(to bottom, ${theme.primary}D9, ${theme.primary}B3)` }} />
      </div>
      <div className="relative z-20 text-center px-6 w-full max-w-5xl mx-auto">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          whileInView={{ opacity: 1, scale: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
        >
          <h2 className="text-5xl md:text-7xl font-black text-white mb-10 uppercase tracking-tighter drop-shadow-lg">Estudiantes que trascienden</h2>
          <Magnetic intensity={0.4}>
            <a
              href="/preregistro"
              className="inline-block bg-white text-gray-900 px-12 py-5 rounded-2xl font-black uppercase tracking-widest hover:scale-105 transition-all shadow-2xl"
            >
              Únete a nuestra comunidad
            </a>
          </Magnetic>

          {/* Indicadores del carrusel */}
          <div className="flex justify-center gap-3 mt-12">
            {images.map((_, idx) => (
              <div
                key={idx}
                className={cn(
                  "h-1.5 rounded-full transition-all duration-500",
                  currentIdx === idx ? "w-8 bg-white" : "w-3 bg-white/40"
                )}
              />
            ))}
          </div>
        </motion.div>
      </div>
    </div>
  );
}

import { getDatosContactoFormateados } from '@/lib/actions/horarios';

const Contact = ({ theme }: { theme: any }) => {
  const { toast } = useToast();
  const [formData, setFormData] = useState({ name: '', email: '', phone: '', message: '' });
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [supportPhone, setSupportPhone] = useState("735 2826206");
  const [supportEmail, setSupportEmail] = useState("");
  const [supportAddress, setSupportAddress] = useState("Yautepec Morelos México");

  useEffect(() => {
    getDatosContactoFormateados().then(data => {
      setSupportPhone(data.telefono);
      setSupportEmail(data.correo);
      setSupportAddress(data.direccion);
    });
  }, []);

  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.toUpperCase();
    setFormData({ ...formData, name: value });
  };

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.replace(/\D/g, ''); // Solo números
    setFormData({ ...formData, phone: value });
  };

  const validateEmail = (email: string) => {
    return String(email)
      .toLowerCase()
      .match(
        /^(([^<>()[\]\\.,;:\s@"]+(\.[^<>()[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/
      );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateEmail(formData.email)) {
      toast({ variant: "destructive", title: "Email Inválido", description: "Por favor ingresa un correo electrónico real." });
      return;
    }

    if (formData.phone.length < 10) {
      toast({ variant: "destructive", title: "Teléfono Inválido", description: "El número debe tener al menos 10 dígitos." });
      return;
    }

    setLoading(true);
    try {
      const result = await createContactoRecord({
        nombre: formData.name,
        email: formData.email,
        telefono: formData.phone,
        mensaje: formData.message
      });

      if (result.success) {
        setSubmitted(true);
        toast({ title: "Mensaje Enviado", description: "Pronto nos pondremos en contacto contigo." });
        setFormData({ name: '', email: '', phone: '', message: '' });
        setTimeout(() => setSubmitted(false), 5000);
      } else {
        toast({ variant: "destructive", title: "Error", description: result.error });
      }
    } catch (err) {
      toast({ variant: "destructive", title: "Error", description: "No se pudo enviar el mensaje." });
    } finally {
      setLoading(false);
    }
  };

  return (
    <section id="contacto" className="py-32 bg-gray-50">
      <div className="container mx-auto px-4 lg:px-8">
        <div className="max-w-6xl mx-auto bg-white rounded-[40px] shadow-[0_48px_80px_-16px_rgba(0,0,0,0.12)] overflow-hidden flex flex-col lg:flex-row border border-gray-100">

          {/* Info Side */}
          <div className="lg:w-2/5 p-16 text-white flex flex-col justify-between" style={{ backgroundColor: theme.primary }}>
            <div>
              <motion.div
                initial={{ opacity: 0, x: -30 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
              >
                <h2 className="text-5xl font-black mb-6 uppercase">Contacto</h2>
                <p className="text-white/80 mb-16 text-xl font-medium">
                  Inicia tu proceso hoy mismo. Estamos para apoyarte.
                </p>

                <div className="space-y-10">
                  <div className="flex items-center gap-6">
                    <div className="bg-white/10 p-4 rounded-2xl">
                      <Phone className="text-white" size={28} />
                    </div>
                    <div>
                      <p className="text-xs font-black uppercase tracking-[0.2em] mb-2 text-white/60">Teléfono</p>
                      <p className="text-2xl font-bold">{supportPhone}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-6">
                    <div className="bg-white/10 p-4 rounded-2xl">
                      <Mail className="text-white" size={28} />
                    </div>
                    <div>
                      <p className="text-xs font-black uppercase tracking-[0.2em] mb-2 text-white/60">Email</p>
                      <p className="text-xl font-bold break-all">{supportEmail}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-6">
                    <div className="bg-white/10 p-4 rounded-2xl">
                      <MapPin className="text-white" size={28} />
                    </div>
                    <div>
                      <p className="text-xs font-black uppercase tracking-[0.2em] mb-2 text-white/60">Ubicación</p>
                      <p className="text-xl font-bold">{supportAddress}</p>
                    </div>
                  </div>
                </div>
              </motion.div>
            </div>
          </div>

          {/* Form Side */}
          <div className="lg:w-3/5 p-16 lg:p-20">
            <h3 className="text-3xl font-black text-gray-900 mb-10 uppercase">Envíanos un mensaje</h3>

            {submitted ? (
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className="bg-green-50 border border-green-200 text-green-700 p-8 rounded-3xl flex items-center gap-6"
              >
                <CheckCircle size={48} />
                <div>
                  <h4 className="font-black text-2xl">¡Mensaje enviado!</h4>
                  <p className="text-lg">Nos pondremos en contacto contigo pronto.</p>
                </div>
              </motion.div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-8">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  <div className="space-y-3">
                    <label className="text-sm font-black text-gray-900 uppercase tracking-widest">Nombre Completo *</label>
                    <input
                      type="text"
                      required
                      value={formData.name}
                      onChange={handleNameChange}
                      className="w-full px-6 py-4 bg-gray-50 border border-gray-200 rounded-2xl focus:outline-none focus:ring-4 transition-all text-lg uppercase"
                      placeholder="JUAN PÉREZ"
                    />
                  </div>
                  <div className="space-y-3">
                    <label className="text-sm font-black text-gray-900 uppercase tracking-widest">Teléfono *</label>
                    <input
                      type="tel"
                      required
                      value={formData.phone}
                      onChange={handlePhoneChange}
                      maxLength={10}
                      className="w-full px-6 py-4 bg-gray-50 border border-gray-200 rounded-2xl focus:outline-none focus:ring-4 transition-all text-lg"
                      placeholder="7350000000"
                    />
                  </div>
                </div>
                <div className="space-y-3">
                  <label className="text-sm font-black text-gray-900 uppercase tracking-widest">Correo Electrónico *</label>
                  <input
                    type="email"
                    required
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    className="w-full px-6 py-4 bg-gray-50 border border-gray-200 rounded-2xl focus:outline-none focus:ring-4 transition-all text-lg"
                    placeholder="correo@ejemplo.com"
                  />
                </div>
                <div className="space-y-3">
                  <label className="text-sm font-black text-gray-900 uppercase tracking-widest">Cuéntanos que necesitas saber</label>
                  <textarea
                    rows={4}
                    value={formData.message}
                    onChange={(e) => setFormData({ ...formData, message: e.target.value })}
                    className="w-full px-6 py-4 bg-gray-50 border border-gray-200 rounded-2xl focus:outline-none focus:ring-4 transition-all text-lg resize-none"
                    placeholder="Escribe tu mensaje aquí..."
                  />
                </div>
                <Magnetic intensity={0.4} className="w-full">
                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full text-white font-black py-6 rounded-2xl transition-all shadow-2xl uppercase tracking-[0.3em] hover:scale-[1.02] active:scale-[0.98] flex justify-center items-center gap-2"
                    style={{ backgroundColor: theme.primary }}
                  >
                    {loading ? <Loader2 className="animate-spin" /> : "Enviar Datos"}
                  </button>
                </Magnetic>
              </form>
            )}
          </div>
        </div>
      </div>
    </section>
  );
};

const Footer = ({ theme }: { theme: any }) => {
  const { config: inst } = useInstitucion();
  return (
    <footer className="text-white/80 py-20 border-t border-gray-100" style={{ backgroundColor: theme.secondary || theme.primary }}>
      <div className="container mx-auto px-4 lg:px-8 flex flex-col md:flex-row justify-between items-center gap-10">
        <div className="flex items-center gap-6">
          <div className="h-20 w-auto">
            <img
              src={inst.logo_url || LOGO_FALLBACK}
              alt="Logo IEEZ"
              className="h-full w-auto object-contain"
            />
          </div>
          <div className="flex flex-col">
            <h4 className="text-white font-black text-2xl leading-none">{inst.siglas}</h4>
            <p className="text-[10px] uppercase tracking-[0.2em] font-bold mt-2 text-white/60">{inst.nombre_completo}</p>
          </div>
        </div>

        <p className="text-xs font-bold uppercase tracking-[0.2em] text-white/50">
          © {new Date().getFullYear()} {inst.siglas}. Todos los derechos reservados.
        </p>

        <Magnetic intensity={0.5}>
          <button
            onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
            className="bg-white/10 hover:bg-white/20 p-5 rounded-2xl text-white transition-all shadow-xl"
            aria-label="Volver arriba"
          >
            <ChevronUp size={32} />
          </button>
        </Magnetic>
      </div>
    </footer>
  );
};

const FloatingWhatsApp = ({ telefono }: { telefono: string }) => {
  if (!telefono) return null;

  const rawNumber = telefono.replace(/\D/g, '');
  const textMessage = encodeURIComponent("Necesito más información");
  const whatsappUrl = `https://wa.me/${rawNumber.length === 10 ? '52' : ''}${rawNumber}?text=${textMessage}`;

  return (
    <a 
      href={whatsappUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="fixed bottom-6 right-6 md:bottom-8 md:right-8 z-[100] flex items-center gap-3 bg-white/60 backdrop-blur-xl border border-white/80 p-2.5 md:p-3 rounded-full shadow-[0_8px_30px_rgb(0,0,0,0.12)] transition-all duration-300 hover:scale-110 hover:bg-white/90 hover:shadow-[0_12px_40px_rgb(0,0,0,0.2)] group"
      aria-label="Contactar por WhatsApp"
    >
      <div className="relative w-8 h-8 md:w-10 md:h-10 shrink-0 transition-transform group-hover:scale-110">
        <Image 
          src="/images/whatsapplogo.png" 
          alt="WhatsApp" 
          fill
          className="object-contain drop-shadow-md"
        />
      </div>
      <span className="pr-2 md:pr-4 py-1 text-xs md:text-sm font-bold text-gray-800 tracking-tight whitespace-nowrap">
        Comunícate con nosotros
      </span>
    </a>
  );
};

export default function AcercaDeNosotrosPage() {
  const { config: inst, loading } = useInstitucion();
  
  // Fallback si aún no se ha corrido el script SQL
  const defaultLandingThemes = [
    { id: 'azul', primary: '#0A2647', secondary: '#1e3a8a', accent: '#3b82f6' },
    { id: 'verde', primary: '#1A4A3F', secondary: '#064e3b', accent: '#10b981' },
    { id: 'vino', primary: '#8B2332', secondary: '#6B1A27', accent: '#C41E3A' }
  ];

  const landingConfig = inst.landing_config || {
    themes: defaultLandingThemes,
    active_theme_id: 'azul',
    random_theme: false,
  };

  const [randomTheme, setRandomTheme] = useState<any>(null);

  useEffect(() => {
    if (!loading) {
      if (landingConfig.random_theme && landingConfig.themes?.length > 0) {
        const randomIndex = Math.floor(Math.random() * landingConfig.themes.length);
        setRandomTheme(landingConfig.themes[randomIndex]);
      } else {
        setRandomTheme(null);
      }
    }
  }, [loading, landingConfig.random_theme, landingConfig.themes]);

  const activeTheme = randomTheme || landingConfig.themes.find((t: any) => t.id === landingConfig.active_theme_id) || defaultLandingThemes[0];

  const currentTheme = {
    id: activeTheme.id,
    primary: activeTheme.primary,
    secondary: activeTheme.secondary,
    accent: activeTheme.accent,
    gradient: `from-[${activeTheme.primary}] to-[${activeTheme.secondary}]`,
    textPrimary: `text-[${activeTheme.primary}]`,
  };

  if (loading) return <div className="min-h-screen flex items-center justify-center"><Loader2 className="animate-spin text-primary" size={32} /></div>;



  return (
    <div className="font-sans text-gray-900 bg-white selection:bg-blue-600 selection:text-white relative">
      <Navbar theme={currentTheme} />
      <main>
        <Hero theme={currentTheme} config={landingConfig} />
        <MissionStatement theme={currentTheme} config={landingConfig} />
        <About theme={currentTheme} config={landingConfig} />
        <Banner theme={currentTheme} config={landingConfig} />
        <Programs theme={currentTheme} config={landingConfig} />
        <Contact theme={currentTheme} />
      </main>
      <Footer theme={currentTheme} />
      <FloatingWhatsApp telefono={inst.telefono_contacto} />
    </div>
  );
}
