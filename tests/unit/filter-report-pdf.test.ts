import { describe, expect, it, vi } from 'vitest';
import { jsPDF } from 'jspdf';
import { drawEvent } from '@/components/filter/FilterReports';
import { FilterReportRow, groupFilterReportRows } from '@/lib/filter-report-events';

vi.mock('@/lib/actions/filter-control', () => ({ getFilterReportPackets: vi.fn() }));

function commands(doc: jsPDF) {
  return (doc.internal.pages as unknown as string[][]).flat().join('\n');
}
function printedText(doc: jsPDF) {
  return [...commands(doc).matchAll(/\(([^)]*)\) Tj/g)].map((match) => match[1]).join(' ');
}

function reportRow(index: number, status: 'entregado' | 'rechazado' = 'entregado'): FilterReportRow {
  return {
    id: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
    group_event_id: 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa',
    student_name: `Nombre completo muy extenso del alumno numero ${index} con ambos apellidos paterno y materno`,
    level_name: 'Primaria', grade_name: 'Tercero', group_name: 'A',
    registered_at: '2026-09-29T15:00:00.000Z', departed_at: '2026-09-29T15:00:00.000Z',
    _type: 'extraordinary',
    pickup_person_name: 'Padre de familia', pickup_relationship: 'familiar',
    authorization_method: 'llamada', authorizer_name: 'Padre de familia',
    consent_status: status === 'entregado' ? 'confirmado' : 'rechazado',
    status, resolution_reason: status === 'rechazado' ? 'No se confirmó la autorización.' : null,
    delivering_teacher_name: status === 'entregado' ? 'Docente' : null,
    reporter_name: 'Encargada de filtro', final_observations: 'Registro de prueba.',
    pickup_person_photo_path: 'photo-person', final_handover_photo_path: status === 'entregado' ? 'photo-final' : null,
    pickup_signature_path: status === 'entregado' ? 'signature' : null,
  };
}

describe('PDF de expedientes grupales', () => {
  it('coloca cinco nombres completos en un expediente y reserva otra página para evidencias', async () => {
    const rows = Array.from({ length: 5 }, (_, index) => reportRow(index + 1));
    const event = groupFilterReportRows(rows)[0];
    const doc = new jsPDF({ unit: 'mm', format: 'a4' });
    await drawEvent(doc, event, {}, {});

    expect(doc.getNumberOfPages()).toBe(2);
    for (const row of rows) expect(printedText(doc)).toContain(row.student_name);
    expect(printedText(doc)).toContain('Firma de la persona que recibe al alumno');
  });

  it('mantiene el expediente individual en una página y no inventa firma en un rechazo', async () => {
    const event = groupFilterReportRows([reportRow(1, 'rechazado')])[0];
    const doc = new jsPDF({ unit: 'mm', format: 'a4' });
    await drawEvent(doc, event, {}, {});

    expect(doc.getNumberOfPages()).toBe(1);
    expect(printedText(doc)).toContain(event.students[0].student_name);
    expect(printedText(doc)).toContain('no se realizó la entrega ni se registró firma');
    expect(printedText(doc)).not.toContain('Firma de la persona que recibe al alumno');
  });

  it('mantiene en una página la entrega individual con firma', async () => {
    const event = groupFilterReportRows([reportRow(1)])[0];
    const doc = new jsPDF({ unit: 'mm', format: 'a4' });
    await drawEvent(doc, event, {}, {});

    expect(doc.getNumberOfPages()).toBe(1);
    expect(printedText(doc)).toContain('Firma de la persona que recibe al alumno');
  });

  it.each(['early', 'extraordinary'] as const)('muestra una ID genérica sin credencial en %s y conserva la foto de la persona', async (type) => {
    const row = { ...reportRow(1), _type: type };
    const event = groupFilterReportRows([row])[0];
    const doc = new jsPDF({ unit: 'mm', format: 'a4' });
    await drawEvent(doc, event, {}, {});

    expect(doc.getNumberOfPages()).toBe(1);
    expect(commands(doc)).toContain('Foto de identificación no adjuntada');
    expect(printedText(doc)).toContain('Persona que retira');
    expect(printedText(doc)).toContain('Entrega final');
  });

  it('indica que existe una identificación PDF en vez de declararla ausente', async () => {
    const row = { ...reportRow(1), identification_front_path: 'expediente/identificacion-frente.pdf' };
    const event = groupFilterReportRows([row])[0];
    const doc = new jsPDF({ unit: 'mm', format: 'a4' });
    await drawEvent(doc, event, {}, {});

    expect(commands(doc)).toContain('Identificación PDF en expediente digital.');
    expect(printedText(doc)).not.toContain('Foto de identificación no adjuntada');
  });
});
