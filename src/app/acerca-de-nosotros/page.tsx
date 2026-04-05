
"use client";

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { BookOpen, GraduationCap, Users, Clock, MapPin, Phone, Mail, ChevronUp, Menu, X, CheckCircle, Award, Loader2, Briefcase, ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Variants } from 'framer-motion';
import { createContactoRecord } from '@/lib/actions/contacto';
import { useToast } from '@/hooks/use-toast';

// Temas disponibles (Sin Beige para esta página)
const themes = [
  {
    id: 'azul',
    primary: '#0A2647',
    secondary: '#1e3a8a',
    accent: '#3b82f6',
    gradient: 'from-blue-600 to-cyan-500',
    light: 'bg-blue-50',
    textPrimary: 'text-[#0A2647]',
    bgSecondary: 'bg-[#0A2647]',
    borderAccent: 'border-blue-500'
  },
  {
    id: 'verde',
    primary: '#1A4A3F',
    secondary: '#064e3b',
    accent: '#10b981',
    gradient: 'from-emerald-600 to-teal-400',
    light: 'bg-emerald-50',
    textPrimary: 'text-[#1A4A3F]',
    bgSecondary: 'bg-[#1A4A3F]',
    borderAccent: 'border-emerald-500'
  },
  {
    id: 'vino',
    primary: '#8B2332',
    secondary: '#6B1A27',
    accent: '#C41E3A',
    gradient: 'from-[#8B2332] to-[#D42426]',
    light: 'bg-red-50',
    textPrimary: 'text-[#8B2332]',
    bgSecondary: 'bg-[#8B2332]',
    borderAccent: 'border-red-600'
  }
];

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

const LOGO_URL = '/images/logo_zapata.png';

const Navbar = ({ theme }: { theme: any }) => {
  const scrolled = useScroll();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

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
              src={LOGO_URL}
              alt="Logo IEEZ"
              className="w-full h-full object-contain drop-shadow-md"
            />
          </div>
          <div className="flex flex-col">
            <span className={cn(
              "font-extrabold text-xl md:text-2xl leading-none transition-colors duration-300",
              scrolled ? theme.textPrimary : "text-white"
            )}>
              IEEZ
            </span>
            <span className={cn(
              "text-[10px] md:text-[11px] uppercase font-bold tracking-[0.1em] transition-colors duration-300",
              scrolled ? "text-gray-600" : "text-gray-200"
            )}>
              Instituto Educativo<br />Emiliano Zapata
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

const Hero = ({ theme }: { theme: any }) => {
  return (
    <section id="inicio" className="relative min-h-screen flex items-center pt-20 overflow-hidden" style={{ backgroundColor: theme.primary }}>
      <div className="absolute inset-0 z-0">
        <div
          className="absolute inset-0 z-10 opacity-80"
          style={{ background: `linear-gradient(to right, ${theme.primary}, ${theme.primary}CC, transparent)` }}
        />
        <img
          src="/images/hero-about.jpeg"
          alt="Estudiantes"
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
          <motion.div variants={fadeUp} className="inline-block bg-white/20 backdrop-blur-md border border-white/30 px-6 py-2 rounded-full mb-8">
            <span className="text-sm font-bold tracking-[0.2em] uppercase">
              Bachillerato | Capacitaciones
            </span>
          </motion.div>

          <motion.h1 variants={fadeUp} className="text-5xl md:text-8xl font-black leading-tight mb-8 uppercase drop-shadow-2xl">
            LA EDUCACIÓN ES EL PRIMER PASO HACIA EL <span className={cn("block mt-4 text-transparent bg-clip-text bg-gradient-to-r inline-block border-b-8", theme.gradient)} style={{ borderBottomColor: theme.accent }}>éxito</span>
          </motion.h1>

          <motion.p variants={fadeUp} className="text-xl md:text-2xl text-gray-100 mb-12 max-w-2xl font-medium leading-relaxed">
            Formación integral para jóvenes y adultos. Concluye tus estudios con validez oficial SEP en un ambiente de excelencia.
          </motion.p>

          <motion.div variants={fadeUp} className="flex flex-col sm:flex-row gap-6">
            <a
              href="/preregistro"
              className="px-10 py-5 bg-white text-gray-900 font-black rounded-xl text-center transition-all duration-300 shadow-2xl hover:scale-105 flex justify-center items-center gap-3 uppercase tracking-widest"
            >
              Inicia Hoy <GraduationCap size={24} />
            </a>
            <a
              href="#quienes-somos"
              className="px-10 py-5 bg-black/30 hover:bg-black/40 backdrop-blur-md text-white font-black rounded-xl text-center transition-all duration-300 border border-white/30 uppercase tracking-widest"
            >
              Leer Más
            </a>
          </motion.div>
        </motion.div>
      </div>
    </section>
  );
};

const About = ({ theme }: { theme: any }) => {
  return (
    <section id="quienes-somos" className="py-32 bg-gray-50">
      <div className="container mx-auto px-4 lg:px-8">
        <div className="flex flex-col lg:flex-row gap-20 items-center">
          <motion.div
            initial={{ opacity: 0, x: -50 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true, margin: "-100px" }}
            transition={{ duration: 0.8 }}
            className="lg:w-1/2 relative"
          >
            <div className="relative rounded-3xl overflow-hidden shadow-[0_32px_64px_-12px_rgba(0,0,0,0.2)] aspect-square md:aspect-video">
              <img
                src="/images/about-team.jpeg"
                alt="Graduación y directivos"
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
                  <h4 className="font-black text-gray-900 text-lg">Validez Oficial</h4>
                  <p className="text-sm font-bold text-gray-500 uppercase tracking-tighter">Acuerdo 286 SEP</p>
                </div>
              </div>
            </div>
          </motion.div>

          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-100px" }}
            variants={staggerContainer}
            className="lg:w-1/2"
          >
            <motion.div variants={fadeUp} className="mb-6 flex items-center gap-3 font-black uppercase tracking-[0.2em] text-sm" style={{ color: theme.primary }}>
              <Users size={20} /> Quiénes somos
            </motion.div>
            <motion.h2 variants={fadeUp} className="text-5xl md:text-6xl font-black text-gray-900 mb-10 leading-tight">
              Nuestra Pasión por la <span style={{ color: theme.primary }}>Educación</span> en México
            </motion.h2>
            <motion.div variants={fadeUp} className="space-y-8 text-gray-600 text-xl leading-relaxed font-medium">
              <p>
                Pertenecemos a una alianza de instituciones educativas autorizadas por la <strong>Secretaría de Educación Pública (SEP)</strong> para aplicar procesos de evaluación que permitan a estudiantes obtener su grado académico de forma legal y segura.
              </p>
              <p>
                En <strong>Instituto Educativo Emiliano Zapata</strong> nos apasiona proporcionar programas de alta calidad. Nuestro compromiso radica en brindar una experiencia educativa excepcional.
              </p>
            </motion.div>

            <motion.div variants={fadeUp} className="grid sm:grid-cols-2 gap-8 mt-14">
              <div className="bg-white p-8 rounded-2xl shadow-sm border border-gray-100 hover:shadow-xl transition-all group">
                <div className="w-14 h-14 flex items-center justify-center rounded-xl mb-6 transition-colors" style={{ backgroundColor: `${theme.primary}15`, color: theme.primary }}>
                  <CheckCircle size={28} />
                </div>
                <h3 className="font-black text-gray-900 text-2xl mb-3">Acreditaciones</h3>
                <p className="text-gray-500 font-medium">
                  Respaldo total de la SEP, garantizando la validez oficial de tus estudios.
                </p>
              </div>
              <div className="bg-white p-8 rounded-2xl shadow-sm border border-gray-100 hover:shadow-xl transition-all group">
                <div className="w-14 h-14 flex items-center justify-center rounded-xl mb-6 transition-colors" style={{ backgroundColor: `${theme.primary}15`, color: theme.primary }}>
                  <Users size={28} />
                </div>
                <h3 className="font-black text-gray-900 text-2xl mb-3">Docentes</h3>
                <p className="text-gray-500 font-medium">
                  Equipo altamente calificado y comprometido con tu éxito académico.
                </p>
              </div>
            </motion.div>
          </motion.div>
        </div>
      </div>
    </section>
  );
};

const Programs = ({ theme }: { theme: any }) => {
  const educationalPrograms = [
    {
      title: "Prepa Joven",
      subtitle: "PARA CONTINUAR TUS ESTUDIOS",
      duration: "4 MESES",
      badge: "Excelencia Académica",
      description: "e ingresar a cualquier Universidad pública o privada. Con validez oficial SEP.",
      image: "/images/prepa-joven.jpeg",
      icon: <Users size={20} />,
      crop: "object-top",
      delay: 0.1
    },
    {
      title: "Bachillerato Adultos",
      subtitle: "PARA TRABAJAR O INGRESAR A LA UNIVERSIDAD",
      duration: "2 MESES",
      badge: "Meta Cumplida",
      description: "Con validez oficial SEP.",
      image: "/images/adultos.jpeg",
      icon: <Award size={20} />,
      crop: "object-center",
      delay: 0.2
    },
    {
      title: "Universidad",
      subtitle: "LICENCIATURAS E INGENIERÍAS",
      duration: "EN 10 MESES",
      badge: "Grado Superior",
      description: "TITULACIÓN POR EXPERIENCIA PROFESIONAL EN 2 MESES. Título y Cédula con validez oficial SEP.",
      image: "/images/universidad.jpeg",
      icon: <BookOpen size={20} />,
      crop: "object-top",
      delay: 0.3
    },
    {
      title: "Capacitaciones",
      subtitle: "PROFESIONALÍZATE EN ÁREAS LABORALES",
      duration: "4 MESES",
      badge: "Formación Real",
      description: "Con validez oficial SEP.",
      image: "/images/capacitaciones.jpeg",
      icon: <Briefcase size={20} />,
      crop: "object-center",
      delay: 0.4
    }
  ];

  const modalities = [
    { name: 'Presencial', icon: <Users size={20} /> },
    { name: 'Virtual', icon: <BookOpen size={20} /> },
    { name: 'Híbrida', icon: <Clock size={20} /> },
  ];

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
                      {program.icon}
                    </div>
                    <span className="text-white/90 font-black text-xs tracking-widest uppercase">
                      {program.duration.includes('EN') ? program.duration : `DURACIÓN: ${program.duration}`}
                    </span>
                  </div>
                  <h3 className="text-3xl lg:text-4xl font-black text-white leading-tight mb-2">{program.title}</h3>
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse"></div>
                    <span className="text-white/80 font-bold text-xs uppercase tracking-wider">{program.subtitle}</span>
                  </div>
                </div>
              </div>

              <div className="p-8 lg:p-10 flex flex-col flex-grow">
                <p className="text-gray-600 mb-8 text-lg font-medium leading-relaxed flex-grow">
                  {program.description}
                </p>
                <div className="flex items-center gap-4 text-gray-900 font-extrabold mb-10 p-5 rounded-2xl border border-gray-100 bg-gray-50 group-hover:bg-white transition-colors">
                  <CheckCircle size={24} className="text-green-500" /> VALIDEZ OFICIAL SEP
                </div>
                <a
                  href="/preregistro"
                  className="w-full relative overflow-hidden text-center text-white font-black py-5 rounded-2xl transition-all duration-300 uppercase tracking-[0.2em] shadow-lg hover:shadow-xl group/btn flex items-center justify-center gap-3"
                  style={{ backgroundColor: idx % 2 === 0 ? theme.primary : theme.accent }}
                >
                  <span className="relative z-10 transition-transform duration-300 group-hover/btn:-translate-x-1">INSCRÍBETE AHORA</span>
                  <ArrowRight className="relative z-10 opacity-0 -translate-x-4 transition-all duration-300 group-hover/btn:opacity-100 group-hover/btn:translate-x-0" size={20} />
                </a>
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
          <div className="flex flex-wrap justify-center gap-4 md:gap-6">
            {modalities.map((modality, idx) => (
              <div key={idx} className="flex items-center gap-3 md:gap-4 px-6 md:px-8 py-4 bg-white text-gray-900 font-black text-sm md:text-base uppercase tracking-wider rounded-full border shadow-sm hover:shadow-md hover:-translate-y-1 transition-all cursor-default" style={{ borderColor: `${theme.primary}30` }}>
                <span style={{ color: theme.primary }}>{modality.icon}</span>
                {modality.name}
              </div>
            ))}
          </div>
        </motion.div>
      </div>
    </section>
  );
};

const Banner = ({ theme }: { theme: any }) => {
  const [currentIdx, setCurrentIdx] = useState(0);
  const images = ["/images/grad-1.jpeg", "/images/grad-2.jpeg"];

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
          <a
            href="/preregistro"
            className="inline-block bg-white text-gray-900 px-12 py-5 rounded-2xl font-black uppercase tracking-widest hover:scale-105 transition-all shadow-2xl"
          >
            Únete a nuestra comunidad
          </a>

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

const Contact = ({ theme }: { theme: any }) => {
  const { toast } = useToast();
  const [formData, setFormData] = useState({ name: '', email: '', phone: '', message: '' });
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);

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
                      <p className="text-2xl font-bold">735 2826206</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-6">
                    <div className="bg-white/10 p-4 rounded-2xl">
                      <Mail className="text-white" size={28} />
                    </div>
                    <div>
                      <p className="text-xs font-black uppercase tracking-[0.2em] mb-2 text-white/60">Email</p>
                      <p className="text-xl font-bold break-all">instituto.edu.emilianozapata@gmail.com</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-6">
                    <div className="bg-white/10 p-4 rounded-2xl">
                      <MapPin className="text-white" size={28} />
                    </div>
                    <div>
                      <p className="text-xs font-black uppercase tracking-[0.2em] mb-2 text-white/60">Ubicación</p>
                      <p className="text-xl font-bold">Yautepec Morelos México</p>
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
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full text-white font-black py-6 rounded-2xl transition-all shadow-2xl uppercase tracking-[0.3em] hover:scale-[1.02] active:scale-[0.98] flex justify-center items-center gap-2"
                  style={{ backgroundColor: theme.primary }}
                >
                  {loading ? <Loader2 className="animate-spin" /> : "Enviar Datos"}
                </button>
              </form>
            )}
          </div>
        </div>
      </div>
    </section>
  );
};

const Footer = ({ theme }: { theme: any }) => {
  return (
    <footer className="text-white/80 py-20 border-t border-gray-100" style={{ backgroundColor: theme.id === 'azul' ? '#051426' : theme.id === 'verde' ? '#064e3b' : '#4c0519' }}>
      <div className="container mx-auto px-4 lg:px-8 flex flex-col md:flex-row justify-between items-center gap-10">
        <div className="flex items-center gap-6">
          <div className="h-20 w-auto">
            <img
              src={LOGO_URL}
              alt="Logo IEEZ"
              className="h-full w-auto object-contain"
            />
          </div>
          <div className="flex flex-col">
            <h4 className="text-white font-black text-2xl leading-none">IEEZ</h4>
            <p className="text-[10px] uppercase tracking-[0.2em] font-bold mt-2 text-white/60">Instituto Educativo Emiliano Zapata</p>
          </div>
        </div>

        <p className="text-xs font-bold uppercase tracking-[0.2em] text-white/50">
          © {new Date().getFullYear()} IEEZ. Todos los derechos reservados.
        </p>

        <button
          onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
          className="bg-white/10 hover:bg-white/20 p-5 rounded-2xl text-white transition-all shadow-xl"
          aria-label="Volver arriba"
        >
          <ChevronUp size={32} />
        </button>
      </div>
    </footer>
  );
};

export default function AcercaDeNosotrosPage() {
  const [currentTheme, setCurrentTheme] = useState(themes[0]);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    // Escoger solo entre Azul, Verde y Vino
    const randomTheme = themes[Math.floor(Math.random() * themes.length)];
    setCurrentTheme(randomTheme);
    setMounted(true);
  }, []);

  if (!mounted) return null;

  return (
    <div className="font-sans text-gray-900 bg-white selection:bg-blue-600 selection:text-white">
      <Navbar theme={currentTheme} />
      <main>
        <Hero theme={currentTheme} />
        <About theme={currentTheme} />
        <Banner theme={currentTheme} />
        <Programs theme={currentTheme} />
        <Contact theme={currentTheme} />
      </main>
      <Footer theme={currentTheme} />
    </div>
  );
}
