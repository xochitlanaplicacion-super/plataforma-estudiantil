export type UserRole = 'superuser' | 'admin' | 'profesor' | 'alumno';

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  status: 'active' | 'inactive';
  expirationDate: string;
  levelId?: string;
  careerId?: string;
  gradeId?: string;
  groupId?: string;
}

export interface Level {
  id: string;
  name: string; // e.g., Universidad, Preparatoria
  description: string;
}

export interface Career {
  id: string;
  levelId: string;
  name: string;
}

export interface Grade {
  id: string;
  careerId: string;
  name: string;
}

export interface Group {
  id: string;
  gradeId: string;
  name: string;
}

export interface Subject {
  id: string;
  groupId: string;
  name: string;
  professorId?: string;
}

export interface Unit {
  id: string;
  subjectId: string;
  title: string;
  order: number;
}

export interface Topic {
  id: string;
  unitId: string;
  title: string;
  content: string;
  status: 'draft' | 'published';
  isVisible: boolean;
}

export interface Resource {
  id: string;
  topicId: string;
  type: 'pdf' | 'video' | 'link' | 'image';
  title: string;
  url: string;
}
