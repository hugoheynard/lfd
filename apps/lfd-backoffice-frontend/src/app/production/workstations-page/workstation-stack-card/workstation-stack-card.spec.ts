import { HttpErrorResponse } from '@angular/common/http';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import type { WorkstationProductView, WorkstationView } from '@lfd/contracts';
import { beforeEach, describe, expect, it } from 'vitest';

import { WorkstationsService } from '../../workstations.service';
import { ORDER_MISMATCH, WorkstationStackCard, stackOf } from './workstation-stack-card';

/** Le service doublé : il retient chaque pile envoyée et sa clé d'intention. */
class FakeWorkstations {
  readonly sent: { id: string; skus: readonly string[]; key: string }[] = [];
  refuseNext: HttpErrorResponse | null = null;

  async reorderProducts(id: string, skus: readonly string[], key: string): Promise<void> {
    const refusal = this.refuseNext;
    this.refuseNext = null;
    this.sent.push({ id, skus, key });
    if (refusal !== null) {
      throw refusal;
    }
  }
}

let api: FakeWorkstations;

function product(
  sku: string,
  workstationId: string | null,
  position: number | null,
): WorkstationProductView {
  return {
    productSku: sku,
    productName: `Nom ${sku}`,
    family: null,
    workstationId,
    position,
    workstations: workstationId === null ? [] : [{ workstationId, finishes: true, position }],
    ordered: false,
    variants: [],
  };
}

const STATIONS: readonly WorkstationView[] = [
  { id: 'ws_a', name: 'Boulangerie', position: 0, trackingLevel: null },
  { id: 'ws_b', name: 'Pâtisserie', position: 1, trackingLevel: null },
];

/** Dans l'ordre du catalogue : la pile se lit sur `position`, puis sans place. */
const PRODUCTS: readonly WorkstationProductView[] = [
  product('X', 'ws_a', null),
  product('B', 'ws_a', 1),
  product('A', 'ws_a', 0),
  product('T', 'ws_b', null),
  product('Y', 'ws_a', null),
];

async function mount(
  canWrite = true,
): Promise<{ fixture: ComponentFixture<WorkstationStackCard>; changes: number[] }> {
  TestBed.configureTestingModule({
    imports: [WorkstationStackCard],
    providers: [{ provide: WorkstationsService, useValue: api }],
  });
  const fixture = TestBed.createComponent(WorkstationStackCard);
  fixture.componentRef.setInput('workstations', STATIONS);
  fixture.componentRef.setInput('products', PRODUCTS);
  fixture.componentRef.setInput('canWrite', canWrite);
  const changes: number[] = [];
  fixture.componentInstance.changed.subscribe(() => changes.push(1));
  fixture.detectChanges();
  await fixture.whenStable();
  return { fixture, changes };
}

const skusOf = (fixture: ComponentFixture<WorkstationStackCard>): string[] =>
  [...(fixture.nativeElement as HTMLElement).querySelectorAll('[data-stack-item]')].map(
    (item) => item.getAttribute('data-stack-item') ?? '',
  );

describe('la pile d’un poste', () => {
  beforeEach(() => {
    api = new FakeWorkstations();
    TestBed.resetTestingModule();
  });

  it('range les produits placés par leur place, puis les sans place dans l’ordre reçu', () => {
    expect(stackOf(PRODUCTS, 'ws_a').map((entry) => entry.productSku)).toEqual([
      'A',
      'B',
      'X',
      'Y',
    ]);
  });

  it('montre la pile du premier poste, puis celle du poste choisi', async () => {
    const { fixture } = await mount();
    expect(skusOf(fixture)).toEqual(['A', 'B', 'X', 'Y']);
    fixture.componentInstance['select']('ws_b');
    fixture.detectChanges();
    expect(skusOf(fixture)).toEqual(['T']);
  });

  it('montre le poste que la page demande, et reste réglable dans la carte', async () => {
    const { fixture } = await mount();
    fixture.componentRef.setInput('focus', 'ws_b');
    fixture.detectChanges();
    expect(skusOf(fixture)).toEqual(['T']);

    fixture.componentInstance['select']('ws_a');
    fixture.detectChanges();
    expect(skusOf(fixture)).toEqual(['A', 'B', 'X', 'Y']);
  });

  it('descendre envoie toute la pile, par intention, annonce la place, puis fait relire', async () => {
    const { fixture, changes } = await mount();
    await fixture.componentInstance['move'](0, 1);
    expect(api.sent).toEqual([{ id: 'ws_a', skus: ['B', 'A', 'X', 'Y'], key: expect.any(String) }]);
    expect(fixture.componentInstance['announcement']()).toBe(
      '« Nom A » est maintenant en place 2 sur 4.',
    );
    expect(changes).toHaveLength(1);
  });

  it('un dépôt par glisser déplace au rang visé', async () => {
    const { fixture } = await mount();
    await fixture.componentInstance['dropped']({ previousIndex: 3, currentIndex: 0 } as never);
    expect(api.sent[0]?.skus).toEqual(['Y', 'A', 'B', 'X']);
  });

  it('ne monte pas au-delà du haut', async () => {
    const { fixture } = await mount();
    await fixture.componentInstance['move'](0, -1);
    expect(api.sent).toEqual([]);
  });

  it('une pile périmée se dit, la pile envoyée est défaite, et la page relit', async () => {
    const { fixture, changes } = await mount();
    api.refuseNext = new HttpErrorResponse({ status: 409, error: { code: ORDER_MISMATCH } });
    await fixture.componentInstance['move'](1, -1);
    expect(fixture.componentInstance['refusal']()).toContain('La pile de ce poste a changé');
    expect(fixture.componentInstance['stack']().map((entry) => entry.productSku)).toEqual([
      'A',
      'B',
      'X',
      'Y',
    ]);
    expect(changes).toHaveLength(1);
  });

  it('flèche bas sur la poignée d’un produit le descend d’une place', async () => {
    const { fixture } = await mount();
    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelector('[data-stack-up], [data-stack-down]')).toBeNull();
    const handle = root.querySelector('[data-stack-item="A"] [data-reorder-handle]');
    expect(handle?.querySelector('button')?.getAttribute('aria-label')).toContain('« Nom A »');
    handle?.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    await fixture.whenStable();
    expect(api.sent[0]?.skus).toEqual(['B', 'A', 'X', 'Y']);
  });

  it('sans droit d’écriture : la pile se lit, sans poignée ni envoi', async () => {
    const { fixture } = await mount(false);
    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelector('[data-reorder-handle]')).toBeNull();
    await fixture.componentInstance['move'](0, 1);
    expect(api.sent).toEqual([]);
  });
});
