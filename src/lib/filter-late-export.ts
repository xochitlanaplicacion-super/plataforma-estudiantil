import { FILTER_REASONS } from '@/lib/filter-control';

export interface FilterLateHistorySourceEntry {
  id: string;
  studentId: string;
  studentName: string;
  studentActive: boolean;
  groupId: string;
  arrivedAt: string;
  reasonCode: string;
  reasonDetail: string | null;
  evidenceAttached: boolean;
  reporterName: string;
  registeredByUserId: string | null;
  createdAt: string;
  clientRequestId: string | null;
  groupEventId: string | null;
}

export interface FilterLateHistoryExportEntry {
  id: string;
  arrivedAt: string;
  reasonCode: string;
  reasonLabel: string;
  reasonDetail: string | null;
  evidenceAttached: boolean;
  reporterName: string;
  registeredByUserId: string | null;
  createdAt: string;
  clientRequestId: string | null;
  groupEventId: string | null;
}

export interface FilterLateHistoryExportRow {
  studentId: string;
  studentName: string;
  studentActive: boolean;
  groupId: string;
  levelName: string;
  gradeName: string;
  groupName: string;
  totalLateEntries: number;
  entries: FilterLateHistoryExportEntry[];
}

export interface FilterLateHistoryGroup {
  id: string;
  levelId: string;
  gradeName: string;
  groupName: string;
}

export interface FilterLateHistoryLevel {
  id: string;
  name: string;
}

/** A keyset cursor keeps a complete export from stopping at PostgREST's row cap. */
export async function collectFilterLateHistoryPages<T extends { id: string }>(
  fetchPage: (afterId: string | null, pageSize: number) => Promise<T[]>,
  pageSize = 500,
): Promise<T[]> {
  if (!Number.isInteger(pageSize) || pageSize < 1) throw new Error('El tamaño de página no es válido.');
  const rows: T[] = [];
  let afterId: string | null = null;
  while (true) {
    const page = await fetchPage(afterId, pageSize);
    if (page.length > pageSize) throw new Error('La consulta devolvió más registros de los solicitados.');
    if (page.some((row, index) => !row.id || (index > 0 && row.id <= page[index - 1].id)
      || (afterId !== null && row.id <= afterId))) {
      throw new Error('El historial cambió de orden durante la exportación. Vuelve a intentarlo.');
    }
    rows.push(...page);
    if (page.length < pageSize) return rows;
    afterId = page[page.length - 1].id;
  }
}

export function buildFilterLateHistoryRows(
  source: readonly FilterLateHistorySourceEntry[],
  groups: readonly FilterLateHistoryGroup[],
  levels: readonly FilterLateHistoryLevel[],
): FilterLateHistoryExportRow[] {
  const groupsById = new Map(groups.map((group) => [group.id, group]));
  const levelsById = new Map(levels.map((level) => [level.id, level]));
  const labels = new Map<string, string>(FILTER_REASONS.map((reason) => [reason.value, reason.label]));
  const rowsByStudent = new Map<string, FilterLateHistoryExportRow>();

  for (const entry of source) {
    const group = groupsById.get(entry.groupId);
    const level = group && levelsById.get(group.levelId);
    if (!group || !level) throw new Error('Falta la información de grupo o nivel de un alumno del historial.');
    let row = rowsByStudent.get(entry.studentId);
    if (!row) {
      row = {
        studentId: entry.studentId,
        studentName: entry.studentName,
        studentActive: entry.studentActive,
        groupId: entry.groupId,
        levelName: level.name,
        gradeName: group.gradeName,
        groupName: group.groupName,
        totalLateEntries: 0,
        entries: [],
      };
      rowsByStudent.set(entry.studentId, row);
    }
    row.totalLateEntries += 1;
    row.entries.push({
      id: entry.id,
      arrivedAt: entry.arrivedAt,
      reasonCode: entry.reasonCode,
      reasonLabel: labels.get(entry.reasonCode) || entry.reasonCode,
      reasonDetail: entry.reasonDetail,
      evidenceAttached: entry.evidenceAttached,
      reporterName: entry.reporterName,
      registeredByUserId: entry.registeredByUserId,
      createdAt: entry.createdAt,
      clientRequestId: entry.clientRequestId,
      groupEventId: entry.groupEventId,
    });
  }

  return [...rowsByStudent.values()]
    .map((row) => ({
      ...row,
      entries: row.entries.sort((a, b) => b.arrivedAt.localeCompare(a.arrivedAt) || b.id.localeCompare(a.id)),
    }))
    .sort((a, b) => b.totalLateEntries - a.totalLateEntries
      || a.studentName.localeCompare(b.studentName, 'es')
      || a.studentId.localeCompare(b.studentId));
}
