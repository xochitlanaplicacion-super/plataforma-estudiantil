export const MAX_FILTER_GROUP_STUDENTS = 5;

export type FilterGroupStudent = { id: string; full_name: string; group_id?: string };
export type VerifiedGuardianContact = {
  id: string;
  student_id: string;
  full_name: string;
  phone?: string | null;
  email?: string | null;
  verification_status?: string;
  active?: boolean;
};

export function addStudentToFilterGroup<T extends { id: string }>(students: T[], student: T): T[] {
  if (!student?.id || students.some((item) => item.id === student.id) || students.length >= MAX_FILTER_GROUP_STUDENTS) return students;
  return [...students, student];
}

export function removeStudentFromFilterGroup<T extends { id: string }>(students: T[], studentId: string): T[] {
  return students.filter((item) => item.id !== studentId);
}

export function getDraftFilterStudents<T extends { id?: unknown }>(draft: { students?: T[]; student?: T | null }): T[] {
  const candidates = Array.isArray(draft.students) ? draft.students : draft.student ? [draft.student] : [];
  return candidates.filter((student, index) => typeof student?.id === 'string' && student.id.length > 0 && candidates.findIndex((item) => item?.id === student.id) === index).slice(0, MAX_FILTER_GROUP_STUDENTS);
}

function normalizeName(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es-MX').replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' ');
}

function normalizePhone(value?: string | null) {
  const digits = String(value || '').replace(/\D/g, '');
  return digits.length === 12 && digits.startsWith('52') ? digits.slice(2) : digits;
}

function isVerified(contact: VerifiedGuardianContact) {
  return contact.active !== false && contact.verification_status === 'verified';
}

export function sameVerifiedGuardian(a: VerifiedGuardianContact, b: VerifiedGuardianContact): boolean {
  if (!isVerified(a) || !isVerified(b)) return false;
  const name = normalizeName(a.full_name);
  if (!name || name !== normalizeName(b.full_name)) return false;
  const phone = normalizePhone(a.phone);
  const email = String(a.email || '').trim().toLocaleLowerCase('es-MX');
  return Boolean((phone && phone === normalizePhone(b.phone)) || (email && email === String(b.email || '').trim().toLocaleLowerCase('es-MX')));
}

/** Devuelve el contacto oficial equivalente de cada alumno, o null si alguno no lo tiene. */
export function matchVerifiedGuardianForStudents(
  studentIds: string[],
  contacts: VerifiedGuardianContact[],
  selectedContactId: string,
): Record<string, string> | null {
  if (studentIds.length < 1 || studentIds.length > MAX_FILTER_GROUP_STUDENTS || new Set(studentIds).size !== studentIds.length) return null;
  const selected = contacts.find((item) => item.id === selectedContactId && item.student_id === studentIds[0] && isVerified(item));
  if (!selected) return null;
  const matches: Record<string, string> = { [studentIds[0]]: selected.id };
  for (const studentId of studentIds.slice(1)) {
    const contact = contacts.find((item) => item.student_id === studentId && sameVerifiedGuardian(selected, item));
    if (!contact) return null;
    matches[studentId] = contact.id;
  }
  return matches;
}
