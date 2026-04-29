
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

