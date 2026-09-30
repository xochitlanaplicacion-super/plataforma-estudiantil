import { describe, expect, it } from 'vitest';
import {
  MAX_FILTER_GROUP_STUDENTS,
  addStudentToFilterGroup,
  getDraftFilterStudents,
  matchVerifiedGuardianForStudents,
  removeStudentFromFilterGroup,
  sameVerifiedGuardian,
} from '@/lib/filter-batch';

const students = Array.from({ length: 6 }, (_, index) => ({ id: `student-${index + 1}`, full_name: `Alumno ${index + 1}` }));

describe('captura grupal de Control de Filtro', () => {
  it('admite de uno a cinco alumnos sin duplicados y permite quitarlos', () => {
    expect(MAX_FILTER_GROUP_STUDENTS).toBe(5);
    const first = addStudentToFilterGroup([], students[0]);
    expect(first.map((item) => item.id)).toEqual(['student-1']);
    expect(addStudentToFilterGroup(first, students[0])).toEqual(first);
    const group = students.slice(1, 5).reduce(addStudentToFilterGroup, first);
    expect(group).toHaveLength(5);
    expect(addStudentToFilterGroup(group, students[5])).toEqual(group);
    expect(removeStudentFromFilterGroup(group, 'student-3').map((item) => item.id))
      .toEqual(['student-1', 'student-2', 'student-4', 'student-5']);
  });

  it('recupera borradores antiguos de un alumno y elimina duplicados del borrador nuevo', () => {
    expect(getDraftFilterStudents({ student: students[0] })).toEqual([students[0]]);
    expect(getDraftFilterStudents({ students: [students[0], students[0], students[1]] }))
      .toEqual([students[0], students[1]]);
    expect(getDraftFilterStudents({ students: students })).toHaveLength(5);
  });

  it('reconoce un mismo padre verificado en registros separados de cada hermano', () => {
    const contacts = [
      { id: 'contact-1', student_id: 'student-1', full_name: 'José García', phone: '52 777 123 4567', verification_status: 'verified' },
      { id: 'contact-2', student_id: 'student-2', full_name: 'Jose Garcia', phone: '7771234567', verification_status: 'verified' },
      { id: 'contact-3', student_id: 'student-3', full_name: 'José García', email: 'padre@example.com', verification_status: 'verified' },
    ];
    expect(sameVerifiedGuardian(contacts[0], contacts[1])).toBe(true);
    expect(matchVerifiedGuardianForStudents(['student-1', 'student-2'], contacts, 'contact-1'))
      .toEqual({ 'student-1': 'contact-1', 'student-2': 'contact-2' });
    expect(matchVerifiedGuardianForStudents(['student-1', 'student-3'], contacts, 'contact-1')).toBeNull();
  });

  it('no reutiliza la autorización para otro padre, un contacto pendiente o un alumno sin contacto', () => {
    const contacts = [
      { id: 'father-1', student_id: 'student-1', full_name: 'José García', phone: '7771234567', verification_status: 'verified' },
      { id: 'other-father', student_id: 'student-2', full_name: 'José García', phone: '7777654321', verification_status: 'verified' },
      { id: 'pending', student_id: 'student-3', full_name: 'José García', phone: '7771234567', verification_status: 'pending' },
    ];
    expect(matchVerifiedGuardianForStudents(['student-1', 'student-2'], contacts, 'father-1')).toBeNull();
    expect(matchVerifiedGuardianForStudents(['student-1', 'student-3'], contacts, 'father-1')).toBeNull();
    expect(matchVerifiedGuardianForStudents(['student-1', 'student-4'], contacts, 'father-1')).toBeNull();
    expect(matchVerifiedGuardianForStudents(['student-1', 'student-1'], contacts, 'father-1')).toBeNull();
    expect(matchVerifiedGuardianForStudents([], contacts, 'father-1')).toBeNull();
  });
});
