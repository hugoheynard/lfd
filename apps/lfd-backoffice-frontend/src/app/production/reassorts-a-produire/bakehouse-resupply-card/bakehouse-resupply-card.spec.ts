import { TestBed } from '@angular/core/testing';
import { FoldPanelHostService } from 'fold-ng';
import type {
  BakehouseResupplyDraftView,
  PlaceSiteResupplyPayload,
  ResupplyArticleView,
  CreateBakehouseResupplyDraftPayload,
  UpdateBakehouseResupplyDraftPayload,
} from '@lfd/contracts';
import { describe, expect, it, vi } from 'vitest';

import { PickupAddressesService } from '../../../b2b/reglages/pickup-addresses.service';
import {
  baseMatin,
  FakeTemplatesService,
} from '../../../comptoir/resupply-templates/resupply-template.testing';
import { ResupplyTemplatesService } from '../../../comptoir/resupply-templates/resupply-templates.service';
import { BakehouseResuppliesService } from '../bakehouse-resupplies.service';
import { WorkstationsService } from '../../workstations.service';
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
  /** Un article au poids en plus (lot L2b-4) ; absent par défaut. */
  weighed = false;
  articles(): Promise<readonly ResupplyArticleView[]> {
    return Promise.resolve([
      {
        sku: 'CRO',
        name: 'Croissant',
        categoryId: 'fam_morning',
        categoryName: 'Viennoiseries',
        saleUnit: 'piece',
      },
      {
        sku: 'PAC',
        name: 'Pain au chocolat',
        categoryId: 'fam_morning',
        categoryName: 'Viennoiseries',
        saleUnit: 'piece',
      },
      {
        sku: 'BAG',
        name: 'Baguette',
        categoryId: 'fam_bread',
        categoryName: 'Pains',
        saleUnit: 'piece',
      },
      ...(this.weighed
        ? [
            {
              sku: 'GRA',
              name: 'Saumon gravlax',
              categoryId: 'fam_deli',
              categoryName: 'Traiteur',
              saleUnit: 'weight' as const,
            },
          ]
        : []),
    ]);
  }
  readonly namesAsked: string[] = [];
  usedNames(siteId: string): Promise<readonly string[]> {
    this.namesAsked.push(siteId);
    return Promise.resolve(siteId === 'site_v' ? ['Vitrine du matin', 'Goûter'] : []);
  }
  stored: BakehouseResupplyDraftView[] = [];
  readonly draftCalls: string[] = [];
  /** La liste des brouillons ne se lit pas (réseau). */
  draftsFail = false;
  drafts(): Promise<readonly BakehouseResupplyDraftView[]> {
    if (this.draftsFail) {
      return Promise.reject(new Error('réseau'));
    }
    return Promise.resolve(this.stored);
  }
  readonly draftKeys: string[] = [];
  /** L'heure portée par chaque écriture de brouillon (création, réécriture, envoi). */
  readonly draftArrivals: (string | null)[] = [];
  createDraft(
    payload: CreateBakehouseResupplyDraftPayload,
  ): Promise<{ id: string; version: number }> {
    this.draftKeys.push(payload.key);
    this.draftCalls.push(`create:${JSON.stringify(payload.lines)}`);
    this.draftArrivals.push(payload.arrivalBy ?? null);
    return Promise.resolve({ id: 'dr_new', version: 1 });
  }
  saveDraft(
    id: string,
    payload: UpdateBakehouseResupplyDraftPayload,
  ): Promise<{ id: string; version: number }> {
    this.draftCalls.push(`save:${id}:v${String(payload.version)}`);
    this.draftArrivals.push(payload.arrivalBy ?? null);
    return Promise.resolve({ id, version: payload.version + 1 });
  }
  sendDraft(id: string, payload: UpdateBakehouseResupplyDraftPayload): Promise<{ id: string }> {
    this.draftCalls.push(`send:${id}:v${String(payload.version)}:${JSON.stringify(payload.lines)}`);
    this.draftArrivals.push(payload.arrivalBy ?? null);
    return Promise.resolve({ id: 'rs_from_draft' });
  }
  discardDraft(id: string, version: number): Promise<void> {
    this.draftCalls.push(`discard:${id}:v${String(version)}`);
    this.stored = this.stored.filter((draft) => draft.id !== id);
    return Promise.resolve();
  }
  readonly sendKeys: string[] = [];
  send(siteId: string, payload: PlaceSiteResupplyPayload): Promise<{ id: string }> {
    this.sendKeys.push(payload.key);
    if (this.refuse) {
      return Promise.reject(new Error('refusé'));
    }
    this.sent.push({ siteId, payload });
    return Promise.resolve({ id: 'rs_new' });
  }
}

/** Le dialogue de quantité doublé : il rend ce qu'on lui a fait valider. */
class FakePanels {
  answer: unknown = undefined;
  readonly asked: unknown[] = [];
  open(_component: unknown, config: { data: unknown }): { closed: Promise<unknown> } {
    this.asked.push(config.data);
    return { closed: Promise.resolve(this.answer) };
  }
}

async function mount(
  pickups = new FakePickups(),
  bakehouse = new FakeBakehouse(),
  panels = new FakePanels(),
  draftId: string | null = null,
  phone = false,
  templates = new FakeTemplatesService(),
) {
  // jsdom n'a pas `matchMedia` : le bureau par défaut, le téléphone sur demande.
  vi.stubGlobal('matchMedia', () => ({
    matches: phone,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }));
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [BakehouseResupplyCard],
    providers: [
      { provide: PickupAddressesService, useValue: pickups },
      { provide: BakehouseResuppliesService, useValue: bakehouse },
      // Le rangement non lu : le filtre reste par famille, comme en mode boutique.
      {
        provide: WorkstationsService,
        useValue: { grouping: () => Promise.reject(new Error('non lu')) },
      },
      { provide: FoldPanelHostService, useValue: panels },
      { provide: ResupplyTemplatesService, useValue: templates },
    ],
  });
  const fixture = TestBed.createComponent(BakehouseResupplyCard);
  fixture.componentRef.setInput('draftId', draftId);
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
    templates,
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
    card['pickTarget']('tomorrow');
    card['arrivalBy'].set('06:30');
    add('CRO', 10);
    add('PAC', 4);
    add('CRO', 2);

    await clickSend(fixture);

    expect(bakehouse.sent).toEqual([
      {
        siteId: 'site_v',
        payload: {
          key: expect.any(String),
          target: 'tomorrow',
          name: null,
          arrivalBy: '06:30',
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
        payload: {
          key: expect.any(String),
          target: 'asap',
          name: null,
          arrivalBy: null,
          lines: [{ sku: 'CRO', quantity: 3 }],
        },
      },
    ]);
  });

  it('une composition neuve « pour demain » part sans heure proposée ; « au plus tôt » n’en a pas', async () => {
    const { fixture, card, bakehouse, add, root } = await mount();
    card['siteId'].set('site_v');
    add('CRO', 1);
    expect(root.querySelector('[data-bakehouse-arrival]')).toBeNull();

    card['pickTarget']('tomorrow');
    fixture.detectChanges();
    expect(root.querySelector('[data-bakehouse-arrival]')).not.toBeNull();
    expect(card['arrivalBy']()).toBe('');
    expect(root.querySelector<HTMLButtonElement>('[data-bakehouse-send]')?.disabled).toBe(true);

    // L'heure saisie ne part pas si l'on revient à « au plus tôt ».
    card['arrivalBy'].set('06:00');
    card['pickTarget']('asap');
    fixture.detectChanges();
    await clickSend(fixture);
    expect(bakehouse.sent[0]?.payload.arrivalBy).toBeNull();
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

  it('dit à l’écran que le rangement n’a pas pu être lu, au lieu de revenir en silence à la famille', async () => {
    const { fixture } = await mount();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('[data-grouping-lost]')?.textContent).toContain(
      "Le rangement du fournil n'a pas pu être lu",
    );
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

  /**
   * Régression C-A (audit du 2026-11-02) : l'envoi ne portait pas de clé —
   * deux clics, ou un renvoi après une réponse perdue, faisaient deux réassorts.
   */
  it('renvoie la MÊME clé après un refus, et en tire une neuve après un envoi réussi', async () => {
    const bakehouse = new FakeBakehouse();
    bakehouse.refuse = true;
    const { fixture, card, add } = await mount(new FakePickups(), bakehouse);
    card['siteId'].set('site_v');
    add('CRO', 3);

    await clickSend(fixture);
    bakehouse.refuse = false;
    await clickSend(fixture);
    card['siteId'].set('site_v');
    add('PAC', 2);
    await clickSend(fixture);

    expect(bakehouse.sendKeys).toHaveLength(3);
    const [refused, retried, next] = bakehouse.sendKeys;
    expect(retried).toBe(refused);
    expect(next).not.toBe(retried);
  });

  it('en mobile, toucher la case ouvre le dialogue, et sa quantité est retenue', async () => {
    const panels = new FakePanels();
    panels.answer = 40;
    const { fixture, card, bakehouse, root } = await mount(
      new FakePickups(),
      new FakeBakehouse(),
      panels,
      null,
      true,
    );
    card['siteId'].set('site_v');
    fixture.detectChanges();

    root.querySelector<HTMLElement>('[data-bakehouse-row="CRO"] .cell')?.click();
    await fixture.whenStable();
    fixture.detectChanges();
    await clickSend(fixture);

    expect(panels.asked).toEqual([{ label: 'Croissant', quantity: null, saleUnit: 'piece' }]);
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
      arrivalBy: null,
      suggestedArrivalBy: '06:30',
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

    it('reprend le brouillon de son adresse, puis envoie CE QUE L’ÉCRAN MONTRE depuis lui', async () => {
      const bakehouse = new FakeBakehouse();
      bakehouse.stored = [DRAFT];
      const { fixture, card, add, sentCount } = await mount(
        new FakePickups(),
        bakehouse,
        new FakePanels(),
        'dr_1',
      );
      await settle(fixture);

      expect(card['siteId']()).toBe('site_l');
      expect(card['name']()).toBe('Goûter');
      add('CRO', 1);
      await clickSend(fixture);

      expect(bakehouse.draftCalls).toEqual([
        'send:dr_1:v3:[{"sku":"CRO","quantity":1},{"sku":"PAC","quantity":12}]',
      ]);
      expect(bakehouse.sent).toEqual([]);
      expect(sentCount()).toBe(1);
    });

    it('reprend l’heure du brouillon, sinon celle que son point demande (H1)', async () => {
      const bakehouse = new FakeBakehouse();
      bakehouse.stored = [DRAFT, { ...DRAFT, id: 'dr_2', arrivalBy: '05:45' }];
      const first = await mount(new FakePickups(), bakehouse, new FakePanels(), 'dr_1');
      await settle(first.fixture);
      expect(first.card['arrivalBy']()).toBe('06:30');

      const second = await mount(new FakePickups(), bakehouse, new FakePanels(), 'dr_2');
      await settle(second.fixture);
      expect(second.card['arrivalBy']()).toBe('05:45');
      await clickSend(second.fixture);
      expect(bakehouse.draftArrivals.at(-1)).toBe('05:45');
    });

    it('enregistre un brouillon « pour demain » sans heure, mais ne l’envoie pas', async () => {
      const { fixture, card, bakehouse, add, root } = await mount();
      card['siteId'].set('site_v');
      card['pickTarget']('tomorrow');
      add('CRO', 2);
      fixture.detectChanges();

      expect(root.querySelector<HTMLButtonElement>('[data-bakehouse-send]')?.disabled).toBe(true);
      expect(root.querySelector('[data-bakehouse-arrival]')?.textContent).toContain('ne part pas');
      click(root, '[data-bakehouse-save-draft]');
      await settle(fixture);
      expect(bakehouse.draftCalls).toEqual(['create:[{"sku":"CRO","quantity":2}]']);
      expect(bakehouse.draftArrivals).toEqual([null]);

      card['arrivalBy'].set('07:00');
      click(root, '[data-bakehouse-save-draft]');
      await settle(fixture);
      expect(bakehouse.draftArrivals.at(-1)).toBe('07:00');
    });

    it('fige le point d’un brouillon repris ; une carte neuve le laisse choisir', async () => {
      const bakehouse = new FakeBakehouse();
      bakehouse.stored = [DRAFT];
      const resumed = await mount(new FakePickups(), bakehouse, new FakePanels(), 'dr_1');
      await settle(resumed.fixture);
      const fresh = await mount();

      expect(resumed.card['siteLocked']()).toBe(true);
      expect(fresh.card['siteLocked']()).toBe(false);
    });

    /**
     * Régression (audit du 2026-11-03) : une liste illisible était annoncée
     * « brouillon envoyé ou supprimé ». C'est un échec de lecture, dit par un
     * état fold qui se réessaie — et la réussite efface l'annonce.
     */
    it('dit un échec de lecture, pas un brouillon supprimé, et se réessaie', async () => {
      const bakehouse = new FakeBakehouse();
      bakehouse.stored = [DRAFT];
      bakehouse.draftsFail = true;
      const { fixture, card, root } = await mount(
        new FakePickups(),
        bakehouse,
        new FakePanels(),
        'dr_1',
      );
      await settle(fixture);

      expect(root.querySelector('[data-bakehouse-draft-missing]')).toBeNull();
      expect(root.querySelector('[data-bakehouse-draft-unreadable]')?.textContent).toContain(
        'Impossible de lire le brouillon',
      );

      bakehouse.draftsFail = false;
      await card['load']();
      await settle(fixture);
      expect(root.querySelector('[data-bakehouse-draft-unreadable]')).toBeNull();
      expect(card['siteId']()).toBe('site_l');
    });

    /** Régression (audit du 2026-11-03) : « Réessayer » reprenait le brouillon par-dessus la saisie. */
    it('ne réécrase pas la saisie d’un brouillon déjà repris quand on réessaie', async () => {
      const bakehouse = new FakeBakehouse();
      bakehouse.stored = [DRAFT];
      const { fixture, card, add } = await mount(
        new FakePickups(),
        bakehouse,
        new FakePanels(),
        'dr_1',
      );
      await settle(fixture);
      add('CRO', 5);
      const typed = card['lines']();

      await card['load']();
      await settle(fixture);

      expect(card['lines']()).toEqual(typed);
    });

    it('dit qu’un brouillon demandé n’est plus ouvert, et part d’une carte vide', async () => {
      const { fixture, card, root } = await mount(
        new FakePickups(),
        new FakeBakehouse(),
        new FakePanels(),
        'dr_gone',
      );
      await settle(fixture);

      expect(root.querySelector('[data-bakehouse-draft-missing]')).not.toBeNull();
      expect(card['lines']()).toEqual([]);
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

  /** Lot L2b-4 : un article au poids se saisit en grammes, sans pas de pièces. */
  it('saisit un article au poids en grammes, le relit en kilos et envoie des grammes', async () => {
    const bakehouse = new FakeBakehouse();
    bakehouse.weighed = true;
    const { fixture, card, root, add } = await mount(undefined, bakehouse);
    const row = (sku: string) =>
      [...root.querySelectorAll('[data-bakehouse-row]')].find(
        (node) => node.getAttribute('data-bakehouse-row') === sku,
      );

    expect(row('GRA')?.querySelector('[data-bakehouse-step="500"]')?.textContent?.trim()).toBe(
      '+500 g',
    );
    expect(row('GRA')?.querySelectorAll('[data-bakehouse-step]')).toHaveLength(6);
    expect(row('CRO')?.querySelectorAll('[data-bakehouse-step]')).toHaveLength(8);
    card['setQuantity']('GRA', 1250);
    add('CRO', 12);
    fixture.detectChanges();
    expect(root.querySelector('[data-bakehouse-weight="GRA"]')?.textContent).toContain('1,25 kg');
    expect(root.querySelector('[data-bakehouse-send]')?.textContent).toContain(
      '2 article(s), 12 pièces · 1,25 kg',
    );
    card['siteId'].set('site_l');
    fixture.detectChanges();
    await clickSend(fixture);

    expect(bakehouse.sent[0]?.payload.lines).toEqual([
      { sku: 'CRO', quantity: 12 },
      { sku: 'GRA', quantity: 1250 },
    ]);
  });
});

describe('BakehouseResupplyCard — partir d’un modèle (commander.md § 6, T4)', () => {
  async function settled(fixture: Awaited<ReturnType<typeof mount>>['fixture']): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve));
    await fixture.whenStable();
    fixture.detectChanges();
  }

  it('lit les modèles du point choisi', async () => {
    const { fixture, card, templates } = await mount();
    await card['pickSite']('site_v');
    await settled(fixture);
    expect(templates.calls).toEqual(['list site_v']);
    expect(card['templates']().map((template) => template.name)).toEqual(['Base matin']);
  });

  it('remplit la carte vide sans rien écrire, reprend la visée et le nom, et nomme les écartés', async () => {
    const { fixture, card, bakehouse, root, templates } = await mount();
    await card['pickSite']('site_v');
    await card['fromTemplate'](baseMatin());
    await settled(fixture);
    expect(card['lines']()).toEqual([{ sku: 'CRO', quantity: 12 }]);
    expect(card['target']()).toBe('tomorrow');
    expect(card['name']()).toBe('Base matin');
    expect(card['arrivalBy']()).toBe('');
    expect(bakehouse.sent).toEqual([]);
    expect(bakehouse.draftCalls).toEqual([]);
    expect(templates.calls).toEqual(['list site_v']);
    expect(root.querySelector('[data-bakehouse-template-skipped]')?.textContent).toContain(
      '2 articles écartés : OLD (article retiré du réassort), Baguette (unité de vente changée depuis).',
    );
  });

  it('sur une carte remplie, « Ajouter » additionne au lieu de remplacer', async () => {
    const panels = new FakePanels();
    panels.answer = 'add';
    const { fixture, card, add } = await mount(new FakePickups(), new FakeBakehouse(), panels);
    await card['pickSite']('site_v');
    await settled(fixture);
    add('CRO', 3);
    add('PAC', 2);
    await card['fromTemplate'](baseMatin());
    expect(panels.asked).toEqual([{ templateName: 'Base matin', lineCount: 2 }]);
    expect(card['lines']()).toEqual([
      { sku: 'CRO', quantity: 15 },
      { sku: 'PAC', quantity: 2 },
    ]);
  });

  it("garde la carte telle quelle si l'on ferme la question", async () => {
    const { fixture, card, add } = await mount();
    await card['pickSite']('site_v');
    await settled(fixture);
    add('PAC', 2);
    await card['fromTemplate'](baseMatin());
    expect(card['lines']()).toEqual([{ sku: 'PAC', quantity: 2 }]);
  });
});

describe('BakehouseResupplyCard — l’heure d’un modèle (H1)', () => {
  it('recopie l’heure du modèle sur une carte qui n’en a pas, jamais par-dessus', async () => {
    const { card } = await mount();
    await card['pickSite']('site_v');
    await card['fromTemplate']({ ...baseMatin(), arrivalBy: '06:15' });
    expect(card['arrivalBy']()).toBe('06:15');

    card['arrivalBy'].set('07:00');
    card['quantities'].set(new Map());
    await card['fromTemplate']({ ...baseMatin(), arrivalBy: '06:15' });
    expect(card['arrivalBy']()).toBe('07:00');
  });
});
