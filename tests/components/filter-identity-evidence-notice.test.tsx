// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FilterIdentityEvidenceNotice } from '@/components/filter/FilterIdentityEvidenceNotice';

afterEach(cleanup);

describe('FilterIdentityEvidenceNotice', () => {
  it('deja claro que sólo la identificación es opcional y actualiza los estados', () => {
    const { rerender } = render(<FilterIdentityEvidenceNotice identificationAttached={false} personPhotoAttached={false} />);
    expect(screen.getByText('Identificación opcional · foto de la persona obligatoria')).toBeVisible();
    expect(screen.getByText('Identificación: no adjuntada (opcional)')).toBeVisible();
    expect(screen.getByText('Foto de la persona: pendiente (obligatoria)')).toBeVisible();

    rerender(<FilterIdentityEvidenceNotice identificationAttached={true} personPhotoAttached={true} />);
    expect(screen.getByText('Identificación: adjuntada')).toBeVisible();
    expect(screen.getByText('Foto de la persona: lista')).toBeVisible();
  });

  it('abre y cierra los detalles dentro del formulario', () => {
    render(<FilterIdentityEvidenceNotice identificationAttached={false} personPhotoAttached={false} />);
    const toggle = screen.getByRole('button', { name: 'Ocultar detalles' });
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    fireEvent.click(toggle);
    expect(screen.getByRole('button', { name: 'Ver detalles' })).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('Foto de la persona: pendiente (obligatoria)')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Ver detalles' }));
    expect(screen.getByText('Foto de la persona: pendiente (obligatoria)')).toBeVisible();
  });

  it('permite omitir una identificación dañada del borrador', () => {
    const omit = vi.fn();
    render(<FilterIdentityEvidenceNotice identificationAttached={false} personPhotoAttached={true} onOmitDamagedIdentification={omit} />);
    fireEvent.click(screen.getByRole('button', { name: 'Continuar sin identificación' }));
    expect(omit).toHaveBeenCalledOnce();
  });
});
