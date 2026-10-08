// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('next/dynamic', () => ({ default: () => ({ onClose }: { onClose: () => void }) => <section role="dialog" aria-label="Batalla Naval"><button onClick={onClose}>Cerrar naval</button></section> }));
import { ClassroomGameRepertoire } from '@/components/classroom-games/ClassroomGameRepertoire';
afterEach(cleanup);

describe('PvZ Quest repertoire', () => {
  it('preserves Naval Battle and opens a full-height authenticated Quest frame', () => {
    document.body.style.overflow = 'auto'; render(<ClassroomGameRepertoire/>);
    fireEvent.click(screen.getByRole('button', { name: 'Preparar Batalla Naval' }));
    expect(screen.getByRole('dialog', { name: 'Batalla Naval' })).toBeInTheDocument();
    fireEvent.click(screen.getByText('Cerrar naval'));
    const open = screen.getByRole('button', { name: 'Preparar Plantas vs Zombies Quest' });
    fireEvent.click(open);
    const frame = screen.getByTitle('Plantas vs Zombies Quest');
    expect(frame).toHaveAttribute('src', '/api/classroom/pvz-quest/play');
    expect(frame).toHaveAttribute('allow', 'fullscreen; autoplay');
    expect(frame.className).toContain('100dvh');
    expect(document.body.style.overflow).toBe('hidden');
    fireEvent.click(screen.getByRole('button', { name: 'Volver al repertorio de juegos' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(document.body.style.overflow).toBe('auto'); expect(open).toHaveFocus();
  });
  it('ignores foreign and wrong-source close messages', () => {
    render(<ClassroomGameRepertoire/>); fireEvent.click(screen.getByRole('button', { name: 'Preparar Plantas vs Zombies Quest' }));
    const frame = screen.getByTitle('Plantas vs Zombies Quest') as HTMLIFrameElement;
    const send = (origin: string, source: MessageEventSource | null) => act(() => { window.dispatchEvent(new MessageEvent('message', { origin, source, data: { type: 'pvz-quest-close' } })); });
    send('https://attacker.test', frame.contentWindow); send(window.location.origin, window);
    expect(screen.getByRole('dialog', { name: 'Plantas vs Zombies Quest' })).toBeInTheDocument();
    send(window.location.origin, frame.contentWindow);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
