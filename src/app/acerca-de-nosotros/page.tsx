
"use client";

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { BookOpen, GraduationCap, Users, Clock, MapPin, Phone, Mail, ChevronUp, Menu, X, CheckCircle, Award } from 'lucide-react';
import { cn } from '@/lib/utils';

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
const fadeUp = {
  hidden: { opacity: 0, y: 40 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.8, ease: "easeOut" } }
};

const staggerContainer = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.2 }
  }
};

const Navbar = () => {
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
        scrolled ? 'bg-white shadow-md py-4' : 'bg-transparent py-6'
      )}
    >
      <div className="container mx-auto px-4 lg:px-8 flex justify-between items-center">
        <a href="#inicio" className="flex items-center gap-2 group">
          <div className={cn("p-2 rounded-lg transition-colors duration-300", scrolled ? "bg-[#0A2647] text-white" : "bg-white text-[#0A2647]")}>
            <GraduationCap size={28} />
          </div>
          <div className="flex flex-col">
            <span className={cn("font-bold text-xl leading-none transition-colors duration-300", scrolled ? "text-[#0A2647]" : "text-white")}>
              IEEZ
            </span>
            <span className={cn("text-[10px] uppercase font-semibold tracking-wider transition-colors duration-300", scrolled ? "text-gray-600" : "text-gray-200")}>
              Instituto Educativo<br/>Emiliano Zapata
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
                  "text-sm font-semibold uppercase tracking-wide transition-colors duration-300 hover:text-blue-500",
                  scrolled ? "text-gray-700" : "text-white"
                )}
              >
                {link.name}
              </a>
            ))}
          </div>
          <a
            href="/"
            className={cn(
              "px-6 py-2.5 rounded-full font-bold text-sm uppercase tracking-wide transition-all duration-300 transform hover:scale-105 hover:shadow-lg",
              scrolled ? "bg-[#0A2647] text-white hover:bg-blue-800" : "bg-white text-[#0A2647] hover:bg-gray-100"
            )}
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
            className="absolute top-full left-0 right-0 bg-white shadow-xl py-6 px-4 md:hidden flex flex-col gap-4"
          >
            {links.map((link) => (
              <a
                key={link.name}
                href={link.href}
                onClick={() => setMobileMenuOpen(false)}
                className="text-gray-800 font-semibold text-lg py-2 border-b border-gray-100 uppercase"
              >
                {link.name}
              </a>
            ))}
            <a
              href="/"
              onClick={() => setMobileMenuOpen(false)}
              className="mt-4 text-center bg-[#0A2647] text-white px-6 py-3 rounded-md font-bold text-sm uppercase tracking-wide"
            >
              Acceso Plataforma
            </a>
          </motion.div>
        )}
      </AnimatePresence>
    </nav>
  );
};

const Hero = () => {
  return (
    <section id="inicio" className="relative min-h-screen flex items-center pt-20 overflow-hidden bg-[#0A2647]">
      <div className="absolute inset-0 z-0">
        <div className="absolute inset-0 bg-gradient-to-r from-[#0A2647] via-[#0A2647]/80 to-transparent z-10" />
        <img
          src="https://picsum.photos/seed/edu1/1920/1080"
          alt="Estudiantes en el campus"
          className="w-full h-full object-cover object-center"
          data-ai-hint="university campus students"
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
          <motion.div variants={fadeUp} className="inline-block bg-white/20 backdrop-blur-md border border-white/30 px-4 py-1.5 rounded-full mb-6">
            <span className="text-sm font-semibold tracking-widest uppercase">
              Bachillerato | Capacitaciones
            </span>
          </motion.div>
          
          <motion.h1 variants={fadeUp} className="text-5xl md:text-7xl font-extrabold leading-tight mb-6">
            LA EDUCACIÓN ES EL PRIMER PASO HACIA EL <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-cyan-300 block mt-2">éxito</span>
          </motion.h1>
          
          <motion.p variants={fadeUp} className="text-lg md:text-xl text-gray-200 mb-10 max-w-2xl leading-relaxed">
            Somos una institución comprometida con brindar educación para estudiantes jóvenes y adultos. Concluye tu Bachillerato General avalado por la SEP en un ambiente flexible y accesible.
          </motion.p>
          
          <motion.div variants={fadeUp} className="flex flex-col sm:flex-row gap-4">
            <a href="/preregistro" className="px-8 py-4 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-lg text-center transition-all duration-300 shadow-lg shadow-blue-500/30 flex justify-center items-center gap-2 uppercase tracking-wide">
              Inicia Hoy <GraduationCap size={20} />
            </a>
            <a href="#quienes-somos" className="px-8 py-4 bg-white/10 hover:bg-white/20 backdrop-blur-md text-white font-bold rounded-lg text-center transition-all duration-300 border border-white/20 uppercase tracking-wide">
              Leer Más
            </a>
          </motion.div>
        </motion.div>
      </div>
    </section>
  );
};

const About = () => {
  return (
    <section id="quienes-somos" className="py-24 bg-gray-50">
      <div className="container mx-auto px-4 lg:px-8">
        <div className="flex flex-col lg:flex-row gap-16 items-center">
          <motion.div 
            initial={{ opacity: 0, x: -50 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true, margin: "-100px" }}
            transition={{ duration: 0.8 }}
            className="lg:w-1/2 relative"
          >
            <div className="relative rounded-2xl overflow-hidden shadow-2xl aspect-video">
              <img 
                src="https://picsum.photos/seed/edu2/800/600" 
                alt="Aula moderna en México" 
                className="w-full h-full object-cover" 
                data-ai-hint="modern classroom"
              />
              <div className="absolute inset-0 bg-blue-900/10 mix-blend-multiply"></div>
            </div>
            <div className="absolute -bottom-8 -right-8 bg-white p-6 rounded-xl shadow-xl max-w-xs hidden md:block">
              <div className="flex items-center gap-4 mb-2">
                <div className="bg-blue-100 p-3 rounded-full text-blue-600">
                  <Award size={24} />
                </div>
                <div>
                  <h4 className="font-bold text-gray-800">Validez Oficial</h4>
                  <p className="text-sm text-gray-500">Acuerdo 286 SEP</p>
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
            <motion.div variants={fadeUp} className="mb-4 flex items-center gap-2 text-blue-600 font-semibold uppercase tracking-wider text-sm">
              <Users size={18} /> Quiénes somos
            </motion.div>
            <motion.h2 variants={fadeUp} className="text-4xl md:text-5xl font-bold text-[#0A2647] mb-6">
              Nuestra Pasión por la <span className="text-blue-600">Educación</span> en México
            </motion.h2>
            <motion.div variants={fadeUp} className="space-y-6 text-gray-600 text-lg leading-relaxed">
              <p>
                Pertenecemos a una alianza de instituciones educativas autorizadas por la <strong>Secretaría de Educación Pública (SEP)</strong> para aplicar procesos de evaluación que permitan a estudiantes jóvenes y adultos obtener un grado mayor de estudios, a través del Acuerdo 286 de la SEP.
              </p>
              <p>
                En <strong>Instituto Educativo Emiliano Zapata</strong> nos apasiona proporcionar programas de educación de alta calidad. Nuestro compromiso radica en brindar una experiencia educativa excepcional, facilitando el acceso a la educación superior para ampliar tus horizontes.
              </p>
            </motion.div>

            <motion.div variants={fadeUp} className="grid sm:grid-cols-2 gap-6 mt-10">
              <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 hover:shadow-md transition-shadow">
                <div className="bg-green-100 text-green-600 w-12 h-12 flex items-center justify-center rounded-lg mb-4">
                  <CheckCircle size={24} />
                </div>
                <h3 className="font-bold text-[#0A2647] text-xl mb-2">Acreditaciones</h3>
                <p className="text-gray-600 text-sm">
                  Respaldo y autorizaciones de la SEP, garantizando validez oficial de estudios.
                </p>
              </div>
              <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 hover:shadow-md transition-shadow">
                <div className="bg-purple-100 text-purple-600 w-12 h-12 flex items-center justify-center rounded-lg mb-4">
                  <Users size={24} />
                </div>
                <h3 className="font-bold text-[#0A2647] text-xl mb-2">Calificaciones</h3>
                <p className="text-gray-600 text-sm">
                  Equipo docente altamente calificado y comprometido con la excelencia.
                </p>
              </div>
            </motion.div>
          </motion.div>
        </div>
      </div>
    </section>
  );
};

const Programs = () => {
  const modalities = [
    { name: 'Presencial', icon: <Users size={20} /> },
    { name: 'Virtual', icon: <BookOpen size={20} /> },
    { name: 'Híbrida', icon: <Clock size={20} /> },
  ];

  return (
    <section id="oferta-educativa" className="py-24 bg-white relative">
      <div className="container mx-auto px-4 lg:px-8 relative z-10">
        <motion.div 
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
          variants={staggerContainer}
          className="text-center max-w-3xl mx-auto mb-16"
        >
          <motion.div variants={fadeUp} className="inline-flex items-center gap-2 bg-blue-50 text-blue-600 px-4 py-2 rounded-full font-semibold uppercase tracking-wider text-sm mb-4">
            <BookOpen size={18} /> Oferta Educativa
          </motion.div>
          <motion.h2 variants={fadeUp} className="text-4xl md:text-5xl font-bold text-[#0A2647] mb-6">
            Explora nuestros programas
          </motion.h2>
          <motion.p variants={fadeUp} className="text-xl text-gray-600">
            Programas diseñados a tus necesidades. Terminación de estudios de manera rápida, legal y con validez oficial.
          </motion.p>
        </motion.div>

        <div className="flex flex-col lg:flex-row gap-8 items-center justify-center">
          {/* Program Card 1 */}
          <motion.div 
            initial={{ opacity: 0, y: 50 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: 0.1 }}
            className="w-full lg:w-[45%] bg-white rounded-2xl shadow-xl overflow-hidden group hover:-translate-y-2 transition-transform duration-300 border border-gray-100"
          >
            <div className="h-48 bg-[#0A2647] relative p-8 flex flex-col justify-end overflow-hidden">
              <div className="absolute top-0 right-0 p-8 opacity-10 group-hover:scale-110 transition-transform duration-500">
                <GraduationCap size={150} />
              </div>
              <span className="text-blue-300 font-bold tracking-widest uppercase text-sm mb-2 relative z-10">Graduarse</span>
              <h3 className="text-3xl font-bold text-white relative z-10">Preparatoria en 12 meses</h3>
              <p className="text-gray-300 mt-2 relative z-10 font-medium">con Capacitación laboral</p>
            </div>
            <div className="p-8">
              <p className="text-gray-600 mb-6 text-lg">
                Termina tu bachillerato con una formación integral preparándote para el empleo.
              </p>
              <div className="flex items-center gap-3 text-[#0A2647] font-semibold mb-8 bg-blue-50 p-4 rounded-lg">
                <CheckCircle className="text-blue-500" /> Con validez oficial SEP
              </div>
              <a href="/preregistro" className="block w-full text-center bg-blue-600 hover:bg-blue-700 text-white font-bold py-4 rounded-xl transition-colors duration-300 uppercase tracking-widest text-sm shadow-md">
                Inscríbete
              </a>
            </div>
          </motion.div>

          {/* Program Card 2 */}
          <motion.div 
            initial={{ opacity: 0, y: 50 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: 0.3 }}
            className="w-full lg:w-[45%] bg-white rounded-2xl shadow-xl overflow-hidden group hover:-translate-y-2 transition-transform duration-300 border border-gray-100"
          >
            <div className="h-48 bg-gradient-to-br from-blue-600 to-cyan-500 relative p-8 flex flex-col justify-end overflow-hidden">
              <div className="absolute top-0 right-0 p-8 opacity-10 group-hover:scale-110 transition-transform duration-500">
                <Award size={150} />
              </div>
              <span className="text-blue-100 font-bold tracking-widest uppercase text-sm mb-2 relative z-10">Graduación Rápida</span>
              <h3 className="text-3xl font-bold text-white relative z-10">Bachillerato General</h3>
              <p className="text-gray-100 mt-2 relative z-10 font-medium">en 6 meses</p>
            </div>
            <div className="p-8">
              <p className="text-gray-600 mb-6 text-lg">
                Obtén tu certificado de preparatoria de manera rápida y legal con un enfoque intensivo.
              </p>
              <div className="flex items-center gap-3 text-[#0A2647] font-semibold mb-8 bg-blue-50 p-4 rounded-lg">
                <CheckCircle className="text-blue-500" /> Con validez oficial SEP
              </div>
              <a href="/preregistro" className="block w-full text-center bg-[#0A2647] hover:bg-blue-900 text-white font-bold py-4 rounded-xl transition-colors duration-300 uppercase tracking-widest text-sm shadow-md">
                Inscríbete
              </a>
            </div>
          </motion.div>
        </div>

        {/* Modalities */}
        <motion.div 
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.8, delay: 0.5 }}
          className="mt-20 pt-16 border-t border-gray-100 text-center"
        >
          <h3 className="text-2xl font-bold text-[#0A2647] mb-8">Modalidades disponibles:</h3>
          <div className="flex flex-wrap justify-center gap-6">
            {modalities.map((modality, idx) => (
              <div key={idx} className="flex items-center gap-3 px-6 py-3 bg-gray-50 text-gray-700 font-semibold rounded-full border border-gray-200 shadow-sm hover:shadow-md hover:bg-white hover:text-blue-600 transition-all cursor-default">
                <span className="text-blue-500">{modality.icon}</span>
                {modality.name}
              </div>
            ))}
          </div>
        </motion.div>
      </div>
    </section>
  );
};

const Banner = () => {
  return (
    <div className="relative h-[40vh] min-h-[400px] flex items-center justify-center overflow-hidden">
      <div className="absolute inset-0 z-0">
        <div className="absolute inset-0 bg-[#0A2647]/70 z-10" />
        <img 
          src="https://picsum.photos/seed/edu3/1920/1080" 
          alt="Estudiantes graduándose" 
          className="w-full h-full object-cover" 
          data-ai-hint="graduation students"
        />
      </div>
      <div className="relative z-20 text-center px-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          whileInView={{ opacity: 1, scale: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
        >
          <h2 className="text-4xl md:text-5xl font-bold text-white mb-6">Estudiantes que se gradúan</h2>
          <a href="/preregistro" className="inline-block bg-white text-[#0A2647] px-8 py-4 rounded-full font-bold uppercase tracking-widest hover:bg-blue-50 transition-colors shadow-xl">
            Únete a ellos
          </a>
        </motion.div>
      </div>
    </div>
  );
}

const Contact = () => {
  const [formData, setFormData] = useState({ name: '', email: '', phone: '', message: '' });
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    setTimeout(() => {
      setSubmitted(false);
      setFormData({ name: '', email: '', phone: '', message: '' });
    }, 3000);
  };

  return (
    <section id="contacto" className="py-24 bg-gray-50">
      <div className="container mx-auto px-4 lg:px-8">
        <div className="max-w-6xl mx-auto bg-white rounded-3xl shadow-xl overflow-hidden flex flex-col lg:flex-row border border-gray-100">
          
          {/* Info Side */}
          <div className="lg:w-2/5 bg-[#0A2647] p-12 text-white flex flex-col justify-between">
            <div>
              <motion.div 
                initial={{ opacity: 0, x: -30 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
              >
                <h2 className="text-4xl font-bold mb-4">Contacto</h2>
                <p className="text-blue-200 mb-12 text-lg">
                  Deja tus datos para contactarte. Inicia tu proceso de inscripción hoy mismo.
                </p>

                <div className="space-y-8">
                  <div className="flex items-start gap-4">
                    <div className="bg-white/10 p-3 rounded-full">
                      <Phone className="text-blue-300" size={24} />
                    </div>
                    <div>
                      <p className="text-sm text-blue-300 font-semibold uppercase tracking-wider mb-1">Teléfono</p>
                      <p className="text-xl font-medium">735 2826206</p>
                    </div>
                  </div>
                  
                  <div className="flex items-start gap-4">
                    <div className="bg-white/10 p-3 rounded-full">
                      <Mail className="text-blue-300" size={24} />
                    </div>
                    <div>
                      <p className="text-sm text-blue-300 font-semibold uppercase tracking-wider mb-1">Email</p>
                      <p className="text-lg font-medium break-all">instituto.edu.emilianozapata@gmail.com</p>
                    </div>
                  </div>

                  <div className="flex items-start gap-4">
                    <div className="bg-white/10 p-3 rounded-full">
                      <MapPin className="text-blue-300" size={24} />
                    </div>
                    <div>
                      <p className="text-sm text-blue-300 font-semibold uppercase tracking-wider mb-1">Ubicación</p>
                      <p className="text-lg font-medium">México</p>
                    </div>
                  </div>
                </div>
              </motion.div>
            </div>
            
            <div className="mt-16">
              <a href="#" className="inline-flex items-center gap-2 text-white hover:text-blue-300 transition-colors">
                Síguenos en Facebook
              </a>
            </div>
          </div>

          {/* Form Side */}
          <div className="lg:w-3/5 p-12 lg:p-16">
            <h3 className="text-2xl font-bold text-[#0A2647] mb-8">Envíanos un mensaje</h3>
            
            {submitted ? (
              <motion.div 
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className="bg-green-50 border border-green-200 text-green-700 p-6 rounded-xl flex items-center gap-4"
              >
                <CheckCircle size={32} />
                <div>
                  <h4 className="font-bold text-lg">¡Mensaje enviado!</h4>
                  <p>Nos pondremos en contacto contigo pronto.</p>
                </div>
              </motion.div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">Nombre Completo</label>
                    <input 
                      type="text" 
                      required
                      value={formData.name}
                      onChange={(e) => setFormData({...formData, name: e.target.value})}
                      className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 transition-shadow"
                      placeholder="Juan Pérez"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">Teléfono</label>
                    <input 
                      type="tel" 
                      required
                      value={formData.phone}
                      onChange={(e) => setFormData({...formData, phone: e.target.value})}
                      className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 transition-shadow"
                      placeholder="123 456 7890"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Correo Electrónico</label>
                  <input 
                    type="email" 
                    required
                    value={formData.email}
                    onChange={(e) => setFormData({...formData, email: e.target.value})}
                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 transition-shadow"
                    placeholder="correo@ejemplo.com"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Mensaje (Opcional)</label>
                  <textarea 
                    rows={4}
                    value={formData.message}
                    onChange={(e) => setFormData({...formData, message: e.target.value})}
                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 transition-shadow resize-none"
                    placeholder="Me interesa el bachillerato en 6 meses..."
                  ></textarea>
                </div>
                <button 
                  type="submit" 
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-4 rounded-lg transition-colors shadow-lg shadow-blue-600/30 uppercase tracking-widest"
                >
                  Enviar Datos
                </button>
              </form>
            )}
          </div>
        </div>
      </div>
    </section>
  );
};

const Footer = () => {
  return (
    <footer className="bg-[#051426] text-gray-400 py-12 relative">
      <div className="container mx-auto px-4 lg:px-8 flex flex-col md:flex-row justify-between items-center gap-6">
        <div className="flex items-center gap-3">
          <GraduationCap className="text-blue-500" size={32} />
          <div>
            <h4 className="text-white font-bold text-lg leading-none">IEEZ</h4>
            <p className="text-xs uppercase tracking-wider">Instituto Educativo Emiliano Zapata</p>
          </div>
        </div>
        
        <p className="text-sm text-center md:text-left">
          © {new Date().getFullYear()} IEEZ. Todos los derechos reservados.
        </p>
        
        <button 
          onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
          className="bg-white/10 hover:bg-white/20 p-3 rounded-full text-white transition-colors"
          aria-label="Volver arriba"
        >
          <ChevronUp size={24} />
        </button>
      </div>
    </footer>
  );
};

export default function AcercaDeNosotrosPage() {
  return (
    <div className="font-sans text-gray-800 bg-white selection:bg-blue-500 selection:text-white">
      <Navbar />
      <main>
        <Hero />
        <About />
        <Banner />
        <Programs />
        <Contact />
      </main>
      <Footer />
    </div>
  );
}
