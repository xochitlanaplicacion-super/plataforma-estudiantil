// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FlyingCatCover } from '@/components/activities/flying-cat/FlyingCatCover';
import { FallingPilotCat, PilotCat, PilotCatWreck } from '@/components/activities/flying-cat/PilotCat';

afterEach(cleanup);

describe('Flying Cat cover and pilot illustration', () => {
  it('shows only touch guidance on mobile and starts only on request', () => {
    const onStart = vi.fn();
    render(<FlyingCatCover title="Amazing jobs" touch onStart={onStart} />);
    expect(screen.getByText('Control táctil')).toBeVisible();
    expect(screen.queryByText(/WASD/)).not.toBeInTheDocument();
    expect(screen.getByText(/botones de dirección/)).toBeVisible();
    expect(onStart).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Comenzar vuelo' }));
    expect(onStart).toHaveBeenCalledOnce();
  });

  it('shows keyboard guidance only on desktop and closes on request', () => {
    const onClose = vi.fn();
    render(<FlyingCatCover title="Flying Cat" touch={false} onStart={() => {}} onClose={onClose} />);
    expect(screen.getByText('Teclado WASD')).toBeVisible();
    expect(screen.queryByText(/botones de dirección/)).not.toBeInTheDocument();
    expect(screen.queryByText('Control táctil')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar juego' }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('preserves the watercolor cover and safely replaces a missing image with the SVG pilot', () => {
    const { container } = render(<FlyingCatCover title="Amazing jobs" touch onStart={() => {}} />);
    const image = screen.getByRole('img');
    expect(image).toHaveAttribute('src', '/games/flying-cat/images/cat-aviator.jpg');
    fireEvent.error(image);
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(container.querySelector('.fc-cover-fallback .fc-art-pilot')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Comenzar vuelo' })).toBeVisible();
  });

  it('defaults to normal difficulty and permits a local selection without starting the flight', () => {
    const onStart = vi.fn();
    render(<FlyingCatCover title="Jobs" touch onStart={onStart} />);
    const choices = within(screen.getByRole('radiogroup', { name: 'Dificultad del vuelo' }));
    expect(choices.getByRole('radio', { name: 'Normal' })).toBeChecked();
    fireEvent.click(choices.getByRole('radio', { name: 'Fácil' }));
    expect(choices.getByRole('radio', { name: 'Fácil' })).toBeChecked();
    expect(choices.getByRole('radio', { name: 'Normal' })).not.toBeChecked();
    expect(screen.getByText(/sin puntos extra por dificultad/)).toBeVisible();
    expect(onStart).not.toHaveBeenCalled();
  });

  it('uses the teacher difficulty as its controlled selection and reports changes to the parent', () => {
    const onDifficultyChange = vi.fn();
    const { rerender } = render(<FlyingCatCover title="Jobs" touch={false} difficulty="hard" onDifficultyChange={onDifficultyChange} onStart={() => {}} />);
    expect(screen.getByRole('radio', { name: 'Difícil' })).toBeChecked();
    fireEvent.click(screen.getByRole('radio', { name: 'Normal' }));
    expect(onDifficultyChange).toHaveBeenCalledExactlyOnceWith('normal');
    expect(screen.getByRole('radio', { name: 'Difícil' })).toBeChecked();
    rerender(<FlyingCatCover title="Jobs" touch={false} difficulty="normal" onDifficultyChange={onDifficultyChange} onStart={() => {}} />);
    expect(screen.getByRole('radio', { name: 'Normal' })).toBeChecked();
  });

  it('gives each SVG its own gradient IDs and uses only three reusable smoke particles', () => {
    const { container } = render(<><PilotCat protected /><PilotCat flying={false} /></>);
    const gradients = [...container.querySelectorAll('linearGradient')].map((gradient) => gradient.id);
    expect(new Set(gradients).size).toBe(gradients.length);
    expect(container.querySelectorAll('.fc-art-pilot--protected')).toHaveLength(1);
    expect(container.querySelectorAll('.fc-art-pilot--flying')).toHaveLength(1);
    expect(container.querySelectorAll('.fc-art-pilot')[0].querySelectorAll('.fc-art-puff')).toHaveLength(3);
  });

  it('shows a blue energy sphere only while the pilot is protected', () => {
    const { container, rerender } = render(<PilotCat protected />);
    const sphere = screen.getByTestId('flying-cat-energy-shield');
    expect(sphere.querySelector('circle')).toHaveAttribute('stroke', '#239aff');
    expect(container.querySelector('radialGradient')).toBeInTheDocument();
    rerender(<PilotCat protected={false} />);
    expect(screen.queryByTestId('flying-cat-energy-shield')).not.toBeInTheDocument();
  });

  it('shows a worried face on impact and restores the identical neutral face afterward', () => {
    const { container, rerender } = render(<PilotCat protected />);
    const neutralFace = container.querySelector('.fc-art-face')!.innerHTML;
    expect(screen.queryByTestId('flying-cat-worried-face')).not.toBeInTheDocument();
    rerender(<PilotCat protected worried />);
    expect(container.querySelector('.fc-art-pilot--worried')).toBeInTheDocument();
    expect(screen.getByTestId('flying-cat-worried-face')).toBeInTheDocument();
    expect(screen.getByTestId('flying-cat-energy-shield')).toBeInTheDocument();
    expect(container.querySelectorAll('.fc-art-puff')).toHaveLength(3);
    rerender(<PilotCat protected worried={false} />);
    expect(screen.queryByTestId('flying-cat-worried-face')).not.toBeInTheDocument();
    expect(container.querySelector('.fc-art-pilot--worried')).not.toBeInTheDocument();
    expect(container.querySelector('.fc-art-face')!.innerHTML).toBe(neutralFace);
  });

  it('provides separate empty wreck and falling pilot art for the last-life animation', () => {
    const { container } = render(<><PilotCatWreck className="wreck-instance" /><FallingPilotCat className="pilot-instance" /></>);
    expect(container.querySelector('.fc-art-wreck.wreck-instance')).toBeInTheDocument();
    expect(container.querySelectorAll('.fc-art-wreck-tail, .fc-art-wreck-nose, .fc-art-wreck-wing')).toHaveLength(3);
    expect(container.querySelector('.fc-art-falling-cat.pilot-instance')).toBeInTheDocument();
    expect(container.querySelector('.fc-art-fall-scarf')).toBeInTheDocument();
  });
});
