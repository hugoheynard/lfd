import { type ComponentFixture, TestBed } from '@angular/core/testing';
import type { PackingResource } from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import { PackingResources } from './packing-resources';

/**
 * Un composant de présentation, entrées seulement : il affiche la marchandise
 * telle que servie — un reste incohérent avec `produced` et `allocated` compris.
 */

function resource(over: Partial<PackingResource> = {}): PackingResource {
  return {
    sku: 'CRO',
    productName: 'Croissant',
    produced: 40,
    allocated: 0,
    remaining: 40,
    awaitingProduction: false,
    ...over,
  };
}

function render(
  resources: readonly PackingResource[],
  hitSkus: ReadonlySet<string> = new Set(),
  searching = false,
): ComponentFixture<PackingResources> {
  TestBed.resetTestingModule();
  const fixture = TestBed.createComponent(PackingResources);
  fixture.componentRef.setInput('resources', resources);
  fixture.componentRef.setInput('hitSkus', hitSkus);
  fixture.componentRef.setInput('searching', searching);
  fixture.detectChanges();
  return fixture;
}

function said(element: Element | null | undefined): string {
  return (element?.textContent ?? '').replace(/\s+/gu, ' ').trim();
}

describe('la marchandise à répartir', () => {
  it('affiche le reste servi tel quel, et le signale quand il est négatif', () => {
    // 40 sortis, 0 pris : un écran qui calculerait lirait 40. Le serveur dit -7.
    const fixture = render([resource({ produced: 40, allocated: 0, remaining: -7 })]);
    const host: HTMLElement = fixture.nativeElement;
    const rows = host.querySelectorAll('.co-res');

    expect(rows).toHaveLength(1);
    expect(said(rows[0])).toContain('-7');
    expect(rows[0]?.classList.contains('is-short')).toBe(true);
  });

  it('garde l’attente et le manque distincts sur la même rangée', () => {
    const fixture = render([resource({ remaining: -10, awaitingProduction: true })]);
    const host: HTMLElement = fixture.nativeElement;
    const rows = host.querySelectorAll('.co-res');

    expect(rows).toHaveLength(1);
    expect(rows[0]?.classList.contains('is-awaiting')).toBe(true);
    expect(rows[0]?.classList.contains('is-short')).toBe(true);
    expect(said(rows[0])).toContain('En attente de la prod');
    expect(said(rows[0])).toContain('-10');
  });

  it('surligne les SKU donnés, et met le reste en retrait sans le retirer', () => {
    const fixture = render(
      [resource(), resource({ sku: 'BAG', productName: 'Baguette' })],
      new Set(['BAG']),
      true,
    );
    const host: HTMLElement = fixture.nativeElement;
    const rows = host.querySelectorAll('.co-res');

    expect(rows).toHaveLength(2);
    expect(rows[0]?.classList.contains('is-hit')).toBe(false);
    expect(rows[1]?.classList.contains('is-hit')).toBe(true);
    expect(host.classList.contains('is-searching')).toBe(true);
  });

  it('le dit quand la journée n’a aucun compte à produire', () => {
    const fixture = render([]);
    const host: HTMLElement = fixture.nativeElement;

    expect(host.querySelectorAll('.co-res')).toHaveLength(0);
    expect(said(host.querySelector('.co-res-none'))).toContain('Aucun compte à produire');
  });
});
