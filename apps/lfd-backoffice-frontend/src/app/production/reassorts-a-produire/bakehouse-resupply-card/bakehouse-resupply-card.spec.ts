import { TestBed } from '@angular/core/testing';
import { FoldPanelHostService } from 'fold-ng';
import type {
  BakehouseResupplyDraftView,
  PlaceSiteResupplyPayload,
  SaveBakehouseResupplyDraftPayload,
  UpdateBakehouseResupplyDraftPayload,
} from '@lfd/contracts';
import { describe, expect, it, vi } from 'vitest';

import { PickupAddressesService } from '../../../b2b/reglages/pickup-addresses.service';
import { BakehouseResuppliesService } from '../bakehouse-resupplies.service';
import { BakehouseResupplyCard } from './bakehouse-resupply-card';

/**
 * « Envoyer un réassort » (lot R1d, 2026-10-21) : le fournil compose à
 * l'écran un réassort pour un point, dans une table par famille, puis l'envoie d'un geste — à part de la
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
      { sku: 'BAG', name: 'Baguette', categoryId: 'fam_bread', categoryName: 'Pains' },
    ]);
  }
  readonly namesAsked: string[] = [];
  usedNames(siteId: string): Promise<readonly string[]> {
    this.namesAsked.push(siteId);
    return Promise.resolve(siteId === 'site_v' ? ['Vitrine du matin', 'Goûter'] : []);
  }
  stored: BakehouseResupplyDraftView[] = [];
  readonly draftCalls: string[] = [];
  drafts(): Promise<readonly BakehouseResupplyDraftView[]> {
    return Promise.resolve(this.stored);
  }
  createDraft(
    payload: SaveBakehouseResupplyDraftPayload,
  ): Promise<{ id: string; version: number }> {
    this.draftCalls.push(`create:${JSON.stringify(payload.lines)}`);
    return Promise.resolve({ id: 'dr_new', version: 1 });
  }
  saveDraft(
    id: string,
    payload: UpdateBakehouseResupplyDraftPayload,
  ): Promise<{ id: string; version: number }> {
    this.draftCalls.push(`save:${id}:v${String(payload.version)}`);
    return Promise.resolve({ id, version: payload.version + 1 });
  }
  sendDraft(id: string, payload: UpdateBakehouseResupplyDraftPayload): Promise<{ id: string }> {
    this.draftCalls.push(`send:${id}:v${String(payload.version)}:${JSON.stringify(payload.lines)}`);
    return Promise.resolve({ id: 'rs_from_draft' });
  }
  discardDraft(id: string, version: number): Promise<void> {
    this.draftCalls.push(`discard:${id}:v${String(version)}`);
    this.stored = this.stored.filter((draft) => draft.id !== id);
    return Promise.resolve();
  }
  send(siteId: string, payload: PlaceSiteResupplyPayload): Promise<{ id: string }> {
    if (this.refuse) {
      return Promise.reject(new Error('refusé'));
    }
    this.sent.push({ siteId, payload });
    return Promise.resolve({ id: 'rs_new' });
  }
}

/** Le dialogue de quantité doublé : il rend ce qu'on lui a fait valider. */
class FakePanels {
  answer: number | undefined = undefined;
  readonly asked: unknown[] = [];
  open(_component: unknown, config: { data: unknown }): { closed: Promise<number | undefined> } {
    this.asked.push(config.data);
    return { closed: Promise.resolve(this.answer) };
  }
}

async function mount(
  pickups = new FakePickups(),
  bakehouse = new FakeBakehouse(),
  panels = new FakePanels(),
) {
  // jsdom n'a pas `matchMedia` : le bureau par défaut, chaque test bascule `phone`.
  vi.stubGlobal('matchMedia', () => ({
    matches: false,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }));
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [BakehouseResupplyCard],
    providers: [
      { provide: PickupAddressesService, useValue: pickups },
      { provide: BakehouseResuppliesService, useValue: bakehouse },
      { provide: FoldPanelHostService, useValue: panels },
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
  /** Clique un pas rapide de la ligne d'un article (négatif : retire). */
  const press = (sku: string, step: number): void => {
    const row = [
      ...(fixture.nativeElement as HTMLElement).querySelectorAll('[data-bakehouse-row]'),
    ].find((node) => node.getAttribute('data-bakehouse-row') === sku);
    row?.querySelector<HTMLButtonElement>(`[data-bakehouse-step="${String(step)}"]`)?.click();
    fixture.detectChanges();
  };
  /** Ajoute une quantité par les pas « + », du plus large au plus fin. */
  const add = (sku: string, quantity: number): void => {
    let rest = quantity;
    for (const step of [100, 50, 10, 1]) {
      while (rest >= step) {
        press(sku, step);
        rest -= step;
      }
    }
  };
  return {
    fixture,
    card,
    bakehouse,
    add,
    press,
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
    expect(root.querySelector('.product.asked')).toBeNull();
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

  it('filtre par famille au-dessus de la table, et dit où l’on a déjà saisi', async () => {
    const { fixture, card, add, root } = await mount();
    add('BAG', 2);

    expect(card['familyOptions']().map((option) => option.label)).toEqual([
      'Tout',
      'Viennoiseries',
      'Pains (1)',
    ]);
    card['family'].set('fam_bread');
    fixture.detectChanges();

    const rows = [...root.querySelectorAll('[data-bakehouse-row]')].map((row) =>
      row.getAttribute('data-bakehouse-row'),
    );
    expect(rows).toEqual(['BAG']);
  });

  it('retire par les pas « − », sans descendre sous zéro', async () => {
    const { fixture, card, bakehouse, add, press } = await mount();
    card['siteId'].set('site_v');
    add('CRO', 60);
    add('PAC', 1);

    press('CRO', -50);
    press('PAC', -10);
    await clickSend(fixture);

    expect(bakehouse.sent[0]?.payload.lines).toEqual([{ sku: 'CRO', quantity: 10 }]);
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
    expect(root.querySelector('.product.asked')?.textContent).toContain('Croissant');
  });

  it('en mobile, toucher la case ouvre le dialogue, et sa quantité est retenue', async () => {
    const panels = new FakePanels();
    panels.answer = 40;
    const { fixture, card, bakehouse, root } = await mount(
      new FakePickups(),
      new FakeBakehouse(),
      panels,
    );
    card['phone'].set(true);
    card['siteId'].set('site_v');
    fixture.detectChanges();

    root.querySelector<HTMLElement>('[data-bakehouse-row="CRO"] .cell')?.click();
    await fixture.whenStable();
    fixture.detectChanges();
    await clickSend(fixture);

    expect(panels.asked).toEqual([{ label: 'Croissant', quantity: null }]);
    expect(bakehouse.sent[0]?.payload.lines).toEqual([{ sku: 'CRO', quantity: 40 }]);
  });

  it('au bureau, la case se saisit sur place : aucun dialogue', async () => {
    const panels = new FakePanels();
    const { fixture, root } = await mount(new FakePickups(), new FakeBakehouse(), panels);

    root.querySelector<HTMLElement>('[data-bakehouse-row="CRO"] .cell')?.click();
    fixture.detectChanges();

    expect(panels.asked).toEqual([]);
  });

  describe('les brouillons (2026-10-28)', () => {
    const DRAFT: BakehouseResupplyDraftView = {
      id: 'dr_1',
      version: 3,
      siteId: 'site_l',
      target: 'tomorrow',
      name: 'Goûter',
      lines: [{ sku: 'PAC', quantity: 12 }],
      savedByName: 'Hugo',
      savedAt: '2026-10-28T10:00:00.000Z',
    };
    const click = (root: HTMLElement, selector: string): void =>
      root.querySelector<HTMLButtonElement>(selector)?.click();
    const settle = async (fixture: Awaited<ReturnType<typeof mount>>['fixture']) => {
      await new Promise((resolve) => setTimeout(resolve));
      await fixture.whenStable();
      fixture.detectChanges();
    };

    it('enregistre la carte comme brouillon, puis le réécrit à la version rendue', async () => {
      const { fixture, card, bakehouse, add, root } = await mount();
      card['siteId'].set('site_v');
      add('CRO', 2);

      click(root, '[data-bakehouse-save-draft]');
      await settle(fixture);
      add('CRO', 1);
      click(root, '[data-bakehouse-save-draft]');
      await settle(fixture);

      expect(bakehouse.draftCalls).toEqual([
        'create:[{"sku":"CRO","quantity":2}]',
        'save:dr_new:v1',
      ]);
      expect(root.querySelector('[data-bakehouse-done]')?.textContent).toContain(
        'Brouillon enregistré',
      );
    });

    it('reprend un brouillon, puis envoie CE QUE L’ÉCRAN MONTRE depuis lui', async () => {
      const bakehouse = new FakeBakehouse();
      bakehouse.stored = [DRAFT];
      const { fixture, add, root, sentCount } = await mount(new FakePickups(), bakehouse);

      click(root, '[data-bakehouse-draft="dr_1"] [data-bakehouse-draft-resume]');
      await settle(fixture);
      add('CRO', 1);
      await clickSend(fixture);

      expect(bakehouse.draftCalls).toEqual([
        'send:dr_1:v3:[{"sku":"CRO","quantity":1},{"sku":"PAC","quantity":12}]',
      ]);
      expect(bakehouse.sent).toEqual([]);
      expect(sentCount()).toBe(1);
    });

    it('supprime un brouillon, et vide la carte s’il était repris', async () => {
      const bakehouse = new FakeBakehouse();
      bakehouse.stored = [DRAFT];
      const { fixture, card, root } = await mount(new FakePickups(), bakehouse);
      click(root, '[data-bakehouse-draft="dr_1"] [data-bakehouse-draft-resume]');
      await settle(fixture);

      await card['discard'](DRAFT);
      await settle(fixture);

      expect(bakehouse.draftCalls).toEqual(['discard:dr_1:v3']);
      expect(card['lines']()).toEqual([]);
      expect(root.querySelector('[data-bakehouse-draft]')).toBeNull();
    });
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
