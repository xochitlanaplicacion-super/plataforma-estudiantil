// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/hooks/use-institucion', () => ({ useInstitucion: vi.fn() }));

import { InstitutionLoadingView } from '@/components/shared/InstitutionLoading';
import { ThemeProvider } from '@/components/shared/ThemeProvider';
import { useInstitucion } from '@/hooks/use-institucion';
import type { InstitucionConfig } from '@/lib/types';

afterEach(() => cleanup());

describe('pantalla de carga institucional', () => {
  it('muestra el logo y nombre de la escuela cuando están disponibles', () => {
    render(<InstitutionLoadingView
      title="Preparando espacio docente"
      config={{ logo_url: 'https://school.example/logo.png', siglas: 'XOC', nombre_corto: 'Xochitlán' }}
      loading={false}
    />);

    expect(screen.getByRole('status')).toHaveTextContent('Preparando espacio docente');
    expect(screen.getByRole('status')).toHaveTextContent('Xochitlán');
    expect(document.querySelector('img')).toHaveAttribute('src', 'https://school.example/logo.png');
  });

  it('usa iniciales si la escuela no cargó un logo', () => {
    const view = render(<InstitutionLoadingView
      title="Preparando espacio del alumno"
      config={{ logo_url: '', siglas: 'ABC', nombre_corto: 'Academia ABC' }}
      loading={false}
    />);

    expect(screen.getByText('ABC')).toBeInTheDocument();
    expect(document.querySelector('img')).not.toBeInTheDocument();

    view.rerender(<InstitutionLoadingView
      title="Preparando espacio del alumno"
      config={{ logo_url: '/images/logo_placeholder.svg', siglas: 'ABC', nombre_corto: 'Academia ABC' }}
      loading={false}
    />);
    expect(screen.getByText('ABC')).toBeInTheDocument();
    expect(document.querySelector('img')).not.toBeInTheDocument();
  });

  it('sustituye una URL de imagen rota sin detener la pantalla', () => {
    render(<InstitutionLoadingView
      title="Preparando espacio docente"
      config={{ logo_url: 'https://school.example/broken.png', siglas: 'ABC', nombre_corto: 'Academia ABC' }}
      loading={false}
    />);

    fireEvent.error(document.querySelector('img')!);
    expect(screen.getByRole('status')).toHaveTextContent('Academia ABC');
    expect(screen.getByText('ABC')).toBeInTheDocument();
    expect(document.querySelector('img')).not.toBeInTheDocument();
  });

  it('no muestra un logo ajeno antes de resolver la institución', () => {
    render(<InstitutionLoadingView
      title="Preparando espacio docente"
      config={{ logo_url: 'https://school.example/logo.png', nombre_corto: 'Mi Institución' }}
      loading={true}
    />);

    expect(screen.getByRole('status')).toHaveTextContent('tu institución');
    expect(document.querySelector('img')).not.toBeInTheDocument();
  });

  it('usa el logo resuelto por el servidor en la primera entrada al sitio', () => {
    const config: InstitucionConfig = {
      id: 1,
      nombre_completo: 'Xochitlán',
      nombre_corto: 'Xochitlán',
      siglas: 'XOC',
      slogan: '',
      color_primario: '#0f172a',
      color_secundario: '#334155',
      temas_login: [],
      modo_tema_login: 'aleatorio',
      tema_fijo_index: 0,
      niveles_nombres: [],
      telefono_contacto: '',
      correo_contacto: '',
      horarios_atencion: [],
    };
    vi.mocked(useInstitucion).mockReturnValue({
      config,
      loading: true,
      refresh: vi.fn(),
    });

    render(<ThemeProvider initialBranding={{
      hasTenant: true,
      logo_url: 'https://school.example/logo.png',
      nombre_corto: 'Xochitlán',
      siglas: 'XOC',
    }}><div>Contenido</div></ThemeProvider>);

    expect(screen.getByRole('status')).toHaveTextContent('Cargando plataforma');
    expect(document.querySelector('img')).toHaveAttribute('src', 'https://school.example/logo.png');
    expect(screen.queryByText('Contenido')).not.toBeInTheDocument();
  });
});
