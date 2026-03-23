
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
  doc_acta_nacimiento?: boolean;
  doc_certificado_estudios?: boolean;
  doc_curp?: boolean;
  doc_ine?: boolean;
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
