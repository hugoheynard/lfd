import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import type {
  StaffPermission,
  StorefrontCatalogView,
  StorefrontObjectView,
  StorefrontPayloadInput,
  StorefrontView,
} from '@lfd/contracts';
import { DEFAULT_CAROUSEL } from '@lfd/storefront-layout';
import { FoldPanelHostService, FoldPanelRef } from 'fold-ng';
import { describe, expect, it, vi } from 'vitest';

import { PermissionsStore } from '../../auth/permissions.store';
import { NotifyService } from '../../notify.service';
import { StorefrontObjectDialog } from '../storefront-object-dialog/storefront-object-dialog';
import type { StorefrontObjectDialogData } from '../storefront-object-host';
import { StorefrontEditorStore } from '../storefront-editor.store';
import { StorefrontPersistence } from '../storefront-persistence';
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

function item(sku: string, shelfKey: string): StorefrontCatalogView['items'][number] {
  return { sku, name: `Article ${sku}`, shelfKey, served: true };
}

const CATALOG: StorefrontCatalogView = {
  shelves: [
    { key: 'viennoiserie', name: 'Viennoiseries' },
    { key: 'bread', name: 'Pains' },
    { key: 'chocolate', name: 'Chocolat & confiserie' },
  ],
  items: [item('CRO', 'viennoiserie'), item('BAG', 'bread'), item('TRU', 'chocolate')],
};

class FakeStorefront {
  view: StorefrontView = composedView();
  readonly saved: StorefrontPayloadInput[] = [];
  failure: unknown = null;
  catalogFailure: unknown = null;
  loads = 0;

  async load(): Promise<StorefrontView> {
    this.loads++;
    return this.view;
  }

  async catalog(): Promise<StorefrontCatalogView> {
    if (this.catalogFailure !== null) {
      throw this.catalogFailure;
    }
    return CATALOG;
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
  if (options.catalog === 'fails') {
    api.catalogFailure = new HttpErrorResponse({ status: 403 });
  }
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
      { provide: NotifyService, useValue: { success: (m: string) => successes.push(m) } },
      { provide: FoldPanelRef, useValue: { close: () => undefined } },
      {
        provide: PermissionsStore,
        useValue: { can: (permission: StaffPermission) => granted.includes(permission) },
      },
    ],
  });
  const rendering = await rendered();
  return { ...rendering, api, successes, opened };
}

/**
 * Crée la page et attend la fin de son chargement. `whenStable` n'y suffit pas :
 * le chargement est une promesse que le composant ne rattache à aucune tâche
 * suivie, et la fixture se croirait stable avant la réponse.
 */
async function rendered() {
  const fixture = TestBed.createComponent(StorefrontPage);
  const page = fixture.componentInstance;
  const store = fixture.debugElement.injector.get(StorefrontEditorStore);
  const persistence = fixture.debugElement.injector.get(StorefrontPersistence);
  fixture.detectChanges();
  await vi.waitFor(() => expect(persistence.status()).not.toBe('loading'));
  fixture.detectChanges();
  return { fixture, page, store, persistence, root: fixture.nativeElement as HTMLElement };
}

function key(target: Element, name: string): void {
  target.dispatchEvent(new KeyboardEvent('keydown', { key: name, bubbles: true }));
}

describe('StorefrontPage — chargement', () => {
  it('charge la vitrine : ses objets, ses rangées, et rien à enregistrer', async () => {
    const { store, persistence, root } = await setup();
    expect(persistence.status()).toBe('ready');
    expect(store.rows()).toBe(6);
    expect(store.blocks().map((b) => b.format)).toEqual(['tile', 'card', 'tile', 'doubleBand']);
    expect(root.querySelectorAll('.block')).toHaveLength(4);
    expect(store.dirty()).toBe(false);
    expect(root.textContent).not.toContain('Modifications non enregistrées');
  });

  it('une vitrine jamais enregistrée s’ouvre vide — aucun exemple pré-rempli', async () => {
    const { store, root } = await setup({ view: EMPTY_VIEW });
    expect(store.blocks()).toEqual([]);
    expect(root.querySelectorAll('.grid .free-cell')).toHaveLength(30);
  });

  it('les rayons sont ceux du catalogue : « Tout », puis les familles servies', async () => {
    const { store } = await setup();
    expect(store.shelves().map((s) => s.label)).toEqual([
      'Tout',
      'Viennoiseries',
      'Pains',
      'Chocolat & confiserie',
    ]);
  });

  it('sans catalogue : le dit, et nomme les rayons par leur clé', async () => {
    const { store, persistence, root } = await setup({ catalog: 'fails' });
    expect(persistence.status()).toBe('ready');
    expect(root.textContent).toContain('Le catalogue n’a pas pu être lu');
    expect(store.shelves().map((s) => s.key)).toEqual(['all', 'chocolate']);
  });

  it('une vitrine illisible vide l’écran et propose de réessayer', async () => {
    const api = new FakeStorefront();
    api.load = async () => {
      throw new HttpErrorResponse({ status: 500, error: { message: 'Base indisponible.' } });
    };
    TestBed.configureTestingModule({
      providers: [
        { provide: StorefrontService, useValue: api },
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
    const { store, fixture, root } = await setup();
    store.addFormat('card');
    fixture.detectChanges();
    const added = store.blocks().at(-1);
    expect(added).toMatchObject({ format: 'card', column: 1, row: 2 });
    expect(store.selectedId()).toBe(added?.id);
    expect(store.dirty()).toBe(true);
    expect(root.textContent).toContain('Modifications non enregistrées');
  });

  it('déplace à la flèche et refuse le chevauchement en le disant', async () => {
    const { fixture, store, root } = await setup();
    const cardBlock = root.querySelectorAll('.block')[1];
    if (cardBlock === undefined) throw new Error('carte absente');
    key(cardBlock, 'ArrowDown');
    fixture.detectChanges();
    expect(store.blocks()[1]).toMatchObject({ column: 3, row: 2 });

    key(cardBlock, 'ArrowDown');
    fixture.detectChanges();
    expect(store.blocks()[1]).toMatchObject({ column: 3, row: 2 });
    expect(root.textContent).toContain('Sur le rayon « Tout », chevauche « Bande double 5×2 »');
  });

  it('retire à Suppr', async () => {
    const { fixture, store, root } = await setup();
    const tileBlock = root.querySelector('.block');
    if (tileBlock === null) throw new Error('tuile absente');
    key(tileBlock, 'Delete');
    fixture.detectChanges();
    expect(store.blocks().map((b) => b.format)).toEqual(['card', 'tile', 'doubleBand']);
  });

  it('refuse de réduire le rayon sous un de ses objets, en le nommant', async () => {
    const { fixture, store, root } = await setup();
    expect(store.setRows(3)).toBe(false);
    fixture.detectChanges();
    expect(store.rows()).toBe(6);
    expect(root.textContent).toContain(
      'Impossible de passer « Tout » à 3 rangées : « Bande double 5×2 » (colonne 1, rangée 3)',
    );

    expect(store.setRows(4)).toBe(true);
    expect(store.rows()).toBe(4);
  });

  it('chaque rayon a SES rangées : régler l’un ne touche pas l’autre', async () => {
    const { store } = await setup();
    store.pickShelf('bread');
    expect(store.setRows(2)).toBe(true);
    expect(store.rows()).toBe(2);
    store.pickShelf('all');
    expect(store.rows()).toBe(6);
    store.pickShelf('bread');
    expect(store.rows()).toBe(2);
  });

  it('un objet partagé doit tenir sur chacun de ses rayons, avec les rangées de chacun', async () => {
    const { fixture, store, root } = await setup();
    store.pickShelf('bread');
    store.setRows(2);
    store.pickShelf('all');
    store.select('o-4'); // la bande double en rangée 3 : trop bas pour « Pains »
    store.setSelectedShelves(['all', 'chocolate', 'bread']);
    fixture.detectChanges();
    expect(store.blocks().find((b) => b.id === 'o-4')?.shelves).toEqual(['all', 'chocolate']);
    expect(root.textContent).toContain('Sur le rayon « Pains » : Déborde des 2 rangées');
  });

  it('chaque rayon a sa page ; un objet partagé paraît sur toutes les siennes, avec son repère', async () => {
    const { fixture, store, root } = await setup();
    expect(root.textContent).toContain('le reste du rayon s’écoule ici');
    store.pickShelf('chocolate');
    fixture.detectChanges();
    const blocks = root.querySelectorAll('.block');
    expect(blocks).toHaveLength(1);
    expect(blocks[0]?.textContent).toContain('partagé · 2 rayons');

    store.pickShelf('bread');
    fixture.detectChanges();
    expect(root.querySelectorAll('.block')).toHaveLength(0);
    expect(root.querySelectorAll('.grid .free-cell').length).toBeGreaterThanOrEqual(30);
  });

  it('pose un objet neuf sur le rayon édité seulement', async () => {
    const { store } = await setup();
    store.pickShelf('bread');
    store.addFormat('block');
    expect(store.blocks().at(-1)).toMatchObject({
      format: 'block',
      column: 1,
      row: 1,
      shelves: ['bread'],
    });
  });

  it('refuse d’étendre un objet à un rayon où la place est prise, en nommant le rayon', async () => {
    const { fixture, store, root } = await setup();
    store.pickShelf('chocolate');
    store.addFormat('card'); // (1,1) sur « Chocolat & confiserie », libre là-bas
    store.pickShelf('all');
    store.select('o-1');
    store.setSelectedShelves(['all', 'chocolate']);
    fixture.detectChanges();
    expect(store.blocks().find((b) => b.id === 'o-1')?.shelves).toEqual(['all']);
    expect(root.textContent).toContain(
      'Sur le rayon « Chocolat & confiserie », chevauche « Carte 1×1 »',
    );
  });

  it('« Appliquer en mobile » à non : repère sur l’objet, carte 1×1 dans l’aperçu mobile', async () => {
    const { fixture, store, root } = await setup();
    store.select('o-1');
    store.setSelectedApplyOnMobile(false);
    fixture.detectChanges();
    expect(root.querySelector('.block')?.textContent).toContain('mobile : carte 1×1');
    expect(root.querySelector('.mobile-item')?.textContent).toContain('Carte 1×1');
  });

  it('un réglage de l’image se voit sur la maquette de la grille', async () => {
    const { fixture, store, root } = await setup();
    store.select('o-2');
    store.setSelectedMedia({ side: 'full', fit: 'cover' });
    fixture.detectChanges();
    expect(store.blocks()[1]).toMatchObject({ mediaSide: 'full', mediaFit: 'cover' });
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
    const { fixture, store, root } = await setup();
    store.select('o-1');
    store.setSelectedContents('multiple');
    fixture.detectChanges();
    expect(store.blocks()[0]?.contents).toBe('multiple');

    store.setSelectedCarousel({ intervalSeconds: 20 });
    fixture.detectChanges();
    expect(root.textContent).toContain('de 3 à 15 secondes');
    expect(store.blocks()[0]?.carousel).toEqual(DEFAULT_CAROUSEL);
  });

  it('gabarits : enregistrer, refuser un doublon, poser une copie indépendante', async () => {
    const { fixture, store, root } = await setup();
    store.select('o-3'); // la tuile sombre, image à droite
    expect(store.saveSelectedAsTemplate({ name: '  Tuile droite ', description: '' })).toBe(true);
    expect(store.templates()).toHaveLength(1);
    expect(store.templates()[0]).toMatchObject({
      name: 'Tuile droite',
      format: 'tile',
      mediaSide: 'right',
      tone: 'dark',
    });

    expect(store.saveSelectedAsTemplate({ name: 'tuile DROITE', description: '' })).toBe(false);
    fixture.detectChanges();
    expect(root.textContent).toContain('Le gabarit « Tuile droite » existe déjà');

    const [template] = store.templates();
    if (template === undefined) throw new Error('gabarit absent');
    store.addTemplate(template);
    const placed = store.blocks().at(-1);
    expect(placed).toMatchObject({ format: 'tile', mediaSide: 'right', column: 1, row: 2 });

    store.updateTemplate(template.id, { name: 'Autre', description: 'Modifiée' });
    store.deleteTemplate(template.id);
    expect(store.templates()).toEqual([]);
    expect(store.blocks().at(-1)).toEqual(placed);
  });

  it('changer de forme : garde les réglages, ou refuse en nommant la raison', async () => {
    const { fixture, store, root } = await setup();
    store.select('o-3'); // tuile sombre image à droite, colonne 4
    store.setSelectedFormat('band');
    fixture.detectChanges();
    expect(store.blocks().find((b) => b.id === 'o-3')?.format).toBe('tile');
    expect(root.textContent).toContain('Déborde des 5 colonnes');

    store.setSelectedFormat('card');
    expect(store.blocks().find((b) => b.id === 'o-3')).toMatchObject({
      format: 'card',
      column: 4,
      tone: 'dark',
      mediaSide: 'top',
    });
  });
});

describe('StorefrontPage — le dialogue de l’objet', () => {
  it('un clic sélectionne sans ouvrir', async () => {
    const { fixture, store, root, opened } = await setup();
    root.querySelectorAll('.block')[1]?.dispatchEvent(new FocusEvent('focus'));
    fixture.detectChanges();
    expect(store.selectedId()).toBe('o-2');
    expect(opened).toHaveLength(0);
  });

  it('un double-clic ouvre le dialogue de l’objet, centré, sur l’éditeur lui-même', async () => {
    const { store, root, opened } = await setup();
    root
      .querySelectorAll('.block')[1]
      ?.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    expect(opened).toHaveLength(1);
    expect(opened[0]?.component).toBe(StorefrontObjectDialog);
    expect(StorefrontObjectDialog.foldPanel.side).toBe('center');
    expect(opened[0]?.data.host).toBe(store);
    expect(store.selectedId()).toBe('o-2');
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
    const { store, dialog, dialogRoot } = await dialogFor('o-3');
    const panel = dialog.debugElement.query(
      (el) => el.name === 'app-storefront-object-panel',
    ).componentInstance;
    panel.toneChange.emit('accent');
    dialog.detectChanges();
    expect(store.blocks().find((b) => b.id === 'o-3')?.tone).toBe('accent');
    expect(
      dialogRoot.querySelector('.previews app-storefront-media-mock.tone-accent'),
    ).not.toBeNull();
  });

  it('un refus s’affiche DANS le dialogue', async () => {
    const { store, dialog, dialogRoot } = await dialogFor('o-3'); // tuile en colonne 4
    store.setSelectedFormat('band');
    dialog.detectChanges();
    expect(store.blocks().find((b) => b.id === 'o-3')?.format).toBe('tile');
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
    const { fixture, store, persistence, api, successes } = await setup();
    store.pickShelf('bread');
    store.addFormat('card');
    await persistence.save();
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
    const { fixture, store, persistence, root, api } = await setup();
    store.addFormat('card');
    api.failure = new HttpErrorResponse({
      status: 409,
      error: {
        code: 'storefront.changed',
        message:
          'La vitrine a été modifiée à 10:42 pendant que vous travailliez — rechargez pour reprendre la dernière version.',
      },
    });
    await persistence.save();
    fixture.detectChanges();
    expect(persistence.saveRefusal()?.conflict).toBe(true);
    expect(root.textContent).toContain('La vitrine a été modifiée à 10:42');
    const reload = Array.from(root.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Recharger'),
    );
    expect(reload).toBeDefined();
    // Recharger reprend la dernière version : la carte non enregistrée disparaît.
    await persistence.load();
    expect(store.blocks()).toHaveLength(4);
    expect(store.dirty()).toBe(false);
  });

  it('retient une première sortie quand des modifications attendent, laisse passer la seconde', async () => {
    const { fixture, page, store, root } = await setup();
    expect(page.canLeave()).toBe(true);
    store.addFormat('card');
    expect(page.canLeave()).toBe(false);
    fixture.detectChanges();
    expect(root.textContent).toContain('quittez à nouveau la page');
    expect(page.canLeave()).toBe(true);
  });

  it('sans droit d’écrire : pas de bouton Enregistrer, une mention, et aucune sortie retenue', async () => {
    const { page, store, root } = await setup({ permissions: ['b2b_storefront:read'] });
    expect(root.textContent).toContain('Lecture seule');
    const save = Array.from(root.querySelectorAll('button')).find(
      (b) => b.textContent?.trim() === 'Enregistrer',
    );
    expect(save).toBeUndefined();
    store.addFormat('card');
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
    const { fixture, store, root } = await setup({ view: withContents() });
    store.select('o-1');
    store.setSelectedContents('single');
    fixture.detectChanges();
    expect(store.blocks()[0]?.contents).toBe('multiple');
    expect(root.textContent).toContain('cet objet porte 2 contenus');
  });

  it('une info sans titre ferme Enregistrer, et le dit en nommant l’objet', async () => {
    const { fixture, store, root } = await setup();
    store.select('o-2');
    store.setSelectedItems([
      { kind: 'info', badge: null, title: { fr: '' }, lede: null, image: null, linkShelfKey: null },
    ]);
    fixture.detectChanges();
    expect(store.contentIssues()).toHaveLength(1);
    expect(root.textContent).toContain('À compléter avant d’enregistrer');
    expect(root.textContent).toContain('« Carte 1×1 » (Tout, colonne 3, rangée 1), contenu 1');
    const save = Array.from(root.querySelectorAll('button')).find(
      (b) => b.textContent?.trim() === 'Enregistrer',
    );
    expect(save?.disabled).toBe(true);
  });

  it('les rayons disparus sont listés, et les vider retire leur page et leurs objets', async () => {
    const { fixture, store, root } = await setup({ view: withContents() });
    expect(store.vanished()).toEqual(['gone']);
    expect(root.textContent).toContain('Vider « gone »');
    store.clearShelf('gone');
    fixture.detectChanges();
    expect(store.vanished()).toEqual([]);
    expect(store.blocks().map((b) => b.id)).toEqual(['o-1']);
    expect(store.rowsByShelf()).not.toHaveProperty('gone');
  });

  it('un objet qui n’a rien à montrer le dit, sur la grille comme en mobile', async () => {
    const { fixture, store, root } = await setup({ view: withContents() });
    // La tuile porte un article en vente : elle montre quelque chose.
    expect(store.returnedIds().has('o-1')).toBe(false);
    store.select('o-1');
    store.setSelectedItems([{ kind: 'product', sku: 'OLD' }]);
    store.addFormat('card');
    fixture.detectChanges();
    const returned = [...store.returnedIds()];
    expect(returned).toContain('o-1');
    expect(returned).toContain(store.blocks().at(-1)?.id);
    expect(root.querySelector('.grid .block')?.textContent).toContain(
      'rendu au rayon tant qu’il est vide',
    );
    expect(root.querySelector('.mobile')?.textContent).toContain(
      'rendu au rayon tant qu’il est vide',
    );
  });

  /**
   * Une info sans image s'affiche (annonce en texte) depuis le 2026-09-24 :
   * seule une info SANS TITRE rend ses cases au rayon.
   */
  it('une info sans titre rend ses cases ; avec un titre, même sans image, elle les garde', async () => {
    const { store } = await setup();
    store.select('o-2');
    store.setSelectedItems([
      { kind: 'info', badge: null, title: { fr: '' }, lede: null, image: null, linkShelfKey: null },
    ]);
    expect(store.returnedIds().has('o-2')).toBe(true);
    store.setSelectedItems([
      {
        kind: 'info',
        badge: null,
        title: { fr: 'Pâques' },
        lede: null,
        image: null,
        linkShelfKey: null,
      },
    ]);
    expect(store.returnedIds().has('o-2')).toBe(false);
  });

  it('une vitrine sans objet : toute la grille en « article du rayon », aucun repère de retour', async () => {
    const { store, root } = await setup({ view: EMPTY_VIEW });
    expect(root.querySelectorAll('.grid .free-cell')).toHaveLength(30);
    // Le seul état vide admis est celui de la liste des gabarits : la vitrine, elle, n'est jamais vide.
    const empties = Array.from(root.querySelectorAll('fold-empty-state'));
    expect(empties.every((e) => e.closest('app-storefront-template-list') !== null)).toBe(true);
    expect(store.returnedIds().size).toBe(0);
  });

  it('les contenus partent avec l’objet, dans leur ordre', async () => {
    const { store, persistence, api } = await setup({ view: withContents() });
    store.clearShelf('gone');
    await persistence.save();
    expect(api.saved[0]?.objects[0]?.contents).toEqual([
      { kind: 'product', sku: 'CRO' },
      { kind: 'product', sku: 'OLD' },
    ]);
  });
});
