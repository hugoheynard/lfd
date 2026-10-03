import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';

import type { BinLoadAttempt, FloorRow } from '../delivery-loading-rows';
import { LoadingRowPanel } from './loading-row-panel';

function row(n: number, codes: readonly string[], loaded: readonly string[] = []): FloorRow {
  return {
    row: n,
    label: `Rangée ${String(n)}`,
    x: 0,
    depth: 60,
    binCount: codes.length,
    loadedCount: loaded.length,
    stacks: [
      {
        stackIndex: n,
        binTypeName: 'Bac M',
        loaded: false,
        bins: codes.map((code, i) => ({
          key: `${code}:whole`,
          binId: code.toLowerCase(),
          code,
          typeLabel: 'Bac M',
          stopPosition: 6 - i,
          customerLabel: `Client ${String(i)}`,
          reference: `CMD-${String(i)}`,
          loaded: loaded.includes(code),
        })),
      },
    ],
  };
}

const ROWS = [row(1, ['AAA111', 'BBB222'], ['AAA111']), row(3, ['CCC333'])];

function render(loader: ((raw: string) => Promise<BinLoadAttempt>) | null) {
  const fixture = TestBed.createComponent(LoadingRowPanel);
  fixture.componentRef.setInput('row', ROWS[0]);
  fixture.componentRef.setInput('rows', ROWS);
  fixture.componentRef.setInput('current', true);
  fixture.componentRef.setInput('loader', loader);
  fixture.detectChanges();
  return fixture;
}

async function typeAndLoad(fixture: ReturnType<typeof render>, code: string): Promise<HTMLElement> {
  const element = fixture.nativeElement as HTMLElement;
  const input = element.querySelector<HTMLInputElement>('[data-row-typed] input');
  if (input === null) {
    throw new Error('champ absent');
  }
  input.value = code;
  input.dispatchEvent(new Event('input'));
  fixture.detectChanges();
  element.querySelector<HTMLButtonElement>('[data-row-load]')?.click();
  await fixture.whenStable();
  fixture.detectChanges();
  return element;
}

describe('LoadingRowPanel', () => {
  it('liste les bacs de chaque pile du bas vers le haut, avec leur état', () => {
    const element = render(null).nativeElement as HTMLElement;
    const bins = element.querySelectorAll('[data-row-bin]');
    expect(bins).toHaveLength(2);
    expect(bins[0]?.textContent).toContain('En bas');
    expect(bins[0]?.textContent).toContain('AAA111');
    expect(bins[0]?.textContent).toContain('arrêt 6');
    expect(bins[0]?.hasAttribute('data-loaded')).toBe(true);
    expect(bins[1]?.textContent).toContain('à charger');
    expect(element.querySelector('[data-row-current]')).not.toBeNull();
    expect(element.querySelector('[data-row-scan]')).toBeNull();
  });

  it('charge un bac d’une autre rangée sans le refuser, et dit où il va', async () => {
    const loader = vi.fn((raw: string) =>
      Promise.resolve<BinLoadAttempt>({
        accepted: true,
        payload: { code: raw },
        message: 'Bac chargé.',
      }),
    );
    const element = await typeAndLoad(render(loader), 'CCC333');

    expect(loader).toHaveBeenCalledWith('CCC333');
    expect(element.querySelector('[data-row-outcome]')?.textContent).toContain('Bac chargé.');
    expect(element.querySelector('[data-row-elsewhere]')?.textContent).toContain(
      'va rangée 3, pile 3',
    );
  });

  it('se tait sur la rangée quand le bac est bien d’ici, et montre un refus tel quel', async () => {
    const accepted = await typeAndLoad(
      render(() => Promise.resolve({ accepted: true, payload: { code: 'BBB222' }, message: 'ok' })),
      'BBB222',
    );
    expect(accepted.querySelector('[data-row-elsewhere]')).toBeNull();

    const refused = await typeAndLoad(
      render(() => Promise.resolve({ accepted: false, payload: null, message: 'Pas un bac.' })),
      'xx',
    );
    expect(refused.querySelector('[data-row-outcome]')?.textContent).toContain('Pas un bac.');
  });

  it('se fait défiler en vue à l’ouverture, sans animation si on la refuse', async () => {
    const scroll = vi.fn();
    const original = HTMLElement.prototype.scrollIntoView;
    HTMLElement.prototype.scrollIntoView = scroll;
    vi.stubGlobal('matchMedia', () => ({ matches: true }));
    try {
      const fixture = render(null);
      await fixture.whenStable();
      expect(scroll).toHaveBeenCalledWith({ behavior: 'auto', block: 'nearest' });
    } finally {
      HTMLElement.prototype.scrollIntoView = original;
      vi.unstubAllGlobals();
    }
  });
});
