import { signal } from '@angular/core';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { FoldPanelRef } from 'fold-ng';
import { beforeEach, describe, expect, it } from 'vitest';

import { PackingQuantityDialog, type PackingQuantityDialogData } from './packing-quantity-dialog';

/**
 * Ce que ces cas tiennent : « tout » par défaut, la quantité tapée part
 * telle quelle, Entrée confirme, un refus garde le dialogue ouvert et se lit
 * dedans, un refus d'AVANT ne s'y montre pas.
 */

let sent: number[];
let accept: boolean;
let closes: number;
const busy = signal(false);
const refusal = signal<string | null>(null);

async function render(): Promise<{
  fixture: ComponentFixture<PackingQuantityDialog>;
  el: HTMLElement;
}> {
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
  const fixture = TestBed.createComponent(PackingQuantityDialog);
  const data: PackingQuantityDialogData = {
    gesture: 'withdrawal',
    title: 'Retirer « Croissant » de Sac 1',
    confirmLabel: 'Retirer',
    max: 10,
    busy,
    refusal,
    submit: (quantity) => {
      sent.push(quantity);
      if (!accept) {
        refusal.set('Plus rien à retirer.');
      }
      return Promise.resolve(accept);
    },
  };
  fixture.componentRef.setInput('data', data);
  fixture.detectChanges();
  await fixture.whenStable();
  return { fixture, el: fixture.nativeElement as HTMLElement };
}

async function settle(fixture: ComponentFixture<PackingQuantityDialog>): Promise<void> {
  for (let tick = 0; tick < 3; tick += 1) {
    await new Promise((resolve) => setTimeout(resolve));
    fixture.detectChanges();
  }
}

function type(el: HTMLElement, value: string): void {
  const input = el.querySelector('input');
  expect(input).not.toBeNull();
  if (input) {
    input.value = value;
    input.dispatchEvent(new Event('input'));
  }
}

describe('le dialogue « combien ? »', () => {
  beforeEach(() => {
    sent = [];
    accept = true;
    closes = 0;
    busy.set(false);
    refusal.set(null);
  });

  it('dit le geste, « tout » par défaut, et le confirme tel quel', async () => {
    const { fixture, el } = await render();
    expect(el.textContent).toContain('Retirer « Croissant » de Sac 1');
    expect(el.textContent).toContain('Tout : 10');
    el.querySelector<HTMLElement>('[data-confirm-withdrawal]')?.click();
    await settle(fixture);
    expect(sent).toEqual([10]);
    expect(closes).toBe(1);
  });

  it('Entrée confirme la quantité tapée', async () => {
    const { fixture, el } = await render();
    type(el, '4');
    await settle(fixture);
    el.querySelector('form')?.dispatchEvent(new Event('submit', { cancelable: true }));
    await settle(fixture);
    expect(sent).toEqual([4]);
  });

  it('un refus garde le dialogue ouvert et s’y lit', async () => {
    accept = false;
    const { fixture, el } = await render();
    el.querySelector<HTMLElement>('[data-confirm-withdrawal]')?.click();
    await settle(fixture);
    expect(closes).toBe(0);
    expect(el.querySelector('[data-quantity-refusal]')?.textContent).toContain(
      'Plus rien à retirer.',
    );
  });

  it('un refus d’avant l’ouverture ne s’y montre pas', async () => {
    refusal.set('Un autre geste.');
    const { el } = await render();
    expect(el.querySelector('[data-quantity-refusal]')).toBeNull();
  });

  it('pendant un geste, rien ne repart', async () => {
    busy.set(true);
    const { fixture, el } = await render();
    el.querySelector('form')?.dispatchEvent(new Event('submit', { cancelable: true }));
    await settle(fixture);
    expect(sent).toEqual([]);
  });
});
