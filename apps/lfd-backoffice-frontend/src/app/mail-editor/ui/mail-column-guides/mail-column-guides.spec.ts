import { LiveAnnouncer } from '@angular/cdk/a11y';
import { TestBed } from '@angular/core/testing';
import type { ColumnWidthStep } from '@lfd/mail-blocks';
import { describe, expect, it, vi } from 'vitest';

import { MailColumnGuides } from './mail-column-guides';

const ROW_LEFT = 100;
const ROW_WIDTH = 600;

function render(widths: readonly ColumnWidthStep[], canWrite = true) {
  const announce = vi.fn(() => Promise.resolve());
  TestBed.configureTestingModule({
    providers: [{ provide: LiveAnnouncer, useValue: { announce } }],
  });
  const fixture = TestBed.createComponent(MailColumnGuides);
  fixture.componentRef.setInput('widths', widths);
  fixture.componentRef.setInput('canWrite', canWrite);
  fixture.detectChanges();
  const host: HTMLElement = fixture.nativeElement;
  host.getBoundingClientRect = () => new DOMRect(ROW_LEFT, 0, ROW_WIDTH, 100);
  const emitted: (readonly ColumnWidthStep[])[] = [];
  fixture.componentInstance.widthsChange.subscribe((next) => emitted.push(next));
  return { fixture, host, emitted, announce };
}

function grips(host: HTMLElement): HTMLElement[] {
  return Array.from(host.querySelectorAll<HTMLElement>('[role="separator"]'));
}

/** jsdom ne connaît pas toujours `PointerEvent` : la poignée ne lit que la position et le bouton. */
function pointer(target: HTMLElement, type: string, clientX: number): void {
  target.dispatchEvent(
    new MouseEvent(type, { bubbles: true, cancelable: true, clientX, button: 0 }),
  );
}

describe('MailColumnGuides', () => {
  it('trace une colonne et un trait par frontière, une poignée nommée par frontière', () => {
    const { host } = render([33, 33, 33]);
    expect(host.querySelectorAll('[data-guide-column]').length).toBe(3);
    expect(host.querySelectorAll('[data-guide-line]').length).toBe(2);
    const [first, second] = grips(host);
    expect(first?.getAttribute('aria-label')).toBe('Frontière entre la colonne 1 et la colonne 2');
    expect(first?.getAttribute('aria-orientation')).toBe('vertical');
    expect(first?.getAttribute('aria-valuenow')).toBe('33');
    expect(second?.getAttribute('aria-valuemin')).toBe('50');
    expect(second?.getAttribute('aria-valuemax')).toBe('83');
    expect(second?.getAttribute('aria-valuetext')).toBe('Colonne 2 à 33 %, colonne 3 à 33 %');
  });

  it('ne montre pas de poignée à qui ne peut pas écrire, mais garde la séparation', () => {
    const { host } = render([50, 50], false);
    expect(grips(host)).toEqual([]);
    expect(host.querySelectorAll('[data-guide-line]').length).toBe(1);
  });

  it('suit le pointeur sans rien enregistrer, puis enregistre une seule fois au lâcher', () => {
    const { fixture, host, emitted, announce } = render([50, 50]);
    const grip = grips(host)[0]!;
    const capture = vi.fn();
    grip.setPointerCapture = capture;
    pointer(grip, 'pointerdown', ROW_LEFT + 300);
    expect(capture).toHaveBeenCalled();
    pointer(grip, 'pointermove', ROW_LEFT + 350);
    pointer(grip, 'pointermove', ROW_LEFT + 400);
    fixture.detectChanges();
    expect(emitted).toEqual([]);
    const percents = Array.from(host.querySelectorAll('[data-guide-percent]')).map((label) =>
      label.textContent?.trim(),
    );
    expect(percents).toEqual(['67 %', '33 %']);
    expect(grips(host)[0]?.getAttribute('aria-valuenow')).toBe('67');
    pointer(grip, 'pointerup', ROW_LEFT + 400);
    fixture.detectChanges();
    expect(emitted).toEqual([[67, 33]]);
    expect(announce).toHaveBeenCalledWith(
      'Largeurs : colonne 1 à 67 %, colonne 2 à 33 %.',
      'polite',
    );
    expect(host.querySelectorAll('[data-guide-percent]').length).toBe(0);
  });

  it('garde au moins 2/12 à chaque colonne quand on tire au-delà', () => {
    const { host, emitted } = render([50, 50]);
    const grip = grips(host)[0]!;
    grip.setPointerCapture = vi.fn();
    pointer(grip, 'pointerdown', ROW_LEFT + 300);
    pointer(grip, 'pointermove', ROW_LEFT + 2000);
    pointer(grip, 'pointerup', ROW_LEFT + 2000);
    expect(emitted).toEqual([[83, 17]]);
  });

  it('n’enregistre rien quand le geste est interrompu', () => {
    const { host, emitted } = render([50, 50]);
    const grip = grips(host)[0]!;
    grip.setPointerCapture = vi.fn();
    pointer(grip, 'pointerdown', ROW_LEFT + 300);
    pointer(grip, 'pointermove', ROW_LEFT + 400);
    pointer(grip, 'pointercancel', ROW_LEFT + 400);
    pointer(grip, 'pointerup', ROW_LEFT + 400);
    expect(emitted).toEqual([]);
  });

  it('empêche le bloc de se glisser quand on prend la poignée', () => {
    const { host } = render([50, 50]);
    const grip = grips(host)[0]!;
    grip.setPointerCapture = vi.fn();
    const parentHeard = vi.fn();
    host.addEventListener('pointerdown', parentHeard);
    pointer(grip, 'pointerdown', ROW_LEFT + 300);
    expect(parentHeard).not.toHaveBeenCalled();
  });

  it('déplace d’un douzième aux flèches et va aux bornes avec Début / Fin', () => {
    const { host, emitted } = render([33, 33, 33]);
    const second = grips(host)[1]!;
    for (const key of ['ArrowRight', 'ArrowLeft', 'Home', 'End']) {
      second.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
    }
    expect(emitted).toEqual([
      [33, 42, 25],
      [33, 25, 42],
      [33, 17, 50],
      [33, 50, 17],
    ]);
  });

  it('égalise les colonnes au double-clic', () => {
    const { host, emitted } = render([25, 50, 25]);
    grips(host)[0]!.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    expect(emitted).toEqual([[33, 33, 33]]);
  });

  it('n’enregistre rien au double-clic quand les colonnes sont déjà égales', () => {
    const even = render([50, 50]);
    grips(even.host)[0]!.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    expect(even.emitted).toEqual([]);
  });

  it('pose le trait au milieu de la gouttière, et les colonnes entre les gouttières', () => {
    const { host } = render([25, 25, 50]);
    const line = host.querySelector<HTMLElement>('[data-guide-line]')!;
    expect(line.style.insetInlineStart).toContain('* 3 / 12 + 0.5 * var(--fold-space-md)');
    const [first, second] = Array.from(host.querySelectorAll<HTMLElement>('[data-guide-column]'));
    expect(first?.style.inlineSize).toBe(second?.style.inlineSize);
    expect(second?.style.insetInlineStart).toContain('* 3 / 12 + 1 * var(--fold-space-md)');
  });
});
