import { describe, expect, it } from 'vitest';
import { FilterReportRow, groupFilterReportRows } from '@/lib/filter-report-events';

const groupId = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa';
const row = (id: string, studentName: string, type: FilterReportRow['_type'], groupEventId: string | null = null): FilterReportRow => ({
  id,
  group_event_id: groupEventId,
  student_name: studentName,
  registered_at: '2026-09-29T15:00:00.000Z',
  _type: type,
});

describe('expedientes de filtro', () => {
  it('agrupa cinco hermanos en un expediente sin perder nombres ni duplicar filas', () => {
    const students = [
      row('1', 'Ana María Pérez del Río', 'extraordinary', groupId),
      row('2', 'Benjamín Pérez del Río', 'extraordinary', groupId),
      row('3', 'Camila Pérez del Río', 'extraordinary', groupId),
      row('4', 'Daniel Pérez del Río', 'extraordinary', groupId),
      row('5', 'Elena Pérez del Río', 'extraordinary', groupId),
    ];
    const events = groupFilterReportRows([...students, students[0]]);
    expect(events).toHaveLength(1);
    expect(events[0].students.map((student) => student.student_name)).toEqual(students.map((student) => student.student_name));
    expect(events[0].id).toBe(students[0].id);
    expect(events[0].key).toBe(`extraordinary:${groupId}`);
  });

  it('mantiene separados los registros anteriores y las dos bitácoras', () => {
    const events = groupFilterReportRows([
      row('legacy-1', 'Ana', 'early'),
      row('legacy-2', 'Benjamín', 'early'),
      row('new-1', 'Camila', 'early', groupId),
      row('new-2', 'Daniel', 'extraordinary', groupId),
    ]);
    expect(events).toHaveLength(4);
    expect(events.map((event) => event.key)).toEqual(expect.arrayContaining([
      'early:legacy-1', 'early:legacy-2', `early:${groupId}`, `extraordinary:${groupId}`,
    ]));
  });
});
