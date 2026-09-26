import { HttpErrorResponse } from '@angular/common/http';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import {
  SHELF_LABEL_UNKNOWN,
  UNSHELVED_WORKSHOP_GROUP_KEY,
  type ProductionWorksheetView,
  type StaffNavPreferencesPatch,
  type WorkshopGroup,
  type WorkshopLine,
} from '@lfd/contracts';
import { beforeEach, describe, expect, it } from 'vitest';

import { PermissionsStore } from '../../auth/permissions.store';
import { StaffPrefsService } from '../../shared/staff-prefs/staff-prefs.service';
import { dayLabelOf } from '../worksheet-day';
import { WorksheetService } from '../worksheet.service';
import { FicheAtelier } from './fiche-atelier';

/**
 * Ce que ces cas tiennent, et que ni `tsc` ni le build AOT ne peuvent dire :
 *
 * - 🔴 **l'écran ne calcule rien** : fiches, listes et chiffres sont servis
 *   (`groups`), écrits à la main ici — le test ne réimplémente pas le groupement,
 *   et un chiffre incohérent s'affiche tel quel ;
 * - 🔴 **la journée et son mot viennent du serveur** : les dates des fixtures
 *   sont absolues À DESSEIN, l'écran ne les compare plus à l'horloge du poste ;
 * - une coche se montre AVANT de partir, et la ligne change de liste à la
 *   relecture qui suit ;
 * - les quatre états passent par fold ; aucun prix, aucun nom de client.
 */

const DAY = '2026-09-15';
const NEXT_DAY = '2026-09-16';

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

const SEIGLE = line({ sku: 'SEI', productName: 'Pain de seigle', quantity: 30 });
const BAGUETTE_DONE = line({ done: true, initials: 'MJ', doneAt: `${DAY}T04:30:00` });

/** Des familles opaques, telles que le référentiel les livre : un id, un nom, un rang. */
const VIENNOISERIES = { id: 'fam_01J9V1', name: 'Viennoiseries', position: 1 };
const PAINS = { id: 'fam_01J9P2', name: 'Pains', position: 2 };

/** Le rayon des pains, rien de coché. */
function painTodo(): WorkshopGroup {
  return {
    key: PAINS.id,
    family: PAINS,
    category: null,
    label: 'Pains',
    lineCount: 2,
    doneCount: 0,
    totalUnits: 190,
    remainingUnits: 190,
    doneUnits: 0,
    lines: [line(), SEIGLE],
    pending: [line(), SEIGLE],
    done: [],
  };
}

/** Le même rayon, la baguette sortie — tel que le serveur le rend après la coche. */
function painBaguetteDone(): WorkshopGroup {
  return {
    ...painTodo(),
    doneCount: 1,
    remainingUnits: 30,
    doneUnits: 160,
    lines: [BAGUETTE_DONE, SEIGLE],
    pending: [SEIGLE],
    done: [BAGUETTE_DONE],
  };
}

function sheet(over: Partial<ProductionWorksheetView> = {}): ProductionWorksheetView {
  const groups = over.groups ?? [painTodo()];
  return {
    date: DAY,
    generatedAt: `${DAY}T04:05:00`,
    retakenAt: null,
    lines: [],
    drift: null,
    groups,
    shelvesKnown: true,
    relativeDay: 'today',
    ...over,
  };
}

/** Une coche telle que le service l'a reçue. */
interface SentMark {
  readonly date: string;
  readonly sku: string;
  readonly done: boolean;
  readonly initials: string;
}

class FakeWorksheetService {
  /** Ce que sert `current()`. `null` = la lecture échoue. */
  view: ProductionWorksheetView | null = sheet();
  reads = 0;
  readonly marks: SentMark[] = [];
  /** Ce que le serveur répond aux coches — `null` = il les accepte. */
  markError: unknown = null;
  /** Retenir les réponses, pour éprouver ce qui se passe PENDANT un envoi ou une lecture. */
  holdMarks = false;
  holdReads = false;
  private readonly heldMarks: (() => void)[] = [];
  private readonly heldReads: (() => void)[] = [];

  async current(): Promise<ProductionWorksheetView> {
    this.reads += 1;
    // La réponse est prise AU DÉPART : une lecture retenue rend l'état d'alors.
    const served = this.view;
    if (this.holdReads) {
      await new Promise<void>((resolve) => this.heldReads.push(resolve));
    }
    if (served === null) {
      throw new Error('lecture refusée');
    }
    return served;
  }

  async retake(): Promise<void> {
    // Rien : le retirage n'est pas éprouvé ici.
  }

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

let api: FakeWorksheetService;
let prefs: FakePrefs;

/** Un tour de boucle : la réponse du service double arrive dans une promesse. */
async function settle(fixture: ComponentFixture<FicheAtelier>): Promise<void> {
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
  fixture.detectChanges();
}

async function render(): Promise<{ fixture: ComponentFixture<FicheAtelier>; el: HTMLElement }> {
  const fixture = TestBed.createComponent(FicheAtelier);
  fixture.detectChanges();
  // Un tour de boucle, et non `whenStable()` : la lecture part dans une promesse
  // que le runtime zoneless ne compte pas comme une tâche en attente.
  await settle(fixture);
  return { fixture, el: fixture.nativeElement };
}

// La baguette est cherchée par son NOM, pas par sa place : cochée, elle passe
// de la liste en cours au rail des faites.
const baguette = (el: HTMLElement): Element | undefined =>
  [...el.querySelectorAll('app-worksheet-line')].find((node) =>
    (node.textContent ?? '').includes('Baguette tradition'),
  );

const premiere = (el: HTMLElement): boolean => baguette(el)?.classList.contains('is-done') ?? false;

const premiereCase = (el: HTMLElement): HTMLInputElement | null =>
  baguette(el)?.querySelector('input[type="checkbox"]') ?? null;

const namesIn = (el: HTMLElement, selector: string): string[] =>
  [...el.querySelectorAll(`${selector} .wl-name`)].map((node) => node.textContent?.trim() ?? '');

const text = (el: HTMLElement, selector: string): string =>
  el.querySelector(selector)?.textContent?.replace(/\s+/gu, ' ') ?? '';

describe('la fiche d’atelier', () => {
  beforeEach(() => {
    api = new FakeWorksheetService();
    prefs = new FakePrefs();
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        { provide: WorksheetService, useValue: api },
        { provide: StaffPrefsService, useValue: prefs },
        { provide: PermissionsStore, useValue: { identity: () => ME } },
      ],
    });
  });

  it('nomme la journée SERVIE, et son mot tel que le serveur le dit', async () => {
    api.view = sheet({ date: NEXT_DAY, relativeDay: 'tomorrow' });

    const { el } = await render();

    expect(api.reads).toBe(1);
    expect(text(el, '.fa-eyebrow')).toContain(dayLabelOf(NEXT_DAY));
    expect(text(el, '.fa-offset')).toContain('demain');
  });

  it('ne dit ni « aujourd’hui » ni « demain » quand le serveur ne le dit pas', async () => {
    api.view = sheet({ relativeDay: null });

    const { el } = await render();

    expect(el.querySelector('.fa-offset')).toBeNull();
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

  /**
   * 🔴 L'écran n'additionne rien : des chiffres servis volontairement
   * incohérents avec les lignes s'affichent TELS QUELS. Un écran qui recompterait
   * afficherait 190, 2 ou 0 ici.
   */
  it('🔴 affiche les chiffres servis tels quels, même incohérents', async () => {
    api.view = sheet({
      groups: [
        {
          ...painBaguetteDone(),
          lineCount: 3,
          doneCount: 7,
          totalUnits: 12345,
          remainingUnits: 999,
          doneUnits: 555,
        },
      ],
    });
    const { el } = await render();

    expect(text(el, '.fa-figure-value--accent')).toContain('999');
    expect(text(el, '.fa-figures')).toContain('7 / 3');
    expect(text(el, '.fa-tabs')).toContain('Pains 7/3');
    expect(text(el, '.fa-band-sum')).toContain('7 lignes sur 3 faites');
    expect(text(el, '.fa-band-sum')).toContain('12345 pièces au total');
  });

  it('montre au poste fixe toutes les lignes servies, dans l’ordre servi', async () => {
    api.view = sheet({ groups: [painBaguetteDone()] });
    const { el } = await render();

    expect(namesIn(el, '.fa-lines')).toEqual(['Baguette tradition', 'Pain de seigle']);
    expect(premiere(el)).toBe(true);
  });

  it('envoie la coche, puis relit', async () => {
    const { fixture, el } = await render();
    api.view = sheet({ groups: [painBaguetteDone()] });

    premiereCase(el)?.click();
    await settle(fixture);

    expect(api.marks).toEqual([{ date: DAY, sku: 'BAG', done: true, initials: 'MJ' }]);
    expect(api.reads).toBe(2);
    expect(premiere(el)).toBe(true);
  });

  it('coche à l’écran tout de suite, et désarme la case le temps de l’envoi', async () => {
    const { fixture, el } = await render();
    api.holdMarks = true;
    api.view = sheet({ groups: [painBaguetteDone()] });

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
    expect(api.reads).toBe(1);
    const said = text(el, '.fa-mark-failed');
    expect(said).toContain('Baguette tradition');
    expect(said).toContain('Le plan du jour n’est pas arrêté.');
  });

  it('décocher renvoie un geste inverse, jamais un second geste identique', async () => {
    const { fixture, el } = await render();
    api.view = sheet({ groups: [painBaguetteDone()] });
    premiereCase(el)?.click();
    await settle(fixture);

    api.view = sheet();
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

      api.view = sheet({ groups: [painBaguetteDone()] });
      relancer();
      await settle(fixture);

      expect(premiere(el)).toBe(true);
    });

    /**
     * 🔴 Une relecture partie AVANT une coche acceptée revient avec l'état
     * d'avant. La laisser gagner décocherait la case sous les doigts de qui
     * vient de la cocher.
     */
    it('🔴 jette une relecture partie avant une coche acceptée', async () => {
      const { fixture, el } = await render();
      api.holdMarks = true;
      premiereCase(el)?.click();
      fixture.detectChanges();

      // La relecture périodique part avec la fiche d'AVANT la coche, et reste en vol.
      api.holdReads = true;
      relancer();
      api.holdReads = false;

      // La coche est acceptée ; la relecture d'après écriture rend la ligne faite.
      api.view = sheet({ groups: [painBaguetteDone()] });
      api.releaseMarks();
      await settle(fixture);
      expect(premiere(el)).toBe(true);

      api.releaseReads();
      await settle(fixture);
      await settle(fixture);

      expect(premiere(el)).toBe(true);
      expect(premiere(el)).toBe(true);
    });

    it('🔴 dit quand la fiche bascule de journée pendant qu’on la regarde', async () => {
      const { fixture, el } = await render();
      expect(el.querySelector('.fa-day-turned')).toBeNull();

      api.view = sheet({ date: NEXT_DAY, relativeDay: 'tomorrow' });
      relancer();
      await settle(fixture);

      expect(text(el, '.fa-day-turned')).toContain('désormais');
      expect(text(el, '.fa-day-turned')).toContain(dayLabelOf(NEXT_DAY));
    });

    it('dit que la relecture a échoué, sans vider la fiche', async () => {
      const { fixture, el } = await render();
      expect(text(el, '.fa-foot-origin')).toContain('relue à');

      api.view = null;
      relancer();
      await settle(fixture);

      expect(el.querySelectorAll('app-worksheet-line')).toHaveLength(2);
      expect(text(el, '.fa-foot-origin')).toContain('relecture impossible');
    });
  });

  it('dit l’heure du tirage en pied', async () => {
    const { el } = await render();

    expect(text(el, '.fa-foot-origin')).toContain('Tirée à 4 h 05');
  });

  it('🔴 ne fabrique AUCUNE heure quand le plan n’est pas arrêté', async () => {
    api.view = sheet({ generatedAt: null });
    const { el } = await render();
    const foot = text(el, '.fa-foot-origin');

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

  it('laisse la fiche à l’écran quand le serveur n’a pas lu les rayons, et le DIT', async () => {
    api.view = sheet({
      shelvesKnown: false,
      groups: [
        {
          ...painTodo(),
          key: UNSHELVED_WORKSHOP_GROUP_KEY,
          family: null,
          label: SHELF_LABEL_UNKNOWN,
        },
      ],
    });
    const { el } = await render();

    expect(text(el, 'fold-callout')).toContain('rayons n');
    expect(el.querySelectorAll('app-worksheet-line')).toHaveLength(2);
    expect(text(el, '.fa-title')).toContain('Rayon inconnu');
  });

  it('ne dit rien des rayons quand le serveur les a lus', async () => {
    const { el } = await render();

    expect(el.querySelector('fold-callout')).toBeNull();
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
    api.view = sheet({ groups: [] });
    const { el } = await render();

    expect(el.querySelector('fold-empty-state')).not.toBeNull();
    expect(el.querySelector('.fa-body')).toBeNull();
  });

  /** Une fiche des viennoiseries, servie la première. */
  function viennoiserieTodo(): WorkshopGroup {
    const croissant = line({ sku: 'CRO', productName: 'Croissant', quantity: 240 });
    return {
      key: VIENNOISERIES.id,
      family: VIENNOISERIES,
      category: null,
      label: 'Viennoiseries',
      lineCount: 1,
      doneCount: 0,
      totalUnits: 240,
      remainingUnits: 240,
      doneUnits: 0,
      lines: [croissant],
      pending: [croissant],
      done: [],
    };
  }

  it('ouvre sur la fiche que la PERSONNE a laissée', async () => {
    api.view = sheet({ groups: [viennoiserieTodo(), painTodo()] });
    prefs.category = PAINS.id;
    const { el } = await render();

    // « Viennoiseries » est servie la première : sans la préférence, c'est elle
    // qui se serait ouverte.
    expect(text(el, '.fa-title').trim()).toBe('Pains');
    expect(text(el, '.fa-eyebrow')).toContain('fiche 2 sur 2');
  });

  /**
   * Régression : les préférences enregistrées avant les familles en données
   * portent un ancien code de rayon (`"pain"`), qu'aucune fiche ne porte plus
   * (2026-09-26). Il ne doit ni planter, ni ouvrir une fiche devinée.
   */
  it('retombe sur la première fiche quand la préférence porte un ancien code de rayon', async () => {
    api.view = sheet({ groups: [viennoiserieTodo(), painTodo()] });
    prefs.category = 'pain';
    const { el } = await render();

    expect(text(el, '.fa-title').trim()).toBe('Viennoiseries');
    expect(text(el, '.fa-eyebrow')).toContain('fiche 1 sur 2');
  });
});
