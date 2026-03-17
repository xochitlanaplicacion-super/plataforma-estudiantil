import { User, Level, Career, Grade, Group, Subject } from './types';

export const mockUsers: User[] = [
  {
    id: 'u1',
    name: 'Admin User',
    email: 'admin@eduflow.com',
    role: 'superuser',
    status: 'active',
    expirationDate: '2025-12-31',
  },
  {
    id: 'u2',
    name: 'Profesor X',
    email: 'profesor@eduflow.com',
    role: 'profesor',
    status: 'active',
    expirationDate: '2025-06-30',
  },
  {
    id: 'u3',
    name: 'Juan Alumno',
    email: 'alumno@eduflow.com',
    role: 'alumno',
    status: 'active',
    expirationDate: '2025-12-31',
    levelId: 'l1',
    careerId: 'c1',
    gradeId: 'gr1',
    groupId: 'gp1',
  },
  {
    id: 'u4',
    name: 'Expirado Perez',
    email: 'expired@eduflow.com',
    role: 'alumno',
    status: 'active',
    expirationDate: '2023-01-01',
  }
];

export const mockLevels: Level[] = [
  { id: 'l1', name: 'Universidad', description: 'Nivel Superior' },
  { id: 'l2', name: 'Preparatoria', description: 'Nivel Medio Superior' },
];

export const mockCareers: Career[] = [
  { id: 'c1', levelId: 'l1', name: 'Ingeniería en Sistemas' },
  { id: 'c2', levelId: 'l1', name: 'Licenciatura en Administración' },
];

export const mockGrades: Grade[] = [
  { id: 'gr1', careerId: 'c1', name: '1er Semestre' },
  { id: 'gr2', careerId: 'c1', name: '2do Semestre' },
];

export const mockGroups: Group[] = [
  { id: 'gp1', gradeId: 'gr1', name: 'Grupo A' },
  { id: 'gp2', gradeId: 'gr1', name: 'Grupo B' },
];

export const mockSubjects: Subject[] = [
  { id: 's1', groupId: 'gp1', name: 'Algoritmos y Estructuras', professorId: 'u2' },
  { id: 's2', groupId: 'gp1', name: 'Cálculo Diferencial', professorId: 'u2' },
];
