import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import type {
  CatalogAdminItemView,
  StaffPermission,
  StorefrontObjectView,
  StorefrontPayloadInput,
  StorefrontView,
} from '@lfd/contracts';
import { DEFAULT_CAROUSEL } from '@lfd/storefront-layout';
import { FoldPanelHostService, FoldPanelRef } from 'fold-ng';
import { describe, expect, it, vi } from 'vitest';

import { PermissionsStore } from '../../auth/permissions.store';
import { CatalogueService } from '../../b2b/catalogue/catalogue.service';
import { NotifyService } from '../../notify.service';
import { StorefrontObjectDialog } from '../storefront-object-dialog/storefront-object-dialog';
import type { StorefrontObjectDialogData } from '../storefront-object-host';
import { StorefrontService } from '../storefront.service';
import { StorefrontPage } from './storefront-page';

/**
 * Ce que ces cas tiennent : la page charge la vitrine et les rayons du
 * catalogue, la voie clavier pose / déplace / retire, chaque rayon a ses
 * rangées, et enregistrer envoie la vitrine entière avec sa révision — un 409
 * se dit avec « Recharger ». La règle de placement elle-même est éprouvée dans
 * `@lfd/storefront-layout` et `storefront-placement.spec.ts`.
 */

/** Un objet de la vitrine chargée, réglages résolus comme le serveur les rend. */
function object(
  id: string,
  overrides: Partial<StorefrontObjectView> & Pick<StorefrontObjectView, 'shape' | 'column' | 'row'>,
): StorefrontObjectView {
  return {
    id,
    applyOnMobile: true,
    mediaFit: 'cover',
    mediaSide: 'left',
    multiple: false,
    carousel: { ...DEFAULT_CAROUSEL },
    tone: 'light',
    shelves: ['all'],
    contents: [],
    ...overrides,
  };
}

/** La rangée 1 d'aujourd'hui sur « Tout », et une bande double partagée avec le chocolat. */
function composedView(): StorefrontView {
  return {
    revision: 4,
    updatedAt: null,
    pages: [
      { shelfKey: 'all', rows: 6 },
      { shelfKey: 'chocolate', rows: 6 },
    ],
    objects: [
      object('o-1', { shape: 'tile', column: 1, row: 1 }),
      object('o-2', { shape: 'card', column: 3, row: 1, mediaFit: 'contain', mediaSide: 'top' }),
      object('o-3', { shape: 'tile', column: 4, row: 1, mediaSide: 'right', tone: 'dark' }),
      object('o-4', {
        shape: 'doubleBand',
        column: 1,
        row: 3,
        shelves: ['all', 'chocolate'],
        mediaSide: 'full',
        tone: 'accent',
        multiple: true,
        carousel: {
          nav: 'both',
          autoplay: true,
          intervalSeconds: 5,
          firstSeconds: 8,
          sampleCount: 3,
        },
      }),
    ],
    templates: [],
  };
}

const EMPTY_VIEW: StorefrontView = {
  revision: 0,
  updatedAt: null,
  pages: [],
  objects: [],
  templates: [],
};

function item(sku: string, categoryId: string, categoryName: string): CatalogAdminItemView {
  return {
    sku,
    productSku: sku,
    name: `Article ${sku}`,
    categoryId,
    categoryName,
    pimPriceMillicents: 100_000,
    b2bPriceMillicents: null,
    effectivePriceMillicents: 100_000,
    publicTtcCents: null,
    publicVatRatePercent: null,
    decidedPublicTtcCents: null,
    vatRatePercent: 5.5,
    allergens: null,
    allergensIncomplete: false,
    isHidden: false,
    isHiddenPublic: false,
    isFeatured: false,
    decidedBy: null,
    decidedByName: null,
    decidedAt: null,
    receivedAt: '2026-01-01T00:00:00.000Z',
  };
}

const CATALOG: readonly CatalogAdminItemView[] = [
  item('CRO', 'viennoiserie', 'Viennoiseries'),
  item('BAG', 'bread', 'Pains'),
  item('TRU', 'chocolate', 'Chocolat & confiserie'),
];

class FakeStorefront {
  view: StorefrontView = composedView();
  readonly saved: StorefrontPayloadInput[] = [];
  failure: unknown = null;
  loads = 0;

  async load(): Promise<StorefrontView> {
    this.loads++;
    return this.view;
  }

  async save(payload: StorefrontPayloadInput): Promise<void> {
    this.saved.push(payload);
    if (this.failure !== null) {
      throw this.failure;
    }
  }
}

interface Options {
  readonly view?: StorefrontView;
  readonly permissions?: readonly StaffPermission[];
  readonly catalog?: 'ok' | 'fails';
}

async function setup(options: Options = {}) {
  const api = new FakeStorefront();
  api.view = options.view ?? composedView();
  const granted = options.permissions ?? ['b2b_storefront:read', 'b2b_storefront:write'];
  const successes: string[] = [];
  const opened: { component: unknown; data: StorefrontObjectDialogData }[] = [];
  TestBed.configureTestingModule({
    providers: [
      { provide: StorefrontService, useValue: api },
      {
        provide: FoldPanelHostService,
        useValue: {
          open: (component: unknown, config: { data: StorefrontObjectDialogData }) =>
            opened.push({ component, data: config.data }),
        },
      },
      {
        provide: CatalogueService,
        useValue: {
          list: async () => {
            if (options.catalog === 'fails') {
              throw new HttpErrorResponse({ status: 403 });
            }
            return CATALOG;
          },
        },
      },
      { provide: NotifyService, useValue: { success: (m: string) => successes.push(m) } },
      { provide: FoldPanelRef, useValue: { close: () => undefined } },
      {
        provide: PermissionsStore,
        useValue: { can: (permission: StaffPermission) => granted.includes(permission) },
      },
    ],
  });
  const { fixture, page, root } = await rendered();
  return { fixture, page, root, api, successes, opened };
}

/**
 * Crée la page et attend la fin de son chargement. `whenStable` n'y suffit pas :
 * le chargement est une promesse que le composant ne rattache à aucune tâche
 * suivie, et la fixture se croirait stable avant la réponse.
 */
async function rendered() {
  const fixture = TestBed.createComponent(StorefrontPage);
  const page = fixture.componentInstance;
  fixture.detectChanges();
  await vi.waitFor(() => expect(page.status()).not.toBe('loading'));
  fixture.detectChanges();
  return { fixture, page, root: fixture.nativeElement as HTMLElement };
}

function key(target: Element, name: string): void {
  target.dispatchEvent(new KeyboardEvent('keydown', { key: name, bubbles: true }));
}

describe('StorefrontPage — chargement', () => {
  it('charge la vitrine : ses objets, ses rangées, et rien à enregistrer', async () => {
    const { page, root } = await setup();
    expect(page.status()).toBe('ready');
    expect(page.rows()).toBe(6);
    expect(page.blocks().map((b) => b.format)).toEqual(['tile', 'card', 'tile', 'doubleBand']);
    expect(root.querySelectorAll('.block')).toHaveLength(4);
    expect(page.dirty()).toBe(false);
    expect(root.textContent).not.toContain('Modifications non enregistrées');
  });

  it('une vitrine jamais enregistrée s’ouvre vide — aucun exemple pré-rempli', async () => {
    const { page, root } = await setup({ view: EMPTY_VIEW });
    expect(page.blocks()).toEqual([]);
    expect(root.querySelectorAll('.grid .free-cell')).toHaveLength(30);
  });

  it('les rayons sont ceux du catalogue : « Tout », puis les familles servies', async () => {
    const { page } = await setup();
    expect(page.shelves().map((s) => s.label)).toEqual([
      'Tout',
      'Viennoiseries',
      'Pains',
      'Chocolat & confiserie',
    ]);
  });

  it('sans catalogue : le dit, et nomme les rayons par leur clé', async () => {
    const { page, root } = await setup({ catalog: 'fails' });
    expect(page.status()).toBe('ready');
    expect(root.textContent).toContain('Le catalogue n’a pas pu être lu');
    expect(page.shelves().map((s) => s.key)).toEqual(['all', 'chocolate']);
  });

  it('une vitrine illisible vide l’écran et propose de réessayer', async () => {
    const api = new FakeStorefront();
    api.load = async () => {
      throw new HttpErrorResponse({ status: 500, error: { message: 'Base indisponible.' } });
    };
    TestBed.configureTestingModule({
      providers: [
        { provide: StorefrontService, useValue: api },
        { provide: CatalogueService, useValue: { list: async () => CATALOG } },
        { provide: NotifyService, useValue: { success: () => undefined } },
        { provide: PermissionsStore, useValue: { can: () => true } },
      ],
    });
    const { root } = await rendered();
    expect(root.querySelector('fold-empty-state')?.textContent).toContain('Réessayer');
    expect(root.textContent).toContain('Base indisponible.');
  });
});

describe('StorefrontPage — composer', () => {
  it('montre un repère « article du rayon » sur chaque case libre', async () => {
    const { root } = await setup();
    // 6 × 5 = 30 cases, moins 5 (rangée 1) et 10 (bande double) = 15.
    const free = root.querySelectorAll('.grid .free-cell');
    expect(free).toHaveLength(15);
    expect(free[0]?.textContent).toContain('article du rayon');
  });

  it('pose depuis la palette à la première place libre, et le signale non enregistré', async () => {
    const { page, fixture, root } = await setup();
    page.addFormat('card');
    fixture.detectChanges();
    const added = page.blocks().at(-1);
    expect(added).toMatchObject({ format: 'card', column: 1, row: 2 });
    expect(page.selectedId()).toBe(added?.id);
    expect(page.dirty()).toBe(true);
    expect(root.textContent).toContain('Modifications non enregistrées');
  });

  it('déplace à la flèche et refuse le chevauchement en le disant', async () => {
    const { fixture, page, root } = await setup();
    const cardBlock = root.querySelectorAll('.block')[1];
    if (cardBlock === undefined) throw new Error('carte absente');
    key(cardBlock, 'ArrowDown');
    fixture.detectChanges();
    expect(page.blocks()[1]).toMatchObject({ column: 3, row: 2 });

    key(cardBlock, 'ArrowDown');
    fixture.detectChanges();
    expect(page.blocks()[1]).toMatchObject({ column: 3, row: 2 });
    expect(root.textContent).toContain('Sur le rayon « Tout », chevauche « Bande double 5×2 »');
  });

  it('retire à Suppr', async () => {
    const { fixture, page, root } = await setup();
    const tileBlock = root.querySelector('.block');
    if (tileBlock === null) throw new Error('tuile absente');
    key(tileBlock, 'Delete');
    fixture.detectChanges();
    expect(page.blocks().map((b) => b.format)).toEqual(['card', 'tile', 'doubleBand']);
  });

  it('refuse de réduire le rayon sous un de ses objets, en le nommant', async () => {
    const { fixture, page, root } = await setup();
    expect(page.setRows(3)).toBe(false);
    fixture.detectChanges();
    expect(page.rows()).toBe(6);
    expect(root.textContent).toContain(
      'Impossible de passer « Tout » à 3 rangées : « Bande double 5×2 » (colonne 1, rangée 3)',
    );

    expect(page.setRows(4)).toBe(true);
    expect(page.rows()).toBe(4);
  });

  it('chaque rayon a SES rangées : régler l’un ne touche pas l’autre', async () => {
    const { page } = await setup();
    page.pickShelf('bread');
    expect(page.setRows(2)).toBe(true);
    expect(page.rows()).toBe(2);
    page.pickShelf('all');
    expect(page.rows()).toBe(6);
    page.pickShelf('bread');
    expect(page.rows()).toBe(2);
  });

  it('un objet partagé doit tenir sur chacun de ses rayons, avec les rangées de chacun', async () => {
    const { fixture, page, root } = await setup();
    page.pickShelf('bread');
    page.setRows(2);
    page.pickShelf('all');
    page.select('o-4'); // la bande double en rangée 3 : trop bas pour « Pains »
    page.setSelectedShelves(['all', 'chocolate', 'bread']);
    fixture.detectChanges();
    expect(page.blocks().find((b) => b.id === 'o-4')?.shelves).toEqual(['all', 'chocolate']);
    expect(root.textContent).toContain('Sur le rayon « Pains » : Déborde des 2 rangées');
  });

  it('chaque rayon a sa page ; un objet partagé paraît sur toutes les siennes, avec son repère', async () => {
    const { fixture, page, root } = await setup();
    expect(root.textContent).toContain('le reste du rayon s’écoule ici');
    page.pickShelf('chocolate');
    fixture.detectChanges();
    const blocks = root.querySelectorAll('.block');
    expect(blocks).toHaveLength(1);
    expect(blocks[0]?.textContent).toContain('partagé · 2 rayons');

    page.pickShelf('bread');
    fixture.detectChanges();
    expect(root.querySelectorAll('.block')).toHaveLength(0);
    expect(root.querySelectorAll('.grid .free-cell').length).toBeGreaterThanOrEqual(30);
  });

  it('pose un objet neuf sur le rayon édité seulement', async () => {
    const { page } = await setup();
    page.pickShelf('bread');
    page.addFormat('block');
    expect(page.blocks().at(-1)).toMatchObject({
      format: 'block',
      column: 1,
      row: 1,
      shelves: ['bread'],
    });
  });

  it('refuse d’étendre un objet à un rayon où la place est prise, en nommant le rayon', async () => {
    const { fixture, page, root } = await setup();
    page.pickShelf('chocolate');
    page.addFormat('card'); // (1,1) sur « Chocolat & confiserie », libre là-bas
    page.pickShelf('all');
    page.select('o-1');
    page.setSelectedShelves(['all', 'chocolate']);
    fixture.detectChanges();
    expect(page.blocks().find((b) => b.id === 'o-1')?.shelves).toEqual(['all']);
    expect(root.textContent).toContain(
      'Sur le rayon « Chocolat & confiserie », chevauche « Carte 1×1 »',
    );
  });

  it('« Appliquer en mobile » à non : repère sur l’objet, carte 1×1 dans l’aperçu mobile', async () => {
    const { fixture, page, root } = await setup();
    page.select('o-1');
    page.setSelectedApplyOnMobile(false);
    fixture.detectChanges();
    expect(root.querySelector('.block')?.textContent).toContain('mobile : carte 1×1');
    expect(root.querySelector('.mobile-item')?.textContent).toContain('Carte 1×1');
  });

  it('un réglage de l’image se voit sur la maquette de la grille', async () => {
    const { fixture, page, root } = await setup();
    page.select('o-2');
    page.setSelectedMedia({ side: 'full', fit: 'cover' });
    fixture.detectChanges();
    expect(page.blocks()[1]).toMatchObject({ mediaSide: 'full', mediaFit: 'cover' });
    const mock = root.querySelectorAll('.grid app-storefront-media-mock')[1];
    expect(mock?.classList.contains('side-full')).toBe(true);
  });

  it('l’aperçu mobile met l’image en haut, sauf le plein', async () => {
    const { root } = await setup();
    const sides = Array.from(root.querySelectorAll('.mobile app-storefront-media-mock')).map((m) =>
      Array.from(m.classList).find((c) => c.startsWith('side-')),
    );
    expect(sides).toEqual(['side-top', 'side-top', 'side-top', 'side-full']);
  });

  it('plusieurs contenus : une durée hors bornes est refusée et dite', async () => {
    const { fixture, page, root } = await setup();
    page.select('o-1');
    page.setSelectedContents('multiple');
    fixture.detectChanges();
    expect(page.blocks()[0]?.contents).toBe('multiple');

    page.setSelectedCarousel({ intervalSeconds: 20 });
    fixture.detectChanges();
    expect(root.textContent).toContain('de 3 à 15 secondes');
    expect(page.blocks()[0]?.carousel).toEqual(DEFAULT_CAROUSEL);
  });

  it('gabarits : enregistrer, refuser un doublon, poser une copie indépendante', async () => {
    const { fixture, page, root } = await setup();
    page.select('o-3'); // la tuile sombre, image à droite
    expect(page.saveSelectedAsTemplate({ name: '  Tuile droite ', description: '' })).toBe(true);
    expect(page.templates()).toHaveLength(1);
    expect(page.templates()[0]).toMatchObject({
      name: 'Tuile droite',
      format: 'tile',
      mediaSide: 'right',
      tone: 'dark',
    });

    expect(page.saveSelectedAsTemplate({ name: 'tuile DROITE', description: '' })).toBe(false);
    fixture.detectChanges();
    expect(root.textContent).toContain('Le gabarit « Tuile droite » existe déjà');

    const [template] = page.templates();
    if (template === undefined) throw new Error('gabarit absent');
    page.addTemplate(template);
    const placed = page.blocks().at(-1);
    expect(placed).toMatchObject({ format: 'tile', mediaSide: 'right', column: 1, row: 2 });

    page.updateTemplate(template.id, { name: 'Autre', description: 'Modifiée' });
    page.deleteTemplate(template.id);
    expect(page.templates()).toEqual([]);
    expect(page.blocks().at(-1)).toEqual(placed);
  });

  it('changer de forme : garde les réglages, ou refuse en nommant la raison', async () => {
    const { fixture, page, root } = await setup();
    page.select('o-3'); // tuile sombre image à droite, colonne 4
    page.setSelectedFormat('band');
    fixture.detectChanges();
    expect(page.blocks().find((b) => b.id === 'o-3')?.format).toBe('tile');
    expect(root.textContent).toContain('Déborde des 5 colonnes');

    page.setSelectedFormat('card');
    expect(page.blocks().find((b) => b.id === 'o-3')).toMatchObject({
      format: 'card',
      column: 4,
      tone: 'dark',
      mediaSide: 'top',
    });
  });
});

describe('StorefrontPage — le dialogue de l’objet', () => {
  it('un clic sélectionne sans ouvrir', async () => {
    const { fixture, page, root, opened } = await setup();
    root.querySelectorAll('.block')[1]?.dispatchEvent(new FocusEvent('focus'));
    fixture.detectChanges();
    expect(page.selectedId()).toBe('o-2');
    expect(opened).toHaveLength(0);
  });

  it('un double-clic ouvre le dialogue de l’objet, centré, sur l’éditeur lui-même', async () => {
    const { page, root, opened } = await setup();
    root
      .querySelectorAll('.block')[1]
      ?.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    expect(opened).toHaveLength(1);
    expect(opened[0]?.component).toBe(StorefrontObjectDialog);
    expect(StorefrontObjectDialog.foldPanel.side).toBe('center');
    expect(opened[0]?.data.host).toBe(page);
    expect(page.selectedId()).toBe('o-2');
  });

  it('Entrée ouvre le dialogue', async () => {
    const { root, opened } = await setup();
    const block = root.querySelector('.block');
    if (block === null) throw new Error('objet absent');
    key(block, 'Enter');
    expect(opened).toHaveLength(1);
  });

  it('le bouton « Modifier » de l’objet ouvre le dialogue', async () => {
    const { root, opened } = await setup();
    const edit = root.querySelector('.block fold-button-icon[icon="edit"] button');
    if (!(edit instanceof HTMLElement)) throw new Error('bouton Modifier absent');
    edit.click();
    expect(opened).toHaveLength(1);
  });

  /** Le dialogue tel que l'éditeur l'ouvre : sur lui-même, pour l'objet sélectionné. */
  async function dialogFor(id: string) {
    const context = await setup();
    context.page.openEditor(id);
    const data = context.opened[0]?.data;
    if (data === undefined) throw new Error('dialogue non ouvert');
    const dialog = TestBed.createComponent(StorefrontObjectDialog);
    dialog.componentRef.setInput('data', data);
    dialog.detectChanges();
    return { ...context, dialog, dialogRoot: dialog.nativeElement as HTMLElement };
  }

  it('un réglage fait dans le dialogue arrive dans la composition, et l’aperçu suit', async () => {
    const { page, dialog, dialogRoot } = await dialogFor('o-3');
    const panel = dialog.debugElement.query(
      (el) => el.name === 'app-storefront-object-panel',
    ).componentInstance;
    panel.toneChange.emit('accent');
    dialog.detectChanges();
    expect(page.blocks().find((b) => b.id === 'o-3')?.tone).toBe('accent');
    expect(
      dialogRoot.querySelector('.previews app-storefront-media-mock.tone-accent'),
    ).not.toBeNull();
  });

  it('un refus s’affiche DANS le dialogue', async () => {
    const { page, dialog, dialogRoot } = await dialogFor('o-3'); // tuile en colonne 4
    page.setSelectedFormat('band');
    dialog.detectChanges();
    expect(page.blocks().find((b) => b.id === 'o-3')?.format).toBe('tile');
    expect(dialogRoot.querySelector('fold-callout')?.textContent).toContain(
      'Déborde des 5 colonnes',
    );
  });

  it('la colonne de droite ne garde que l’aperçu mobile de la page', async () => {
    const { root } = await setup();
    expect(root.querySelector('app-storefront-object-panel')).toBeNull();
    expect(root.querySelector('app-storefront-mobile-preview')).not.toBeNull();
  });
});

describe('StorefrontPage — enregistrer', () => {
  it('envoie la vitrine ENTIÈRE avec la révision lue ; un objet neuf part sans identifiant', async () => {
    const { fixture, page, api, successes } = await setup();
    page.pickShelf('bread');
    page.addFormat('card');
    await page.save();
    fixture.detectChanges();

    const [payload] = api.saved;
    expect(payload?.revision).toBe(4);
    expect(payload?.pages).toEqual([
      { shelfKey: 'all', rows: 6 },
      { shelfKey: 'chocolate', rows: 6 },
      { shelfKey: 'bread', rows: 6 },
    ]);
    expect(payload?.objects.map((o) => o.id)).toEqual(['o-1', 'o-2', 'o-3', 'o-4', undefined]);
    expect(payload?.objects.at(-1)).toMatchObject({ shape: 'card', shelves: ['bread'] });
    // Relu après l'écriture : c'est le serveur qui identifie le neuf.
    expect(api.loads).toBe(2);
    expect(successes).toHaveLength(1);
  });

  it('un 409 dit le message du serveur et propose de recharger', async () => {
    const { fixture, page, root, api } = await setup();
    page.addFormat('card');
    api.failure = new HttpErrorResponse({
      status: 409,
      error: {
        code: 'storefront.changed',
        message:
          'La vitrine a été modifiée à 10:42 pendant que vous travailliez — rechargez pour reprendre la dernière version.',
      },
    });
    await page.save();
    fixture.detectChanges();
    expect(page.saveRefusal()?.conflict).toBe(true);
    expect(root.textContent).toContain('La vitrine a été modifiée à 10:42');
    const reload = Array.from(root.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Recharger'),
    );
    expect(reload).toBeDefined();
    // Recharger reprend la dernière version : la carte non enregistrée disparaît.
    await page.load();
    expect(page.blocks()).toHaveLength(4);
    expect(page.dirty()).toBe(false);
  });

  it('retient une première sortie quand des modifications attendent, laisse passer la seconde', async () => {
    const { fixture, page, root } = await setup();
    expect(page.canLeave()).toBe(true);
    page.addFormat('card');
    expect(page.canLeave()).toBe(false);
    fixture.detectChanges();
    expect(root.textContent).toContain('quittez à nouveau la page');
    expect(page.canLeave()).toBe(true);
  });

  it('sans droit d’écrire : pas de bouton Enregistrer, une mention, et aucune sortie retenue', async () => {
    const { page, root } = await setup({ permissions: ['b2b_storefront:read'] });
    expect(root.textContent).toContain('Lecture seule');
    const save = Array.from(root.querySelectorAll('button')).find(
      (b) => b.textContent?.trim() === 'Enregistrer',
    );
    expect(save).toBeUndefined();
    page.addFormat('card');
    expect(page.canLeave()).toBe(true);
  });
});

describe('StorefrontPage — contenus', () => {
  /** « Tout » porte une tuile avec un article en vente et un autre retiré ; « gone » n'est plus une famille. */
  function withContents(): StorefrontView {
    const base = composedView();
    return {
      ...base,
      pages: [...base.pages, { shelfKey: 'gone', rows: 3 }],
      objects: [
        object('o-1', {
          shape: 'tile',
          column: 1,
          row: 1,
          multiple: true,
          contents: [
            { kind: 'product', sku: 'CRO' },
            { kind: 'product', sku: 'OLD' },
          ],
        }),
        object('o-9', { shape: 'card', column: 1, row: 1, shelves: ['gone'] }),
      ],
    };
  }

  it('la maquette montre le nom de l’article, et marque celui qui n’est plus en vente', async () => {
    const { root } = await setup({ view: withContents() });
    const tile = root.querySelector('.block');
    expect(tile?.querySelector('.block-content')?.textContent).toContain('Article CRO');
    expect(tile?.textContent).toContain('article plus en vente');
  });

  it('refuse de repasser à « un seul » tant que l’objet en porte plusieurs', async () => {
    const { fixture, page, root } = await setup({ view: withContents() });
    page.select('o-1');
    page.setSelectedContents('single');
    fixture.detectChanges();
    expect(page.blocks()[0]?.contents).toBe('multiple');
    expect(root.textContent).toContain('cet objet porte 2 contenus');
  });

  it('une info sans titre ferme Enregistrer, et le dit en nommant l’objet', async () => {
    const { fixture, page, root } = await setup();
    page.select('o-2');
    page.setSelectedItems([
      { kind: 'info', badge: null, title: { fr: '' }, lede: null, image: null, linkShelfKey: null },
    ]);
    fixture.detectChanges();
    expect(page.contentIssues()).toHaveLength(1);
    expect(root.textContent).toContain('À compléter avant d’enregistrer');
    expect(root.textContent).toContain('« Carte 1×1 » (Tout, colonne 3, rangée 1), contenu 1');
    const save = Array.from(root.querySelectorAll('button')).find(
      (b) => b.textContent?.trim() === 'Enregistrer',
    );
    expect(save?.disabled).toBe(true);
  });

  it('les rayons disparus sont listés, et les vider retire leur page et leurs objets', async () => {
    const { fixture, page, root } = await setup({ view: withContents() });
    expect(page.vanished()).toEqual(['gone']);
    expect(root.textContent).toContain('Vider « gone »');
    page.clearShelf('gone');
    fixture.detectChanges();
    expect(page.vanished()).toEqual([]);
    expect(page.blocks().map((b) => b.id)).toEqual(['o-1']);
    expect(page.rowsByShelf()).not.toHaveProperty('gone');
  });

  it('un objet qui n’a rien à montrer le dit, sur la grille comme en mobile', async () => {
    const { fixture, page, root } = await setup({ view: withContents() });
    // La tuile porte un article en vente : elle montre quelque chose.
    expect(page.returnedIds().has('o-1')).toBe(false);
    page.select('o-1');
    page.setSelectedItems([{ kind: 'product', sku: 'OLD' }]);
    page.addFormat('card');
    fixture.detectChanges();
    const returned = [...page.returnedIds()];
    expect(returned).toContain('o-1');
    expect(returned).toContain(page.blocks().at(-1)?.id);
    expect(root.querySelector('.grid .block')?.textContent).toContain(
      'rendu au rayon tant qu’il est vide',
    );
    expect(root.querySelector('.mobile')?.textContent).toContain(
      'rendu au rayon tant qu’il est vide',
    );
  });

  it('une info sans image rend aussi ses cases ; complète, elle les garde', async () => {
    const { page } = await setup();
    page.select('o-2');
    const title = { fr: 'Pâques' };
    page.setSelectedItems([
      { kind: 'info', badge: null, title, lede: null, image: null, linkShelfKey: null },
    ]);
    expect(page.returnedIds().has('o-2')).toBe(true);
    page.setSelectedItems([
      {
        kind: 'info',
        badge: null,
        title,
        lede: null,
        image: { url: 'https://cdn.example/paques.jpg', alt: null },
        linkShelfKey: null,
      },
    ]);
    expect(page.returnedIds().has('o-2')).toBe(false);
  });

  it('une vitrine sans objet : toute la grille en « article du rayon », aucun repère de retour', async () => {
    const { page, root } = await setup({ view: EMPTY_VIEW });
    expect(root.querySelectorAll('.grid .free-cell')).toHaveLength(30);
    // Le seul état vide admis est celui de la liste des gabarits : la vitrine, elle, n'est jamais vide.
    const empties = Array.from(root.querySelectorAll('fold-empty-state'));
    expect(empties.every((e) => e.closest('app-storefront-template-list') !== null)).toBe(true);
    expect(page.returnedIds().size).toBe(0);
  });

  it('les contenus partent avec l’objet, dans leur ordre', async () => {
    const { page, api } = await setup({ view: withContents() });
    page.clearShelf('gone');
    await page.save();
    expect(api.saved[0]?.objects[0]?.contents).toEqual([
      { kind: 'product', sku: 'CRO' },
      { kind: 'product', sku: 'OLD' },
    ]);
  });
});
