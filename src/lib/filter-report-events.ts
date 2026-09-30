export type FilterReportType = 'early' | 'extraordinary';

export type FilterReportRow = {
  id: string;
  group_event_id?: string | null;
  student_name: string;
  registered_at: string;
  _type: FilterReportType;
  [key: string]: unknown;
};

export type FilterReportEvent<Row extends FilterReportRow = FilterReportRow> = {
  key: string;
  type: FilterReportType;
  id: string;
  groupEventId: string | null;
  registeredAt: string;
  students: Row[];
};

export function groupFilterReportRows<Row extends FilterReportRow>(rows: readonly Row[]): FilterReportEvent<Row>[] {
  const events = new Map<string, FilterReportEvent<Row>>();

  for (const row of rows) {
    const groupEventId = row.group_event_id || null;
    const key = `${row._type}:${groupEventId || row.id}`;
    let event = events.get(key);
    if (!event) {
      event = {
        key,
        type: row._type,
        id: row.id,
        groupEventId,
        registeredAt: row.registered_at,
        students: [],
      };
      events.set(key, event);
    }
    if (!event.students.some((student) => student.id === row.id)) event.students.push(row);
    if (String(row.registered_at) > String(event.registeredAt)) event.registeredAt = row.registered_at;
  }

  return [...events.values()]
    .map((event) => ({
      ...event,
      students: event.students.sort((a, b) => a.student_name.localeCompare(b.student_name, 'es')),
    }))
    .sort((a, b) => String(b.registeredAt).localeCompare(String(a.registeredAt)));
}
