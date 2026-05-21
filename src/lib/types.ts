
export type UserRole = 'superuser' | 'admin' | 'profesor' | 'alumno';
export type UserEstatus = 'activo' | 'inactivo' | 'suspendido';

export interface User {
  id: string;
  nombre: string;
  apellidos: string;
  curp: string;
  email: string;
  telefono?: string;
  rol: UserRole;
  estatus: UserEstatus;
  fecha_inicio?: string;
  fecha_expiracion?: string;
  fecha_nacimiento?: string;
  matricula?: string;
  numero_empleado?: string;
  password_plain?: string;
  carrera_id?: string;
  grupo_id?: string; 
  genero?: string;
  doc_acta_nacimiento?: boolean;
  doc_certificado_estudios?: boolean;
  doc_curp?: boolean;
  doc_ine?: boolean;
  created_at?: string;
  updated_at?: string;
  carreras?: { nombre: string };
  groups?: { nombre: string; turno: string };
}

export interface Ejercicio {
  id: string;
  tema_id: string;
  titulo: string;
  descripcion?: string;
  tipo: 'opcion_multiple' | 'verdadero_falso' | 'emparejamiento' | 'ordenar_secuencia' | 'completar_espacios' | 'sopa_letras' | 'flashcards' | 'texto';
  contenido?: any;
  orden: number;
  publicado: boolean;
  visible: boolean;
  created_by?: string;
  created_at?: string;
  updated_at?: string;
}

export interface Aspirante {
  id: string;
  nombre: string;
  apellidos: string;
  email: string;
  curp: string;
  telefono: string;
  fecha_nacimiento: string;
  nivel: string;
  carrera_id?: string;
  estatus?: string;
  notas?: string;
  genero?: string;
  is_archived?: boolean;
  created_at?: string;
}

export interface Level {
  id: string;
  nombre: string;
  descripcion?: string;
  activo: boolean;
  created_at?: string;
}

export interface Career {
  id: string;
  nivel_id: string;
  nombre: string;
  clave?: string;
  activo: boolean;
  created_at?: string;
  niveles?: { nombre: string };
}

export interface Grade {
  id: string;
  carrera_id: string;
  nombre: string;
  orden: number;
  activo: boolean;
  created_at?: string;
}

export interface Group {
  id: string;
  grado_id: string;
  nombre: string;
  turno?: string;
  activo: boolean;
  created_at?: string;
  grados?: { nombre: string };
}

export interface Subject {
  id: string;
  carrera_id: string;
  grado_id: string;
  nombre: string;
  clave?: string;
  descripcion?: string;
  activo: boolean;
  created_at?: string;
}

export interface Unit {
  id: string;
  materia_id: string;
  titulo: string;
  descripcion?: string;
  orden: number;
  activo: boolean;
  created_at?: string;
}

export interface Topic {
  id: string;
  unidad_id: string;
  titulo: string;
  contenido?: string;
  orden: number;
  publicado: boolean;
  visible: boolean;
  created_by?: string;
  updated_by?: string;
  created_at?: string;
  updated_at?: string;
}

export interface Resource {
  id: string;
  tema_id: string;
  tipo: 'pdf' | 'word' | 'powerpoint' | 'imagen' | 'video' | 'enlace' | 'otro';
  titulo: string;
  descripcion?: string;
  archivo_url?: string;
  enlace_url?: string;
  visible: boolean;
  publicado: boolean;
  fecha_publicacion?: string;
  fecha_expiracion?: string;
  created_by?: string;
  created_at?: string;
}

export interface MaterialApoyo {
  id: string;
  nivel_id: string;
  titulo: string; // Individual file name
  categoria?: string; // Global Title / Category
  descripcion?: string;
  archivo_url: string;
  tipo_archivo: 'pdf' | 'word' | 'excel' | 'powerpoint';
  tamano_bytes?: number;
  publicado: boolean;
  carreras_ids?: string[];
  created_by?: string;
  created_at?: string;
  niveles?: { nombre: string };
  profiles?: { nombre: string; apellidos: string };
}

export interface NivelNombre {
  clave: string;
  nombre: string;
}

export interface TemaLogin {
  id: string;
  bgImage: string;
  buttonColor: string;
  textColor: string;
  glassStyle: string;
}

export interface LandingTheme {
  id: string;
  primary: string;
  secondary: string;
  accent: string;
}

export interface LandingProgram {
  id: string;
  title: string;
  subtitle: string;
  duration: string;
  badge: string;
  description: string;
  validez: string;
  image: string;
  iconType: string;
  crop: string;
}

export interface LandingConfig {
  themes: LandingTheme[];
  active_theme_id: string;
  hero_title: string;
  hero_highlight: string;
  hero_subtitle: string;
  hero_badges: string;
  hero_image: string;
  mission_title: string;
  mission_text: string;
  about_title: string;
  about_text: string;
  about_image: string;
  banner_images: string[];
  programs: LandingProgram[];
}

export interface InstitucionConfig {
  id: number;
  nombre_completo: string;
  nombre_corto: string;
  siglas: string;
  slogan: string;
  direccion?: string;
  sitio_web?: string;
  url_plataforma?: string;
  logo_url?: string;
  logo_dark_url?: string;
  favicon_url?: string;
  color_primario: string;
  color_secundario: string;
  temas_login: TemaLogin[];
  modo_tema_login: 'aleatorio' | 'fijo';
  tema_fijo_index: number;
  niveles_nombres: NivelNombre[];
  telefono_contacto: string;
  correo_contacto: string;
  horarios_atencion: any[];
  landing_config?: LandingConfig;
  codigo_matricula?: string;
  updated_at?: string;
  // ─── Configuración SMTP para correo saliente ───────────────
  smtp_host?: string;
  smtp_port?: number;
  smtp_user?: string;
  smtp_password?: string;
  smtp_from_name?: string;
}
