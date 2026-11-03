import { type ComponentFixture, TestBed } from '@angular/core/testing';
import type { CounterIncompleteHandoverView } from '@lfd/contracts';
import { FoldPanelRef } from 'fold-ng';
import { describe, expect, it } from 'vitest';

import { CounterIncompleteHandoverService } from '../../comptoir/counter-incomplete-handover.service';
import {
  IncompleteHandoverDialog,
  type IncompleteHandoverDialogData,
  type IncompleteHandoverOutcome,
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
  readonly tokens: (string | null)[] = [];
  refuse: unknown = null;

  handOver(orderId: string, token: string | null = null): Promise<void> {
    this.tokens.push(token);
    if (this.refuse !== null) {
      return Promise.reject(this.refuse);
    }
    this.calls.push(orderId);
    return Promise.resolve();
  }
}

interface Rendered {
  readonly fixture: ComponentFixture<IncompleteHandoverDialog>;
  readonly closedWith: (IncompleteHandoverOutcome | undefined)[];
  readonly text: () => string;
  readonly button: (label: string) => HTMLButtonElement | null;
}

async function render(
  api: FakeApi,
  view: CounterIncompleteHandoverView,
  token: string | null = null,
): Promise<Rendered> {
  const closedWith: (IncompleteHandoverOutcome | undefined)[] = [];
  TestBed.configureTestingModule({
    imports: [IncompleteHandoverDialog],
    providers: [
      { provide: CounterIncompleteHandoverService, useValue: api },
      {
        provide: FoldPanelRef,
        useValue: new FoldPanelRef<IncompleteHandoverOutcome>(1, (result) =>
          closedWith.push(result),
        ),
      },
    ],
  });
  const fixture = TestBed.createComponent(IncompleteHandoverDialog);
  const data: IncompleteHandoverDialogData = {
    orderId: 'ord_1',
    reference: 'CMD-1042',
    view,
    token,
  };
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

  it('sans scan : le geste partiel part sans jeton', async () => {
    const api = new FakeApi();
    const { fixture, button } = await render(api, VIEW);
    button(PARTIAL)?.click();
    await fixture.whenStable();
    expect(api.tokens).toEqual([null]);
  });

  it('ouvert par un scan : le geste partiel envoie le jeton lu', async () => {
    const api = new FakeApi();
    const { fixture, button } = await render(api, VIEW, 'tok_1');
    button(PARTIAL)?.click();
    await fixture.whenStable();
    expect(api.tokens).toEqual(['tok_1']);
  });

  // Deux instants « locaux » : l'heure attendue ne dépend pas du fuseau du poste.
  const DECIDED_AT = new Date(2026, 10, 3, 9, 5).toISOString();
  const REMIT = 'Remettre la commande';

  it.each(['already_decided', 'already_authorized'] as const)(
    '%s, auteur nommé : « validé par <Nom> à <heure> », et « Remettre la commande » rend la main au rail',
    async (refusal) => {
      const api = new FakeApi();
      const { fixture, closedWith, text, button } = await render(api, {
        ...VIEW,
        refusal,
        decision: { decidedAt: DECIDED_AT, decidedByName: 'Camille Martin' },
      });
      expect(text()).toContain('Départ incomplet validé par Camille Martin à 9\u00a0h\u00a005.');
      expect(text()).toContain('le bon de livraison ne chiffre que ce qui part');
      expect(text()).toContain('Croissant nature');
      expect(button(PARTIAL)).toBeNull();
      button(REMIT)?.click();
      await fixture.whenStable();
      expect(closedWith).toEqual(['remit']);
      expect(api.calls).toEqual([]);
    },
  );

  it('décidé sans auteur lisible : « validé par un manager »', async () => {
    const { text, button } = await render(new FakeApi(), {
      ...VIEW,
      refusal: 'already_decided',
      decision: { decidedAt: DECIDED_AT, decidedByName: null },
    });
    expect(text()).toContain('Départ incomplet validé par un manager à 9\u00a0h\u00a005.');
    expect(button(REMIT)).not.toBeNull();
  });

  it('sac fermé : « Le colisage a fermé ce sac. », sans auteur, et « Remettre la commande »', async () => {
    const { fixture, closedWith, text, button } = await render(new FakeApi(), {
      ...VIEW,
      refusal: 'sealed',
      lines: [],
    });
    expect(text()).toContain('Le colisage a fermé ce sac.');
    expect(text()).not.toContain('validé par');
    button(REMIT)?.click();
    await fixture.whenStable();
    expect(closedWith).toEqual(['remit']);
  });

  it('sans refus : le geste partiel remet et ferme sur `partial`', async () => {
    const api = new FakeApi();
    const { fixture, closedWith, button } = await render(api, VIEW);
    expect(button('Annuler')).not.toBeNull();
    button(PARTIAL)?.click();
    await fixture.whenStable();
    expect(api.calls).toEqual(['ord_1']);
    expect(closedWith).toEqual(['partial']);
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
