import { HttpErrorResponse } from '@angular/common/http';
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

/** Une coche telle que le service l'a reçue. */
interface SentMark {
  readonly date: string;
  readonly sku: string;
  readonly done: boolean;
  readonly initials: string;
}

class FakeWorksheetService {
  view: ProductionWorksheetView | null = sheet();
  retakes = 0;
  /** Les journées demandées, dans l'ordre — la règle de choix se lit là-dessus. */
  readonly asked: string[] = [];
  /** Une réponse par journée ; à défaut, `view` pour toutes. */
  readonly byDay = new Map<string, ProductionWorksheetView>();

  async worksheet(date: string): Promise<ProductionWorksheetView> {
    this.asked.push(date);
    if (this.holdReads) {
      await new Promise<void>((resolve) => this.heldReads.push(resolve));
    }
    const served = this.byDay.get(date) ?? this.view;
    if (served === null) {
      throw new Error('lecture refusée');
    }
    return served;
  }

  async retake(): Promise<void> {
    this.retakes += 1;
  }

  /** Les coches envoyées, dans l'ordre. */
  readonly marks: SentMark[] = [];
  /** Ce que le serveur répond aux coches — `null` = il les accepte. */
  markError: unknown = null;
  /** Retenir les réponses, pour éprouver ce qui se passe PENDANT un envoi ou une lecture. */
  holdMarks = false;
  holdReads = false;
  private readonly heldMarks: (() => void)[] = [];
  private readonly heldReads: (() => void)[] = [];

  async mark(date: string, sku: string, done: boolean, initials: string): Promise<void> {
    this.marks.push({ date, sku, done, initials });
    if (this.holdMarks) {
      await new Promise<void>((resolve) => this.heldMarks.push(resolve));
    }
    if (this.markError !== null) {
      throw this.markError;
    }
  }

  releaseMarks(): void {
    for (const resolve of this.heldMarks.splice(0)) {
      resolve();
    }
  }

  releaseReads(): void {
    for (const resolve of this.heldReads.splice(0)) {
      resolve();
    }
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
  readonly prefs: FakePrefs;
}

let api: FakeWorksheetService;
let catalog: FakeCatalog;
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
  return { fixture, el: fixture.nativeElement, api, catalog, prefs };
}

describe('la fiche d’atelier', () => {
  beforeEach(() => {
    api = new FakeWorksheetService();
    catalog = new FakeCatalog();
    prefs = new FakePrefs();
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        { provide: WorksheetService, useValue: api },
        { provide: AdminCatalogService, useValue: catalog },
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

  /** Un tour de boucle : la réponse du service double arrive dans une promesse. */
  async function settle(fixture: ComponentFixture<FicheAtelier>): Promise<void> {
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    fixture.detectChanges();
  }

  // La baguette est cherchée par son NOM, pas par sa place : cochée, elle passe
  // de la liste en cours au rail des faites.
  const baguette = (el: HTMLElement): Element | undefined =>
    [...el.querySelectorAll('app-worksheet-line')].find((node) =>
      (node.textContent ?? '').includes('Baguette tradition'),
    );

  const premiere = (el: HTMLElement): boolean =>
    baguette(el)?.classList.contains('is-done') ?? false;

  const premiereCase = (el: HTMLElement): HTMLInputElement | null =>
    baguette(el)?.querySelector('input[type="checkbox"]') ?? null;

  const namesIn = (el: HTMLElement, selector: string): string[] =>
    [...el.querySelectorAll(`${selector} .wl-name`)].map((node) => node.textContent?.trim() ?? '');

  it('sépare ce qui reste à sortir de ce qui est sorti, au poste fixe', async () => {
    api.view = sheet({
      lines: [
        line({ done: true, initials: 'PL' }),
        line({ sku: 'SEI', productName: 'Pain de seigle', quantity: 30 }),
      ],
    });
    const { el } = await render();

    expect(namesIn(el, '.fa-todo-lines')).toEqual(['Pain de seigle']);
    expect(namesIn(el, '.fa-rail')).toEqual(['Baguette tradition']);
    expect(el.querySelector('.fa-rail')?.textContent).toContain('Production faite · 1');
  });

  it('fait passer une ligne cochée dans le rail des faites', async () => {
    const { fixture, el } = await render();
    expect(el.querySelector('.fa-rail-none')).not.toBeNull();

    premiereCase(el)?.click();
    await settle(fixture);

    expect(namesIn(el, '.fa-todo-lines')).toEqual(['Pain de seigle']);
    expect(namesIn(el, '.fa-rail')).toEqual(['Baguette tradition']);
  });

  it('envoie la coche au serveur, et la garde une fois acceptée', async () => {
    const { fixture, el } = await render();

    premiereCase(el)?.click();
    await settle(fixture);

    expect(api.marks).toEqual([{ date: today(), sku: 'BAG', done: true, initials: 'MJ' }]);
    expect(premiere(el)).toBe(true);
  });

  it('coche à l’écran tout de suite, et désarme la case le temps de l’envoi', async () => {
    const { fixture, el } = await render();
    api.holdMarks = true;

    premiereCase(el)?.click();
    fixture.detectChanges();

    expect(premiere(el)).toBe(true);
    expect(premiereCase(el)?.disabled).toBe(true);

    api.releaseMarks();
    await settle(fixture);

    expect(premiereCase(el)?.disabled).toBe(false);
    expect(premiere(el)).toBe(true);
  });

  /**
   * Régression : une coche refusée restait affichée cochée jusqu'au
   * rechargement, sans que rien ne le dise (constaté en dev le 2026-09-14).
   */
  it('🔴 remet la case en arrière quand le serveur refuse, et DIT pourquoi', async () => {
    const { fixture, el } = await render();
    api.markError = new HttpErrorResponse({
      status: 409,
      error: { message: 'Le plan du jour n’est pas arrêté.' },
    });

    premiereCase(el)?.click();
    await settle(fixture);

    expect(premiere(el)).toBe(false);
    const said = el.querySelector('.fa-mark-failed')?.textContent ?? '';
    expect(said).toContain('Baguette tradition');
    expect(said).toContain('Le plan du jour n’est pas arrêté.');
  });

  it('décocher renvoie un geste inverse, jamais un second geste identique', async () => {
    const { fixture, el } = await render();

    premiereCase(el)?.click();
    await settle(fixture);
    premiereCase(el)?.click();
    await settle(fixture);

    expect(api.marks.map((mark) => mark.done)).toEqual([true, false]);
  });

  describe('la relecture', () => {
    beforeEach(() => {
      Object.defineProperty(document, 'visibilityState', {
        configurable: true,
        get: () => 'visible',
      });
    });

    /** Revenir sur l'onglet relit tout de suite — c'est le déclencheur le plus sûr en test. */
    function relancer(): void {
      document.dispatchEvent(new Event('visibilitychange'));
    }

    it('montre une coche posée sur un autre poste', async () => {
      const { fixture, el } = await render();
      expect(premiere(el)).toBe(false);

      api.view = sheet({
        lines: [
          line({ done: true, initials: 'PL' }),
          line({ sku: 'SEI', productName: 'Pain de seigle', quantity: 30 }),
        ],
      });
      relancer();
      await settle(fixture);

      expect(premiere(el)).toBe(true);
    });

    /**
     * 🔴 Le seul piège d'ordre qui reste : une relecture partie AVANT une coche
     * acceptée revient avec l'état d'avant. La laisser gagner décocherait la
     * case sous les doigts de qui vient de la cocher.
     */
    it('🔴 jette une relecture partie avant une coche acceptée', async () => {
      const { fixture, el } = await render();
      api.holdMarks = true;
      premiereCase(el)?.click();
      fixture.detectChanges();

      api.holdReads = true;
      relancer();
      api.releaseMarks();
      await settle(fixture);
      expect(premiere(el)).toBe(true);

      // La relecture revient avec la fiche d'AVANT la coche : elle doit être jetée.
      api.releaseReads();
      await settle(fixture);
      await settle(fixture);

      expect(premiere(el)).toBe(true);
    });

    it('🔴 dit quand la fiche bascule de journée pendant qu’on la regarde', async () => {
      const { fixture, el } = await render();
      api.byDay.set(tomorrow(), sheet({ date: tomorrow() }));

      relancer();
      await settle(fixture);

      expect(el.querySelector('.fa-day-turned')?.textContent).toContain('désormais');
    });

    it('dit que la relecture a échoué, sans vider la fiche', async () => {
      const { fixture, el } = await render();
      expect(el.querySelector('.fa-foot-origin')?.textContent).toContain('relue à');

      api.view = null;
      relancer();
      await settle(fixture);

      expect(el.querySelectorAll('app-worksheet-line')).toHaveLength(2);
      expect(el.querySelector('.fa-foot-origin')?.textContent).toContain('relecture impossible');
    });
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
