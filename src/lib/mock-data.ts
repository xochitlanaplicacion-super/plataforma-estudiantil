
import { User, Level, Career, Grade, Group, Subject } from './types';

export const mockUsers: User[] = [
  {
    id: 'u1',
    nombre: 'Super',
    apellidos: 'Admin User',
    curp: 'ADMIN000000HDFRR00',
    email: 'admin@eduflow.com',
    rol: 'superuser',
    estatus: 'activo',
    fecha_expiracion: '2025-12-31',
  },
  {
    id: 'u2',
    nombre: 'Profesor',
    apellidos: 'Xavier',
    curp: 'PROF000000HDFRR01',
    email: 'profesor@eduflow.com',
    rol: 'profesor',
    estatus: 'activo',
    fecha_expiracion: '2025-06-30',
    numero_empleado: 'EMP-001'
  },
  {
    id: 'u3',
    nombre: 'Juan',
    apellidos: 'Alumno Pérez',
    curp: 'ALUM000000HDFRR02',
    email: 'alumno@eduflow.com',
    rol: 'alumno',
    estatus: 'activo',
    fecha_expiracion: '2025-12-31',
    matricula: 'MAT-2024-001'
  },
  {
    id: 'u4',
    nombre: 'Expirado',
    apellidos: 'Pérez García',
    curp: 'EXP000000HDFRR03',
    email: 'expired@eduflow.com',
    rol: 'alumno',
    estatus: 'activo',
    fecha_expiracion: '2023-01-01',
  }
];

export const mockLevels: Level[] = [
  { id: 'l1', nombre: 'Universidad', descripcion: 'Nivel Superior', activo: true },
  { id: 'l2', nombre: 'Preparatoria', descripcion: 'Nivel Medio Superior', activo: true },
];

export const mockCareers: Career[] = [
  { id: 'c1', nivel_id: 'l1', nombre: 'Ingeniería en Sistemas', activo: true, clave: 'ISIC-2010' },
  { id: 'c2', nivel_id: 'l1', nombre: 'Licenciatura en Administración', activo: true, clave: 'LADM-2010' },
];

export const mockGrades: Grade[] = [
  { id: 'gr1', carrera_id: 'c1', nombre: '1er Semestre', orden: 1, activo: true },
  { id: 'gr2', carrera_id: 'c1', nombre: '2do Semestre', orden: 2, activo: true },
];

export const mockGroups: Group[] = [
  { id: 'gp1', grado_id: 'gr1', nombre: 'Grupo A', turno: 'Matutino', activo: true },
  { id: 'gp2', grado_id: 'gr1', nombre: 'Grupo B', turno: 'Vespertino', activo: true },
];

export const mockSubjects: Subject[] = [
  { id: 's1', carrera_id: 'c1', grado_id: 'gr1', nombre: 'Algoritmos y Estructuras', activo: true, clave: 'AED-001' },
  { id: 's2', carrera_id: 'c1', grado_id: 'gr1', nombre: 'Cálculo Diferencial', activo: true, clave: 'MAT-001' },
];
