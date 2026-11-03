import { type ComponentFixture, TestBed } from '@angular/core/testing';
import type { CounterIncompleteHandoverView } from '@lfd/contracts';
import { FoldPanelRef } from 'fold-ng';
import { describe, expect, it } from 'vitest';

import { CounterIncompleteHandoverService } from '../../comptoir/counter-incomplete-handover.service';
import {
  IncompleteHandoverDialog,
  type IncompleteHandoverDialogData,
} from './incomplete-handover-dialog';

/**
 * Le dialogue du sac pas fini (lot C2) : ce qui part et ce qui ne part pas,
 * le geste partiel quand l'aperçu le permet, la phrase du refus sinon — et un
 * refus du geste qui reste dans le dialogue.
 */

const VIEW: CounterIncompleteHandoverView = {
  orderId: 'ord_1',
  refusal: null,
  handoverRefusalReason: null,
  lines: [
    {
      sku: 'CROI',
      productName: 'Croissant nature',
      saleUnit: 'piece',
      due: 12,
      departing: 10,
      notDeparting: 2,
    },
    {
      sku: 'SAUM',
      productName: 'Saumon fumé',
      saleUnit: 'weight',
      due: 1500,
      departing: 1250,
      notDeparting: 250,
    },
  ],
};

class FakeApi {
  readonly calls: string[] = [];
  refuse: unknown = null;

  handOver(orderId: string): Promise<void> {
    if (this.refuse !== null) {
      return Promise.reject(this.refuse);
    }
    this.calls.push(orderId);
    return Promise.resolve();
  }
}

interface Rendered {
  readonly fixture: ComponentFixture<IncompleteHandoverDialog>;
  readonly closedWith: (boolean | undefined)[];
  readonly text: () => string;
  readonly button: (label: string) => HTMLButtonElement | null;
}

async function render(api: FakeApi, view: CounterIncompleteHandoverView): Promise<Rendered> {
  const closedWith: (boolean | undefined)[] = [];
  TestBed.configureTestingModule({
    imports: [IncompleteHandoverDialog],
    providers: [
      { provide: CounterIncompleteHandoverService, useValue: api },
      {
        provide: FoldPanelRef,
        useValue: new FoldPanelRef<boolean>(1, (result) => closedWith.push(result)),
      },
    ],
  });
  const fixture = TestBed.createComponent(IncompleteHandoverDialog);
  const data: IncompleteHandoverDialogData = { orderId: 'ord_1', reference: 'CMD-1042', view };
  fixture.componentRef.setInput('data', data);
  await fixture.whenStable();
  const element = (): HTMLElement => fixture.nativeElement as HTMLElement;
  return {
    fixture,
    closedWith,
    text: () => element().textContent ?? '',
    button: (label) =>
      [...element().querySelectorAll('button')].find((b) =>
        (b.textContent ?? '').includes(label),
      ) ?? null,
  };
}

const PARTIAL = 'Remettre ce qui est au bac — le reste est abandonné';

describe('IncompleteHandoverDialog', () => {
  it('dit ce qui part et ce qui ne part pas, dans l’unité de chaque article', async () => {
    const { text } = await render(new FakeApi(), VIEW);
    expect(text()).toContain('Croissant nature');
    expect(text()).toMatch(/Au bac\s*:\s*10/);
    expect(text()).toMatch(/Ne part pas\s*:\s*2/);
    expect(text()).toContain('1,25 kg');
    expect(text()).toContain('250 g');
  });

  it('sans refus : le geste partiel remet et ferme sur `true`', async () => {
    const api = new FakeApi();
    const { fixture, closedWith, button } = await render(api, VIEW);
    expect(button('Annuler')).not.toBeNull();
    button(PARTIAL)?.click();
    await fixture.whenStable();
    expect(api.calls).toEqual(['ord_1']);
    expect(closedWith).toEqual([true]);
  });

  it('🔴 réglée par carte : pas de geste partiel, la phrase, et « Fermer » seul', async () => {
    const { text, button } = await render(new FakeApi(), { ...VIEW, refusal: 'card' });
    expect(button(PARTIAL)).toBeNull();
    expect(button('Annuler')).toBeNull();
    expect(text()).toContain('Réglée par carte');
    // Ce qui manque reste lisible : on dit pourquoi on ne le propose pas.
    expect(text()).toContain('Croissant nature');
  });

  it('un refus du retrait dit la phrase du serveur', async () => {
    const { text, button } = await render(new FakeApi(), {
      ...VIEW,
      refusal: 'handover_refused',
      handoverRefusalReason: 'Le transfert n’est pas reçu au site.',
      lines: [],
    });
    expect(button(PARTIAL)).toBeNull();
    expect(text()).toContain('Le transfert n’est pas reçu au site.');
  });

  it('rien au bac : renvoie à l’annulation', async () => {
    const { text } = await render(new FakeApi(), { ...VIEW, refusal: 'nothing_departs' });
    expect(text()).toContain('annulez la commande');
  });

  it('un refus du geste reste dans le dialogue', async () => {
    const api = new FakeApi();
    api.refuse = new Error('déjà remise');
    const { fixture, closedWith, button } = await render(api, VIEW);
    button(PARTIAL)?.click();
    await fixture.whenStable();
    expect(closedWith).toEqual([]);
    expect(
      (fixture.nativeElement as HTMLElement).querySelector('fold-callout[variant="alert"]'),
    ).not.toBeNull();
  });
});
