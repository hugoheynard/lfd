import { TestBed } from '@angular/core/testing';
import type { PlaceSiteResupplyPayload } from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import { PickupAddressesService } from '../../../b2b/reglages/pickup-addresses.service';
import { BakehouseResuppliesService } from '../bakehouse-resupplies.service';
import { BakehouseResupplyCard } from './bakehouse-resupply-card';

/**
 * « Envoyer un réassort » (lot R1d, 2026-10-21) : le fournil compose à
 * l'écran un réassort pour un point, puis l'envoie d'un geste — à part de la
 * demande en cours du comptoir, qu'aucun appel ne touche.
 */
class FakePickups {
  fail = false;
  list(): Promise<readonly { id: string; label: string }[]> {
    return this.fail
      ? Promise.reject(new Error('hors ligne'))
      : Promise.resolve([
          { id: 'site_v', label: 'Val Village' },
          { id: 'site_l', label: 'Le Labo' },
        ]);
  }
}

class FakeBakehouse {
  readonly sent: { siteId: string; payload: PlaceSiteResupplyPayload }[] = [];
  refuse = false;
  articles(): Promise<readonly { sku: string; name: string }[]> {
    return Promise.resolve([
      { sku: 'CRO', name: 'Croissant', categoryId: 'fam_morning', categoryName: 'Viennoiseries' },
      {
        sku: 'PAC',
        name: 'Pain au chocolat',
        categoryId: 'fam_morning',
        categoryName: 'Viennoiseries',
      },
    ]);
  }
  readonly namesAsked: string[] = [];
  usedNames(siteId: string): Promise<readonly string[]> {
    this.namesAsked.push(siteId);
    return Promise.resolve(siteId === 'site_v' ? ['Vitrine du matin', 'Goûter'] : []);
  }
  send(siteId: string, payload: PlaceSiteResupplyPayload): Promise<{ id: string }> {
    if (this.refuse) {
      return Promise.reject(new Error('refusé'));
    }
    this.sent.push({ siteId, payload });
    return Promise.resolve({ id: 'rs_new' });
  }
}

async function mount(pickups = new FakePickups(), bakehouse = new FakeBakehouse()) {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [BakehouseResupplyCard],
    providers: [
      { provide: PickupAddressesService, useValue: pickups },
      { provide: BakehouseResuppliesService, useValue: bakehouse },
    ],
  });
  const fixture = TestBed.createComponent(BakehouseResupplyCard);
  let sent = 0;
  fixture.componentInstance.sent.subscribe(() => (sent += 1));
  fixture.detectChanges();
  await new Promise((resolve) => setTimeout(resolve));
  await fixture.whenStable();
  fixture.detectChanges();
  const card = fixture.componentInstance;
  /** Choisit un article et sa quantité, puis « Ajouter ». */
  const add = (sku: string, quantity: number): void => {
    card['pickedSku'].set(sku);
    card['pickedQuantity'].set(quantity);
    fixture.detectChanges();
    (fixture.nativeElement as HTMLElement)
      .querySelector<HTMLButtonElement>('[data-bakehouse-add]')
      ?.click();
    fixture.detectChanges();
  };
  return {
    fixture,
    card,
    bakehouse,
    add,
    root: fixture.nativeElement as HTMLElement,
    sentCount: () => sent,
  };
}

async function clickSend(fixture: Awaited<ReturnType<typeof mount>>['fixture']): Promise<void> {
  (fixture.nativeElement as HTMLElement)
    .querySelector<HTMLButtonElement>('[data-bakehouse-send]')
    ?.click();
  await new Promise((resolve) => setTimeout(resolve));
  await fixture.whenStable();
  fixture.detectChanges();
}

describe('BakehouseResupplyCard', () => {
  it('compose pour un point, additionne un article ajouté deux fois, et envoie d’un geste', async () => {
    const { fixture, card, bakehouse, add, root, sentCount } = await mount();
    card['siteId'].set('site_v');
    root.querySelector<HTMLButtonElement>('[data-bakehouse-target="tomorrow"]')?.click();
    add('CRO', 10);
    add('PAC', 4);
    add('CRO', 2);

    expect(root.querySelector('[data-bakehouse-line="CRO"]')?.textContent).toContain(
      '12 × Croissant',
    );
    await clickSend(fixture);

    expect(bakehouse.sent).toEqual([
      {
        siteId: 'site_v',
        payload: {
          target: 'tomorrow',
          name: null,
          lines: [
            { sku: 'CRO', quantity: 12 },
            { sku: 'PAC', quantity: 4 },
          ],
        },
      },
    ]);
    expect(sentCount()).toBe(1);
    expect(root.querySelector('[data-bakehouse-done]')?.textContent).toContain(
      'Réassort envoyé à Val Village',
    );
    expect(root.querySelector('[data-bakehouse-line]')).toBeNull();
  });

  it('vise « au plus tôt » par défaut ; sans point ni ligne, rien ne part', async () => {
    const { fixture, card, bakehouse, add, root } = await mount();
    const send = () => root.querySelector<HTMLButtonElement>('[data-bakehouse-send]');

    expect(send()?.disabled).toBe(true);
    add('CRO', 3);
    expect(send()?.disabled).toBe(true);
    card['siteId'].set('site_l');
    fixture.detectChanges();
    await clickSend(fixture);

    expect(bakehouse.sent).toEqual([
      {
        siteId: 'site_l',
        payload: { target: 'asap', name: null, lines: [{ sku: 'CRO', quantity: 3 }] },
      },
    ]);
  });

  it('propose les noms déjà employés au point choisi, et envoie le nom avec le réassort (R1g)', async () => {
    const { fixture, card, bakehouse, add, root } = await mount();
    await card['pickSite']('site_v');
    fixture.detectChanges();

    expect(bakehouse.namesAsked).toEqual(['site_v']);
    expect(card['usedNames']()).toEqual(['Vitrine du matin', 'Goûter']);
    expect(root.querySelector('[data-resupply-name]')).not.toBeNull();

    card['name'].set('Vitrine du matin');
    add('CRO', 6);
    await clickSend(fixture);

    expect(bakehouse.sent[0]?.payload.name).toBe('Vitrine du matin');
    expect(card['name']()).toBe('');
  });

  it('retire une ligne avant l’envoi', async () => {
    const { fixture, add, root } = await mount();
    add('CRO', 3);
    add('PAC', 1);

    root
      .querySelector('[data-bakehouse-line="CRO"]')
      ?.querySelector<HTMLButtonElement>('[data-bakehouse-withdraw]')
      ?.click();
    fixture.detectChanges();

    expect(root.querySelector('[data-bakehouse-line="CRO"]')).toBeNull();
    expect(root.querySelector('[data-bakehouse-line="PAC"]')).not.toBeNull();
  });

  it('dit le refus du serveur, garde la liste, et ne prévient pas la page', async () => {
    const bakehouse = new FakeBakehouse();
    bakehouse.refuse = true;
    const { fixture, card, add, root, sentCount } = await mount(new FakePickups(), bakehouse);
    card['siteId'].set('site_v');
    add('CRO', 3);

    await clickSend(fixture);

    expect(sentCount()).toBe(0);
    expect(root.querySelector('fold-callout')?.textContent).toContain('pas pu être envoyé');
    expect(root.querySelector('[data-bakehouse-line="CRO"]')).not.toBeNull();
  });

  it('dit l’échec de lecture des points par un état fold', async () => {
    const pickups = new FakePickups();
    pickups.fail = true;
    const { root } = await mount(pickups);

    expect(root.querySelector('fold-empty-state')?.textContent).toContain(
      'Impossible de lire les points',
    );
  });
});
