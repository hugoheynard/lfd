import { TestBed } from '@angular/core/testing';
import type { PackingLine as PackingLineView } from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import { PackingLine } from './packing-line';

/**
 * La ligne porte **deux raisons de ne rien pouvoir cocher**, et elles ne se
 * disent pas pareil : une commande déclarée prête ne revient pas dessus, une
 * ligne en attente de la prod redeviendra cochable. Le poste les compose ; c'est
 * ici qu'elles se prouvent séparément.
 */
function line(over: Partial<PackingLineView> = {}): PackingLineView {
  return {
    sku: 'CRO',
    productName: 'Croissant',
    quantity: 12,
    packed: false,
    initials: null,
    packedAt: null,
    awaitingProduction: false,
    ...over,
  };
}

function render(view: PackingLineView, locked = false): HTMLElement {
  TestBed.resetTestingModule();
  const fixture = TestBed.createComponent(PackingLine);
  fixture.componentRef.setInput('line', view);
  fixture.componentRef.setInput('locked', locked);
  fixture.detectChanges();
  const host: HTMLElement = fixture.nativeElement;
  return host;
}

describe('la ligne de colisage', () => {
  it('est cochable quand rien ne la fige', () => {
    const host = render(line());

    expect(host.querySelector<HTMLInputElement>('input')?.disabled).toBe(false);
    expect(host.querySelector('app-awaiting-badge')).toBeNull();
  });

  it('🔴 se fige, et le DIT, quand l’article n’est pas sorti du four', () => {
    const host = render(line({ awaitingProduction: true }));

    expect(host.querySelector<HTMLInputElement>('input')?.disabled).toBe(true);
    expect(host.classList.contains('is-awaiting')).toBe(true);
    expect(host.querySelector('app-awaiting-badge')?.textContent).toContain(
      'En attente de la prod',
    );
  });

  it('🔴 se fige aussi quand la commande est déclarée prête — sans badge', () => {
    // Rien ne revient dessus : ce n'est pas une attente, et le dire comme une
    // attente promettrait que la case rouvrira.
    const host = render(line(), true);

    expect(host.querySelector<HTMLInputElement>('input')?.disabled).toBe(true);
    expect(host.querySelector('app-awaiting-badge')).toBeNull();
  });

  it('nomme la case pour qui ne voit pas la ligne', () => {
    const host = render(line());

    // Sans ce nom, huit cases de suite s'annoncent « case à cocher » et rien
    // d'autre — elles deviennent indiscernables.
    expect(host.querySelector('input')?.getAttribute('aria-label')).toBe('12 Croissant');
  });
});
