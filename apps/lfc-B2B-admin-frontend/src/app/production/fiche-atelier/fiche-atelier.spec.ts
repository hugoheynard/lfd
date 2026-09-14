import { type ComponentFixture, TestBed } from '@angular/core/testing';
import type {
  CatalogItemView,
  ProductionWorksheetView,
  StaffNavPreferencesPatch,
  WorkshopLine,
} from '@lfd/contracts';
import { beforeEach, describe, expect, it } from 'vitest';

import { AdminCatalogService } from '../../commandes/catalog.service';
import { PermissionsStore } from '../../auth/permissions.store';
import { StaffPrefsService } from '../../shared/staff-prefs/staff-prefs.service';
import { WorksheetQueue, type QueuedMark } from '../worksheet-queue';
import { WorksheetService } from '../worksheet.service';
import { FicheAtelier } from './fiche-atelier';

/**
 * Ce que ces cas tiennent, et que ni `tsc` ni le build AOT ne peuvent dire :
 *
 * - 🔴 **une coche s'écrit à l'écran AVANT de partir** — le fournil est en
 *   sous-sol, et une case qui attendrait le réseau serait recochée deux fois ;
 * - 🔴 **le pied ne fabrique pas d'heure de tirage** quand le plan n'est pas
 *   arrêté : il dit qu'il ne l'est pas ;
 * - **les quatre états passent par fold**, y compris l'échec de la seule lecture
 *   du catalogue, qui laisse la fiche à l'écran et se dit ;
 * - **aucun prix, aucun nom de client** ne peut apparaître : la règle qui définit
 *   cet écran est vérifiée sur le rendu, pas seulement sur le type.
 */

function line(over: Partial<WorkshopLine> = {}): WorkshopLine {
  return {
    sku: 'BAG',
    productName: 'Baguette tradition',
    quantity: 160,
    containerLabel: '4 tourneuses',
    done: false,
    initials: null,
    doneAt: null,
    ...over,
  };
}

/** Aujourd'hui, en heure locale : la fiche ne connaît pas d'autre journée. */
function today(): string {
  const now = new Date();
  const month = `${now.getMonth() + 1}`.padStart(2, '0');
  const day = `${now.getDate()}`.padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}

/** Demain, en heure locale — la journée que le geste du soir fait basculer. */
function tomorrow(): string {
  const next = new Date();
  next.setDate(next.getDate() + 1);
  const month = `${next.getMonth() + 1}`.padStart(2, '0');
  const day = `${next.getDate()}`.padStart(2, '0');
  return `${next.getFullYear()}-${month}-${day}`;
}

function sheet(over: Partial<ProductionWorksheetView> = {}): ProductionWorksheetView {
  return {
    date: today(),
    // Une heure relative à aujourd'hui : la fiche lit la journée du poste, et
    // une date en dur y deviendrait fausse le lendemain.
    generatedAt: `${today()}T04:05:00`,
    retakenAt: null,
    lines: [line(), line({ sku: 'SEI', productName: 'Pain de seigle', quantity: 30 })],
    drift: null,
    ...over,
  };
}

const CATALOGUE: readonly CatalogItemView[] = [
  { sku: 'BAG', name: 'Baguette', unitPriceMillicents: 100, vatRate: 5.5, category: 'pain' },
  { sku: 'SEI', name: 'Seigle', unitPriceMillicents: 100, vatRate: 5.5, category: 'pain' },
];

class FakeWorksheetService {
  view: ProductionWorksheetView | null = sheet();
  retakes = 0;
  /** Les journées demandées, dans l'ordre — la règle de choix se lit là-dessus. */
  readonly asked: string[] = [];
  /** Une réponse par journée ; à défaut, `view` pour toutes. */
  readonly byDay = new Map<string, ProductionWorksheetView>();

  async worksheet(date: string): Promise<ProductionWorksheetView> {
    this.asked.push(date);
    const served = this.byDay.get(date) ?? this.view;
    if (served === null) {
      throw new Error('lecture refusée');
    }
    return served;
  }

  async retake(): Promise<void> {
    this.retakes += 1;
  }
}

class FakeCatalog {
  items: readonly CatalogItemView[] | null = CATALOGUE;

  async list(): Promise<readonly CatalogItemView[]> {
    if (this.items === null) {
      throw new Error('catalogue muet');
    }
    return this.items;
  }
}

class FakeQueue {
  readonly marks: QueuedMark[] = [];
  readonly pending = (): number => this.marks.length;
  readonly offline = (): boolean => false;

  mark(mark: QueuedMark): void {
    this.marks.push(mark);
  }
}

class FakePrefs {
  remembered: StaffNavPreferencesPatch[] = [];
  category: string | null = null;

  async worksheetCategory(): Promise<string | null> {
    return this.category;
  }

  async remember(patch: StaffNavPreferencesPatch): Promise<void> {
    this.remembered.push(patch);
  }
}

const ME = { firstName: 'Marie', lastName: 'Jost' };

interface Harness {
  readonly fixture: ComponentFixture<FicheAtelier>;
  readonly el: HTMLElement;
  readonly api: FakeWorksheetService;
  readonly catalog: FakeCatalog;
  readonly queue: FakeQueue;
  readonly prefs: FakePrefs;
}

let api: FakeWorksheetService;
let catalog: FakeCatalog;
let queue: FakeQueue;
let prefs: FakePrefs;

async function render(): Promise<Harness> {
  const fixture = TestBed.createComponent(FicheAtelier);
  fixture.detectChanges();
  // Un tour de boucle d'événements, et non `whenStable()` : la lecture part d'un
  // `effect`, dans une promesse que le runtime zoneless ne compte pas comme une
  // tâche en attente. `whenStable()` rendrait la main avant que la fiche soit
  // revenue, et l'écran serait encore en chargement.
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
  fixture.detectChanges();
  return { fixture, el: fixture.nativeElement, api, catalog, queue, prefs };
}

describe('la fiche d’atelier', () => {
  beforeEach(() => {
    api = new FakeWorksheetService();
    catalog = new FakeCatalog();
    queue = new FakeQueue();
    prefs = new FakePrefs();
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        { provide: WorksheetService, useValue: api },
        { provide: AdminCatalogService, useValue: catalog },
        { provide: WorksheetQueue, useValue: queue },
        { provide: StaffPrefsService, useValue: prefs },
        { provide: PermissionsStore, useValue: { identity: () => ME } },
      ],
    });
  });

  /**
   * 🔴 **La fiche suit le FOUR, pas le calendrier** (décidé le 2026-09-13).
   *
   * Demain dès que le plan de demain est arrêté, aujourd'hui sinon. Ni l'un ni
   * l'autre en dur : « aujourd'hui » laissait le fournil de la nuit sur la
   * journée qui vient de finir, « demain » le faisait cocher une fiche qui
   * n'existe pas encore. C'est le geste du soir — arrêter le plan — qui fait
   * basculer l'écran, et non une heure devinée sur l'horloge du poste.
   */
  it('montre DEMAIN dès que le plan de demain est arrêté', async () => {
    api.byDay.set(tomorrow(), sheet({ date: tomorrow(), generatedAt: `${tomorrow()}T20:05:00` }));

    const { el } = await render();

    expect(api.asked[0]).toBe(tomorrow());
    // Une seule lecture : la journée qui porte un tirage est celle qu'on fabrique.
    expect(api.asked).toEqual([tomorrow()]);
    // L'écran NOMME sa journée : sans sélecteur, c'est la seule chose qui dise
    // au fournil quel jour il coche.
    expect(el.textContent).toContain('demain');
  });

  it('retombe sur AUJOURD’HUI tant que le plan de demain n’est pas arrêté', async () => {
    api.byDay.set(tomorrow(), sheet({ date: tomorrow(), generatedAt: null, lines: [] }));
    api.byDay.set(today(), sheet());

    const { el } = await render();

    expect(api.asked).toEqual([tomorrow(), today()]);
    expect(el.querySelectorAll('app-worksheet-line')).toHaveLength(2);
  });

  /**
   * L'en-tête nomme la journée qu'on LIT, jamais celle qu'on a demandée. Sans
   * sélecteur de date, c'est la seule chose qui dise au fournil de quel jour il
   * parle — et se tromper d'un jour est exactement l'erreur que cette fiche
   * peut coûter le plus cher.
   */
  it('nomme la journée servie, pas celle qui a été demandée', async () => {
    api.byDay.set(tomorrow(), sheet({ date: tomorrow(), generatedAt: `${tomorrow()}T20:05:00` }));

    const { fixture } = await render();

    expect(fixture.componentInstance['date']()).toBe(tomorrow());
  });

  it('montre les lignes du poste, quantité et contenant', async () => {
    const { el } = await render();

    expect(el.querySelectorAll('app-worksheet-line')).toHaveLength(2);
    expect(el.textContent).toContain('Baguette tradition');
    expect(el.textContent).toContain('4 tourneuses');
  });

  it('ne montre ni prix, ni euro, ni nom de client — par construction', async () => {
    const { el } = await render();

    expect(el.textContent).not.toContain('€');
  });

  it('🔴 écrit la coche à l’écran AVANT de la confier à la file', async () => {
    const { fixture, el, queue: q } = await render();
    const box: HTMLInputElement | null = el.querySelector('input[type="checkbox"]');

    box?.click();
    fixture.detectChanges();

    // Le serveur n'a rien confirmé, et la ligne est déjà faite à l'écran : c'est
    // tout l'objet du sous-sol.
    expect(el.querySelector('app-worksheet-line')?.classList.contains('is-done')).toBe(true);
    expect(q.marks).toEqual([{ date: today(), sku: 'BAG', done: true, initials: 'MJ' }]);
  });

  it('décocher renvoie un geste inverse, jamais un second geste identique', async () => {
    const { fixture, el, queue: q } = await render();
    const box: HTMLInputElement | null = el.querySelector('input[type="checkbox"]');

    box?.click();
    fixture.detectChanges();
    el.querySelector<HTMLInputElement>('input[type="checkbox"]')?.click();
    fixture.detectChanges();

    expect(q.marks.map((mark) => mark.done)).toEqual([true, false]);
  });

  it('dit l’heure du tirage en pied', async () => {
    const { el } = await render();

    expect(el.querySelector('.fa-foot-origin')?.textContent).toContain('Tirée à 4 h 05');
  });

  it('🔴 ne fabrique AUCUNE heure quand le plan n’est pas arrêté', async () => {
    api.view = sheet({ generatedAt: null });
    const { el } = await render();
    const foot = el.querySelector('.fa-foot-origin')?.textContent ?? '';

    expect(foot).toContain('pas arrêté');
    expect(foot).not.toContain('Tirée à');
  });

  it('n’affiche aucun bandeau quand rien n’a bougé depuis le tirage', async () => {
    const { el } = await render();

    expect(el.querySelector('app-drift-banner')).toBeNull();
  });

  it('affiche le bandeau d’écart, et nomme la ligne déjà cochée', async () => {
    api.view = sheet({
      drift: {
        orders: 14,
        addedUnits: 18,
        lines: [
          { sku: 'SEI', productName: 'Pain de seigle', from: 30, to: 42, done: true },
          { sku: 'BAG', productName: 'Baguette tradition', from: 160, to: 166, done: false },
        ],
      },
    });
    const { el } = await render();

    expect(el.querySelector('app-drift-banner')).not.toBeNull();
    expect(el.textContent).toContain('déjà cochée');
  });

  it('laisse la fiche à l’écran quand le catalogue est muet, et le DIT', async () => {
    // Sans catalogue, chaque SKU tombe dans le groupe sans rayon : la fiche
    // resterait juste mais sans poste, et « Hors catalogue » affirmerait que le
    // fournil fabrique des articles retirés de la vente.
    catalog.items = null;
    const { el } = await render();

    expect(el.querySelector('fold-callout')).not.toBeNull();
    expect(el.querySelectorAll('app-worksheet-line')).toHaveLength(2);
    expect(el.textContent).toContain('Rayon inconnu');
  });

  it('passe par fold pour l’erreur de lecture, avec de quoi réessayer', async () => {
    api.view = null;
    const { el } = await render();

    const empty = el.querySelector('fold-empty-state');
    expect(empty).not.toBeNull();
    expect(empty?.getAttribute('tone')).toBe('alert');
    expect(el.querySelector('app-worksheet-line')).toBeNull();
  });

  it('passe par fold pour le vide', async () => {
    api.view = sheet({ lines: [] });
    const { el } = await render();

    expect(el.querySelector('fold-empty-state')).not.toBeNull();
    expect(el.querySelector('.fa-body')).toBeNull();
  });

  it('ouvre sur la fiche que la PERSONNE a laissée', async () => {
    api.view = sheet({
      lines: [line(), line({ sku: 'CRO', productName: 'Croissant', quantity: 240 })],
    });
    catalog.items = [
      ...CATALOGUE,
      {
        sku: 'CRO',
        name: 'Croissant',
        unitPriceMillicents: 100,
        vatRate: 5.5,
        category: 'viennoiserie',
      },
    ];
    prefs.category = 'pain';
    const { el } = await render();

    // « Viennoiseries » vient avant « Pains » dans l'ordre de la vitrine : sans
    // la préférence, c'est elle qui se serait ouverte.
    expect(el.querySelector('.fa-title')?.textContent?.trim()).toBe('Pains');
  });
});
