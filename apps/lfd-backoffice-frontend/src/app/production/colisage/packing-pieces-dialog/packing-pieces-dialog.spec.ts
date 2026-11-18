import { signal } from '@angular/core';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { FoldPanelRef } from 'fold-ng';
import { beforeEach, describe, expect, it } from 'vitest';

import { PackingPiecesDialog, type PackingPiecesDialogData } from './packing-pieces-dialog';

/**
 * Le dialogue « combien, par produit ? » : la valeur de départ part telle
 * quelle, une quantité tapée la remplace, rien ne part hors bornes ni sans
 * une ligne quand il en faut une, un refus garde le dialogue ouvert.
 */

let sent: ReadonlyMap<string, number>[];
let accept: boolean;
let closes: number;
const busy = signal(false);
const refusal = signal<string | null>(null);

function render(
  needsOne: boolean,
  initial: number,
): {
  fixture: ComponentFixture<PackingPiecesDialog>;
  el: HTMLElement;
} {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      {
        provide: FoldPanelRef,
        useValue: new FoldPanelRef(1, () => {
          closes += 1;
        }),
      },
    ],
  });
  const fixture = TestBed.createComponent(PackingPiecesDialog);
  const data: PackingPiecesDialogData = {
    title: 'Problème',
    intro: 'La quantité vraiment là.',
    confirmLabel: 'Prévenir le superviseur',
    needsOne,
    lines: [
      { sku: 'CRO', productName: 'Croissant', saleUnit: 'piece', max: 12, initial },
      { sku: 'BAG', productName: 'Baguette', saleUnit: 'piece', max: 8, initial },
    ],
    busy,
    refusal,
    submit: (quantities) => {
      sent.push(quantities);
      if (!accept) {
        refusal.set('La décision est déjà prise.');
      }
      return Promise.resolve(accept);
    },
  };
  fixture.componentRef.setInput('data', data);
  fixture.detectChanges();
  return { fixture, el: fixture.nativeElement as HTMLElement };
}

async function settle(fixture: ComponentFixture<PackingPiecesDialog>): Promise<void> {
  for (let tick = 0; tick < 3; tick += 1) {
    await new Promise((resolve) => setTimeout(resolve));
    fixture.detectChanges();
  }
}

function type(el: HTMLElement, sku: string, value: string): void {
  const input = el.querySelector<HTMLInputElement>(`[data-sku="${sku}"] input`);
  expect(input).not.toBeNull();
  if (input) {
    input.value = value;
    input.dispatchEvent(new Event('input'));
  }
}

const confirmButton = (el: HTMLElement): HTMLButtonElement | null =>
  el.querySelector<HTMLButtonElement>('[data-confirm-pieces]');

describe('le dialogue « combien, par produit ? »', () => {
  beforeEach(() => {
    sent = [];
    accept = true;
    closes = 0;
    busy.set(false);
    refusal.set(null);
  });

  it('une ligne par produit, et la valeur de départ part telle quelle', async () => {
    const { fixture, el } = render(false, 12);
    expect(el.textContent).toContain('Croissant');
    expect(el.textContent).toContain('Baguette');
    type(el, 'BAG', '8');
    await settle(fixture);
    confirmButton(el)?.click();
    await settle(fixture);
    expect([...(sent[0] ?? new Map())]).toEqual([
      ['CRO', 12],
      ['BAG', 8],
    ]);
    expect(closes).toBe(1);
  });

  it('une quantité tapée remplace la valeur de départ', async () => {
    const { fixture, el } = render(false, 0);
    type(el, 'CRO', '3');
    await settle(fixture);
    confirmButton(el)?.click();
    await settle(fixture);
    expect(sent[0]?.get('CRO')).toBe(3);
    expect(sent[0]?.get('BAG')).toBe(0);
  });

  it('sans une ligne au-dessus de 0, « Pièces retrouvées » ne part pas', () => {
    const { el } = render(true, 0);
    expect(confirmButton(el)?.disabled).toBe(true);
  });

  it('un refus garde le dialogue ouvert et s’y lit', async () => {
    accept = false;
    const { fixture, el } = render(false, 0);
    confirmButton(el)?.click();
    await settle(fixture);
    expect(closes).toBe(0);
    expect(el.querySelector('[data-pieces-refusal]')?.textContent).toContain(
      'La décision est déjà prise.',
    );
  });

  it('un refus d’avant l’ouverture ne s’y montre pas', () => {
    refusal.set('Un autre geste.');
    const { el } = render(false, 0);
    expect(el.querySelector('[data-pieces-refusal]')).toBeNull();
  });
});
