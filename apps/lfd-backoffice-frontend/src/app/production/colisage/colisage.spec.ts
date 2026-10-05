import { HttpErrorResponse } from '@angular/common/http';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import type {
  DeliveryPackingRoundView,
  PackingLine,
  PackingResource,
  PackingSheet,
  ProductionPackingView,
} from '@lfd/contracts';
import { beforeEach, describe, expect, it } from 'vitest';

import { type DayWatch, DayVersionWatcher } from '../../shared/day-version/day-version-watcher';
import { DeliveryBinsService } from '../../livraison/delivery-bins.service';
import { DeliveryLoadingService } from '../../livraison/delivery-loading.service';
import { PermissionsStore } from '../../auth/permissions.store';
import { PackingService } from '../packing.service';
import { Colisage } from './colisage';

/**
 * Le veilleur de journée, doublé : il garde la relecture que l'écran lui
 * confie, et le test la déclenche comme le ferait une version qui bouge.
 */
const watched: DayWatch[] = [];
const fakeWatcher = {
  watch: (spec: DayWatch): void => {
    watched.push(spec);
  },
};

/**
 * Ce que ces cas tiennent, et que ni `tsc` ni le build AOT ne peuvent dire :
 *
 * - 🔴 **l'écran n'additionne rien** — le double sert des chiffres
 *   VOLONTAIREMENT incohérents avec les lignes, et l'écran doit les afficher
 *   tels quels. S'il calculait, ces cas échoueraient ;
 * - 🔴 **chaque geste accepté déclenche une relecture**, et c'est ce qui revient
 *   qui s'affiche — y compris quand une relecture périodique était en vol ;
 * - 🔴 **une journée non arrêtée le DIT**, et **un reste NÉGATIF se voit** ;
 * - **le QR d'une feuille imprimée ouvre le bon bac**, et une référence
 *   inconnue se dit en toutes lettres.
 *
 * Aucune fixture ne dérive ses chiffres de ses lignes : c'est le serveur qui
 * compte, et le double joue le serveur. Les défauts ci-dessous sont cohérents
 * pour que les cas ordinaires se lisent ; les cas incohérents le sont exprès.
 */

/** Aujourd'hui, en heure locale : le poste ne connaît pas d'autre journée. */
function today(): string {
  return isoOf(new Date());
}

/** Demain, en heure locale — la journée que le geste du soir fait basculer. */
function tomorrow(): string {
  const next = new Date();
  next.setDate(next.getDate() + 1);
  return isoOf(next);
}

function isoOf(date: Date): string {
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

function line(over: Partial<PackingLine> = {}): PackingLine {
  return {
    sku: 'CRO',
    productName: 'Croissant',
    quantity: 12,
    packed: false,
    initials: null,
    packedAt: null,
    awaitingProduction: false,
    ...over,
  };
}

/** Une commande de deux lignes dehors (12 + 8), et les chiffres que le serveur en rend. */
function bac(over: Partial<PackingSheet> = {}): PackingSheet {
  return {
    reference: 'CMD-001',
    orderId: 'o-CMD-001',
    containers: 0,
    customerLabel: 'Hôtel du Parc',
    fulfillmentMethod: 'delivery',
    destination: '12 rue des Lilas',
    lines: [line(), line({ sku: 'BAG', productName: 'Baguette', quantity: 8 })],
    lineCount: 2,
    packedLines: 0,
    remainingLines: 2,
    pieces: 20,
    packedPieces: 0,
    canDeclareReady: false,
    packedAt: null,
    packedBy: null,
    packedByName: null,
    ...over,
  };
}

function resource(over: Partial<PackingResource> = {}): PackingResource {
  return {
    sku: 'CRO',
    productName: 'Croissant',
    produced: 40,
    allocated: 0,
    remaining: 40,
    awaitingProduction: false,
    exhausted: false,
    ...over,
  };
}

function view(over: Partial<ProductionPackingView> = {}): ProductionPackingView {
  return {
    date: today(),
    // Une heure relative à aujourd'hui : le poste lit la journée du four, et une
    // date en dur y deviendrait fausse le lendemain.
    closedAt: `${today()}T20:05:00`,
    sheets: [bac()],
    resources: [
      resource(),
      resource({ sku: 'BAG', productName: 'Baguette', produced: 20, remaining: 20 }),
    ],
    orderCount: 1,
    todoCount: 1,
    readyCount: 0,
    relativeDay: 'today',
    ...over,
  };
}

/**
 * Une commande en RETRAIT : la seule qui garde le compte anonyme de containers
 * depuis le lot PC1 (D4) — une livraison choisit un bac d'un format.
 */
function retrait(over: Partial<PackingSheet> = {}): PackingSheet {
  return bac({ fulfillmentMethod: 'pickup', destination: 'Le Labo', ...over });
}

/** Une commande déclarée prête, ses lignes dans le bac. */
function readyBac(over: Partial<PackingSheet> = {}): PackingSheet {
  return bac({
    lines: [line({ packed: true, initials: 'PL' })],
    lineCount: 1,
    packedLines: 1,
    remainingLines: 0,
    pieces: 12,
    packedPieces: 12,
    packedAt: `${today()}T05:12:00`,
    packedBy: 'Paul',
    packedByName: null,
    ...over,
  });
}

class FakePackingService {
  packingView: ProductionPackingView | null = view();
  /** Les journées demandées, dans l'ordre — chaque relecture s'y inscrit. */
  readonly asked: string[] = [];
  /** Une réponse par journée ; à défaut, `packingView` pour toutes. */
  readonly byDay = new Map<string, ProductionPackingView>();
  /** Les commandes fermées (« Déclarer prête »), par identifiant. */
  readonly closed: string[] = [];
  closeError: unknown = null;
  /** Les commandes rouvertes, par identifiant. */
  readonly reopened: string[] = [];
  reopenError: unknown = null;
  /** Retenir les lectures, pour éprouver ce qui se passe PENDANT une lecture. */
  holdReads = false;
  private readonly heldReads: (() => void)[] = [];

  async packing(date: string): Promise<ProductionPackingView | never> {
    this.asked.push(date);
    // 🔴 La réponse est prise AU DÉPART de la lecture, comme un vrai serveur
    // photographie son état.
    const served = this.byDay.get(date) ?? this.packingView;
    if (this.holdReads) {
      await new Promise<void>((resolve) => this.heldReads.push(resolve));
    }
    if (served === null) {
      throw new Error('lecture refusée');
    }
    return served;
  }

  async closeOrder(_date: string, orderId: string): Promise<void> {
    if (this.closeError !== null) {
      throw this.closeError;
    }
    this.closed.push(orderId);
  }

  async reopenOrder(_date: string, orderId: string): Promise<void> {
    if (this.reopenError !== null) {
      throw this.reopenError;
    }
    this.reopened.push(orderId);
  }

  releaseReads(): void {
    for (const resolve of this.heldReads.splice(0)) {
      resolve();
    }
  }
}

const ME = { firstName: 'Marie', lastName: 'Jost' };

let api: FakePackingService;

/** Les tournées que la livraison sert au poste (lot PC2) ; `null` = la lecture échoue. */
let rounds: readonly DeliveryPackingRoundView[] | null = [];
const fakeDelivery = {
  packingRounds: (day: string) =>
    rounds === null
      ? Promise.reject(new Error('tournées illisibles'))
      : Promise.resolve({ day, rounds }),
};

interface Harness {
  readonly fixture: ComponentFixture<Colisage>;
  readonly el: HTMLElement;
}

/**
 * ⚠️ Pas de `whenStable()` : la lecture part d'un `void this.load()` dans le
 * constructeur, dans une promesse que le runtime zoneless ne compte pas comme
 * une tâche en attente. `whenStable()` rendrait la main avant que les bacs
 * soient revenus, et l'écran serait encore en chargement.
 */
async function render(reference?: string): Promise<Harness> {
  const fixture = TestBed.createComponent(Colisage);
  if (reference !== undefined) {
    fixture.componentRef.setInput('reference', reference);
  }
  fixture.detectChanges();
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
  fixture.detectChanges();
  return { fixture, el: fixture.nativeElement };
}

/** Un tour de boucle : les réponses du service double arrivent dans des promesses. */
async function settle(fixture: ComponentFixture<Colisage>): Promise<void> {
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
  fixture.detectChanges();
}

/** Le texte d'un élément, espaces resserrés — le gabarit en pose partout. */
function said(element: Element | null | undefined): string {
  return (element?.textContent ?? '').replace(/\s+/gu, ' ').trim();
}

const premiere = (el: HTMLElement): boolean =>
  el.querySelector('.co-line')?.classList.contains('is-packed') ?? false;

/** Bascule la colonne de gauche sur une pile — « En cours » ou « Prêtes ». */
function openStack(fixture: ComponentFixture<Colisage>, stack: 'todo' | 'ready'): void {
  const host: HTMLElement = fixture.nativeElement;
  const label = stack === 'ready' ? 'Prêtes' : 'En cours';
  const button = Array.from(host.querySelectorAll<HTMLButtonElement>('.co-stack button')).find(
    (candidate) => candidate.textContent?.includes(label) === true,
  );
  if (button === undefined) {
    throw new Error(`le segment « ${label} » est absent du sélecteur`);
  }
  button.click();
  fixture.detectChanges();
}

/** Tape un terme dans le champ, comme le ferait un doigt. */
function type(fixture: ComponentFixture<Colisage>, term: string): void {
  const host: HTMLElement = fixture.nativeElement;
  const input = host.querySelector<HTMLInputElement>('.co-search input');
  if (input === null) {
    throw new Error('le champ de recherche est absent');
  }
  input.value = term;
  input.dispatchEvent(new Event('input'));
  fixture.detectChanges();
}

describe('le poste de colisage', () => {
  beforeEach(() => {
    api = new FakePackingService();
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        { provide: DayVersionWatcher, useValue: fakeWatcher },
        provideRouter([]),
        { provide: PackingService, useValue: api },
        // `can` : les bacs d'une livraison prête (lot 4 bis) demandent un droit que
        // ce poste de test n'a pas — il montre la phrase, sans service.
        { provide: PermissionsStore, useValue: { identity: () => ME, can: () => false } },
        { provide: DeliveryLoadingService, useValue: fakeDelivery },
        { provide: DeliveryBinsService, useValue: {} },
      ],
    });
    rounds = [];
  });

  /* ── 🔴 L'ÉCRAN N'ADDITIONNE RIEN ─────────────────────────────────────────
     Décidé le 2026-09-14. Le double sert des chiffres qui NE PEUVENT PAS
     sortir des lignes qu'il sert avec : si l'écran recalculait quoi que ce soit,
     il afficherait le chiffre des lignes, et ces cas échoueraient. */

  describe('🔴 l’écran n’additionne rien', () => {
    it('affiche le volume servi (999), pas la somme des lignes (20)', async () => {
      // 12 + 8 = 20 : le serveur dit 999, et c'est 999 qui doit se lire.
      api.packingView = view({ sheets: [bac({ pieces: 999, packedPieces: 777 })] });

      const { el } = await render();
      const order = said(el.querySelector('.co-bac'));

      expect(order).toContain('777 / 999 produits');
      expect(order).not.toContain('/ 20 produits');
    });

    it('affiche le reste servi (-7) d’une marchandise qui ne le justifie pas', async () => {
      // 40 sortis, 0 pris : un écran qui calculerait lirait 40. Le serveur dit -7.
      api.packingView = view({
        resources: [resource({ produced: 40, allocated: 0, remaining: -7 })],
      });

      const { el } = await render();
      const rows = el.querySelectorAll('.co-res');

      expect(rows).toHaveLength(1);
      expect(said(rows[0])).toContain('-7');
      expect(rows[0]?.classList.contains('is-short')).toBe(true);
    });

    it('rend « Déclarer prête » ACTIF quand le serveur le permet, ligne dehors ou non', async () => {
      // Deux lignes dehors — un écran qui appliquerait « tout est dans le bac »
      // désarmerait le bouton. La règle est au serveur, et il dit oui.
      api.packingView = view({ sheets: [bac({ canDeclareReady: true, remainingLines: 2 })] });

      const { el } = await render();

      expect(el.querySelectorAll('.co-line')).toHaveLength(2);
      expect(el.querySelector<HTMLButtonElement>('.co-close button')?.disabled).toBe(false);
    });

    it('rend « Déclarer prête » INACTIF quand le serveur le refuse, tout coché ou non', async () => {
      // Toutes les lignes cochées : un écran qui calculerait armerait le bouton.
      api.packingView = view({
        sheets: [
          bac({
            lines: [line({ packed: true }), line({ sku: 'BAG', quantity: 8, packed: true })],
            canDeclareReady: false,
          }),
        ],
      });

      const { el } = await render();

      expect(el.querySelector<HTMLButtonElement>('.co-close button')?.disabled).toBe(true);
    });

    it('affiche les lignes, les piles et la journée telles que comptées au serveur', async () => {
      api.packingView = view({
        sheets: [bac({ lineCount: 9, packedLines: 5, remainingLines: 42, canDeclareReady: false })],
        orderCount: 50,
        todoCount: 31,
        readyCount: 4,
      });

      const { el } = await render();

      // Le compte AVANT de lire les chiffres : deux lignes et une commande
      // réellement servies, que l'écran ne doit pas recompter.
      expect(el.querySelectorAll('.co-line')).toHaveLength(2);
      expect(el.querySelectorAll('.co-bac')).toHaveLength(1);

      const figures = el.querySelectorAll('.co-figure-value');
      expect(figures).toHaveLength(2);
      expect(said(figures[0])).toBe('5 / 9');
      expect(said(figures[1])).toBe('4 / 50');
      expect(said(el.querySelector('.co-open .co-band-sum'))).toBe(
        '5 lignes sur 9 dans la commande',
      );
      expect(said(el.querySelector('.co-close'))).toContain('42 lignes encore dehors');
      expect(said(el.querySelector('.co-bacs .co-band-sum'))).toBe('50 sur la journée');
      expect(said(el.querySelector('.co-stack'))).toContain('En cours 31');
      expect(said(el.querySelector('.co-stack'))).toContain('Prêtes 4');
    });

    /**
     * Le mot vient de `relativeDay`, jamais d'une comparaison à l'horloge du
     * poste : ici la journée servie EST aujourd'hui selon le poste, et le
     * serveur dit « demain ». C'est le serveur qui doit gagner.
     */
    it('dit « demain » parce que le serveur le dit, pas parce que le poste le calcule', async () => {
      api.packingView = view({ date: today(), relativeDay: 'tomorrow' });

      const { el } = await render();

      expect(said(el.querySelector('.co-offset'))).toContain('demain');
      expect(said(el.querySelector('.co-eyebrow'))).not.toContain('aujourd’hui');
    });

    it('ne dit ni « aujourd’hui » ni « demain » quand le serveur ne dit rien', async () => {
      api.packingView = view({ date: today(), relativeDay: null });

      const { el } = await render();

      expect(el.querySelector('.co-offset')).toBeNull();
    });
  });

  /**
   * 🔴 Une liste vide ressemblerait à « tout est fait ». Tant que le plan du
   * soir n'est pas arrêté, la journée n'a pas de bacs — et on le DIT, avec
   * l'endroit où le geste se fait.
   */
  it('🔴 dit que le plan n’est pas arrêté, et renvoie au prévisionnel', async () => {
    api.packingView = view({ closedAt: null, sheets: [], resources: [], orderCount: 0 });

    const { el } = await render();

    expect(el.querySelector('.co-body')).toBeNull();
    expect(el.querySelector('fold-empty-state')).not.toBeNull();
    expect(el.textContent).toContain('pas arrêté');
    expect(el.querySelector('a[foldButton]')?.getAttribute('href')).toBe(
      '/production/previsionnel',
    );
  });

  it('lit DEMAIN dès que le plan de demain est arrêté', async () => {
    api.byDay.set(
      tomorrow(),
      view({ date: tomorrow(), closedAt: `${tomorrow()}T20:05:00`, relativeDay: 'tomorrow' }),
    );

    const { el } = await render();

    // Une seule lecture : la journée qui porte un plan arrêté est celle qu'on colise.
    expect(api.asked).toEqual([tomorrow()]);
    expect(said(el.querySelector('.co-offset'))).toContain('demain');
  });

  it('retombe sur AUJOURD’HUI tant que le plan de demain n’est pas arrêté', async () => {
    api.byDay.set(tomorrow(), view({ date: tomorrow(), closedAt: null, sheets: [] }));
    api.byDay.set(today(), view());

    const { el } = await render();

    expect(api.asked).toEqual([tomorrow(), today()]);
    expect(said(el.querySelector('.co-offset'))).toContain('aujourd’hui');
  });

  it('montre les commandes, leur volume servi, leur mode et leur destination', async () => {
    api.packingView = view({
      sheets: [
        bac(),
        readyBac({
          reference: 'CMD-002',
          customerLabel: 'Café Neuf',
          fulfillmentMethod: 'pickup',
          destination: 'Comptoir Bastille',
          packedAt: null,
          packedBy: null,
          packedByName: null,
        }),
      ],
    });

    const { el } = await render();

    // Le compte AVANT la boucle : une liste qui rend un élément de moins que
    // prévu passerait sinon inaperçue.
    const orders = el.querySelectorAll('.co-bac');
    expect(orders).toHaveLength(2);
    expect(el.textContent).toContain('Livraison · 12 rue des Lilas');
    expect(el.textContent).toContain('Retrait · Comptoir Bastille');
    expect(said(orders[1])).toContain('12 / 12 produits');
  });

  describe('la relecture', () => {
    function relancer(): void {
      void watched.at(-1)?.reload();
    }

    it('ne suit que la journée du fournil quand la livraison est hors droit', async () => {
      await render();
      expect(watched.at(-1)?.journals).toEqual(['production']);
    });

    /**
     * Une tournée recomposée range la pile autrement : sans la journée de la
     * livraison, seul le filet de 5 min la voyait (2026-10-02).
     */
    it('suit aussi la journée de la livraison quand le poste peut la lire', async () => {
      TestBed.overrideProvider(PermissionsStore, {
        useValue: { identity: () => ME, can: (p: string) => p === 'delivery_loading:read' },
      });
      await render();
      expect(watched.at(-1)?.journals).toEqual(['production', 'delivery']);
    });

    it('montre une ligne mise au bac sur un autre poste', async () => {
      const { fixture, el } = await render();
      expect(premiere(el)).toBe(false);

      api.packingView = view({
        sheets: [bac({ lines: [line({ packed: true, initials: 'PL' }), line({ sku: 'BAG' })] })],
      });
      relancer();
      await settle(fixture);

      expect(premiere(el)).toBe(true);
    });

    /**
     * 🔴 Le cas multiposte : la commande qu'on a sous les yeux est déclarée
     * prête ailleurs. La relecture la range dans les prêtes — l'écran le DIT.
     */
    it('🔴 dit que la commande ouverte a été déclarée prête sur un autre poste', async () => {
      const { fixture, el } = await render();

      api.packingView = view({
        sheets: [bac({ packedAt: `${today()}T09:00:00`, packedBy: 'autre-poste' })],
      });
      relancer();
      await settle(fixture);

      expect(said(el.querySelector('.co-closed-elsewhere'))).toContain('Hôtel du Parc');
    });

    it('dit que la relecture a échoué, sans vider le poste', async () => {
      const { fixture, el } = await render();
      expect(said(el.querySelector('.co-foot-origin'))).toContain('relu à');

      api.packingView = null;
      relancer();
      await settle(fixture);

      expect(el.querySelector('.co-body')).not.toBeNull();
      expect(said(el.querySelector('.co-foot-origin'))).toContain('relecture impossible');
    });
  });

  /* ── LA DÉCLARATION ──────────────────────────────────────────────────────── */

  it('déclare la commande prête au colisage (`close`), et relit', async () => {
    api.packingView = view({ sheets: [bac({ canDeclareReady: true })] });

    const { fixture, el } = await render();
    const readsBefore = api.asked.length;
    el.querySelector<HTMLButtonElement>('.co-close button')?.click();
    await settle(fixture);

    expect(api.closed).toEqual(['o-CMD-001']);
    expect(api.asked.length).toBeGreaterThan(readsBefore);
  });

  /** Un fait irréversible échoue VISIBLEMENT plutôt que d'attendre en silence. */
  it('garde l’échec de déclaration à l’écran, et le redit', async () => {
    api.packingView = view({ sheets: [bac({ canDeclareReady: true })] });
    api.closeError = new HttpErrorResponse({
      status: 409,
      error: { code: 'packing.containers.unallocated', message: 'Il reste des pièces à répartir.' },
    });

    const { fixture, el } = await render();
    el.querySelector<HTMLButtonElement>('.co-close button')?.click();
    await settle(fixture);

    expect(el.querySelector('fold-callout')?.getAttribute('variant')).toBe('alert');
    expect(el.textContent).toContain('Il reste des pièces à répartir.');
    expect(el.querySelector('.co-line')).not.toBeNull();
  });

  it('🔴 ne laisse plus rien cocher sur une commande DÉCLARÉE PRÊTE', async () => {
    api.packingView = view({ sheets: [readyBac()], todoCount: 0, readyCount: 1 });

    const { fixture, el } = await render();
    // Une commande prête a quitté la pile « en cours » : on va la chercher dans
    // la sienne, exactement comme on le ferait pour vérifier un colis.
    openStack(fixture, 'ready');

    expect(el.querySelector<HTMLInputElement>('.co-line input')?.disabled).toBe(true);
    expect(el.querySelector('[data-declare-ready]')).toBeNull();
    expect(el.textContent).toContain('Commande déclarée prête');
  });

  /* ── ROUVRIR (K3b) ───────────────────────────────────────────────────────── */

  it('rouvre le rangement d’une commande prête, relit, et la suit dans « en cours »', async () => {
    api.packingView = view({ sheets: [readyBac()], todoCount: 0, readyCount: 1 });
    const { fixture, el } = await render();
    openStack(fixture, 'ready');
    expect(el.textContent).toContain('La commande reste prête au commerce');
    const readsBefore = api.asked.length;

    // Rouverte : le serveur la rend sans `packedAt`.
    api.packingView = view({ sheets: [bac()], todoCount: 1, readyCount: 0 });
    el.querySelector<HTMLButtonElement>('[data-reopen]')?.click();
    await settle(fixture);

    expect(api.reopened).toEqual(['o-CMD-001']);
    expect(api.asked.length).toBeGreaterThan(readsBefore);
    expect(el.querySelector('[data-declare-ready]')).not.toBeNull();
    expect(said(el.querySelector('.co-title'))).toBe('Hôtel du Parc');
  });

  it('🔴 dit le refus du serveur TEL QUEL quand le rangement ne se rouvre pas', async () => {
    api.packingView = view({ sheets: [readyBac()], todoCount: 0, readyCount: 1 });
    api.reopenError = new HttpErrorResponse({
      status: 409,
      error: { message: 'Le bac B-12 est déjà chargé dans la tournée.' },
    });
    const { fixture, el } = await render();
    openStack(fixture, 'ready');

    el.querySelector<HTMLButtonElement>('[data-reopen]')?.click();
    await settle(fixture);

    expect(said(el.querySelector('.co-reopen-failed'))).toContain(
      'Le bac B-12 est déjà chargé dans la tournée.',
    );
    expect(el.textContent).toContain('Commande déclarée prête');
  });

  /* ── LA MARCHANDISE ──────────────────────────────────────────────────────── */

  /**
   * 🔴 Les bacs demandent plus que le four n'a sorti. C'est le cas que ce poste
   * existe pour attraper : le reste servi se voit, il ne se borne pas à zéro.
   */
  it('🔴 montre un reste NÉGATIF servi, sans le masquer', async () => {
    api.packingView = view({ resources: [resource({ produced: 40, remaining: -10 })] });

    const { el } = await render();
    const short = el.querySelector('.co-res.is-short');

    expect(short).not.toBeNull();
    expect(said(short)).toContain('-10');
  });

  /* ── LE QR ───────────────────────────────────────────────────────────────── */

  /** Le QR d'une feuille imprimée : `/colisage/:reference` ouvre CE bac. */
  it('ouvre le bac que la référence de l’URL désigne', async () => {
    api.packingView = view({
      sheets: [bac(), bac({ reference: 'CMD-002', customerLabel: 'Café Neuf' })],
    });

    const { el } = await render('CMD-002');

    expect(said(el.querySelector('.co-title'))).toBe('Café Neuf');
    expect(said(el.querySelector('.co-bac.is-open'))).toContain('Café Neuf');
  });

  it('🔴 DIT la référence inconnue en toutes lettres, plutôt qu’un écran vide', async () => {
    const { el } = await render('CMD-999');

    expect(said(el.querySelector('fold-callout'))).toContain('CMD-999');
    // Les bacs de la journée restent à l'écran : un QR d'hier ne doit pas faire
    // croire que le poste est vide.
    expect(el.querySelectorAll('.co-bac')).toHaveLength(1);
  });

  it('passe par fold pour l’erreur de lecture, avec de quoi réessayer', async () => {
    api.packingView = null;

    const { el } = await render();

    expect(el.querySelector('fold-empty-state')?.getAttribute('tone')).toBe('alert');
    expect(el.querySelector('.co-body')).toBeNull();
  });

  /* ── LOT PC2 : RANGÉ PAR TOURNÉE ─────────────────────────────────────────
     L'ordre et « n prêtes sur m » viennent de la livraison ; l'écran range. */

  describe('rangé par tournée (lot PC2)', () => {
    function round(over: Partial<DeliveryPackingRoundView> = {}): DeliveryPackingRoundView {
      return {
        roundId: 'r-1',
        vehicleName: 'Kangoo',
        passage: 1,
        departedAt: null,
        stopCount: 2,
        readyStops: 1,
        stops: [
          {
            orderId: 'o-CMD-002',
            reference: 'CMD-002',
            position: 2,
            ready: false,
            binToRedo: true,
          },
          {
            orderId: 'o-CMD-001',
            reference: 'CMD-001',
            position: 1,
            ready: true,
            binToRedo: false,
          },
        ],
        ...over,
      };
    }

    it('ouvre le DERNIER arrêt de la tournée d’abord, et met le retrait après', async () => {
      api.packingView = view({
        sheets: [
          retrait({ reference: 'CMD-000', orderId: 'o-CMD-000', customerLabel: 'Comptoir' }),
          bac(),
          bac({ reference: 'CMD-002', orderId: 'o-CMD-002', customerLabel: 'Le Refuge' }),
        ],
      });
      rounds = [round()];

      const { el } = await render();

      expect([...el.querySelectorAll('.co-bac-who')].map((who) => said(who))).toEqual([
        'Le Refuge',
        'Hôtel du Parc',
        'Comptoir',
      ]);
      expect(said(el.querySelector('.co-title'))).toBe('Le Refuge');
      expect(
        [...el.querySelectorAll('[data-round-head]')].map((head) => [
          said(head.querySelector('.co-round-title')),
          said(head.querySelector('.co-round-ready')),
        ]),
      ).toEqual([
        ['Kangoo', '1 commande prête sur 2'],
        ['Hors tournée', ''],
      ]);
    });

    it('dit « À refaire » (livraison) et « Retenue au contrôle » (fournil) sur la commande', async () => {
      api.packingView = view({
        sheets: [
          bac({ qualityHeld: true }),
          bac({ reference: 'CMD-002', orderId: 'o-CMD-002', customerLabel: 'Le Refuge' }),
        ],
      });
      rounds = [round()];

      const { el } = await render();
      const [refuge, parc] = [...el.querySelectorAll('.co-bac')];

      expect(refuge?.querySelector('[data-flag-redo]')).not.toBeNull();
      expect(refuge?.querySelector('[data-flag-held]')).toBeNull();
      expect(parc?.querySelector('[data-flag-held]')).not.toBeNull();
      expect(said(parc?.querySelector('.co-bac-where'))).toContain('arrêt 1');
    });

    it('sans les tournées, garde l’ordre servi et le DIT', async () => {
      rounds = null;

      const { el } = await render();

      expect(el.querySelector('[data-rounds-failed]')).not.toBeNull();
      expect(el.querySelectorAll('.co-bac')).toHaveLength(1);
      expect(el.querySelector('[data-round-head]')).toBeNull();
    });
  });

  /* ── LES CONTAINERS ──────────────────────────────────────────────────────
     K3b : le compte « + / − » du fournil n'est plus servi — le compte d'une
     commande `counted` se lit, il ne se règle plus. */

  it('🔴 n’offre plus « + » ni « − » sur une commande au compte', async () => {
    api.packingView = view({ sheets: [retrait({ containers: 2 })] });
    const { el } = await render();

    expect(el.querySelectorAll('.co-container')).toHaveLength(2);
    expect(el.querySelector('.co-container-step')).toBeNull();
  });

  it('ne numérote pas les tuiles : le seul nombre est celui du serveur', async () => {
    api.packingView = view({ sheets: [retrait({ containers: 3 })] });

    const { el } = await render();
    const tiles = el.querySelectorAll('.co-container');

    expect(tiles).toHaveLength(3);
    for (const tile of Array.from(tiles)) {
      expect(said(tile)).toBe('');
    }
  });

  it('🔴 ne laisse plus toucher au compte d’une commande DÉCLARÉE PRÊTE', async () => {
    api.packingView = view({
      sheets: [readyBac({ containers: 2, fulfillmentMethod: 'pickup' })],
      todoCount: 0,
      readyCount: 1,
    });

    const { fixture, el } = await render();
    openStack(fixture, 'ready');

    expect(el.querySelectorAll('.co-container')).toHaveLength(2);
    expect(el.querySelector('.co-container-step')).toBeNull();
  });

  /* ── L'ATTENTE DE PRODUCTION ───────────────────────────────────────────── */

  /**
   * 🔴 Le trou que ce poste avait : on cochait ce qui n'était pas fabriqué, et
   * la balance comptait comme réparti ce qui n'était jamais sorti du four — le
   * reste devenait faux dans le seul sens qui coûte, optimiste.
   */
  it('🔴 dit qu’une ligne attend la prod, et ne la laisse pas cocher', async () => {
    api.packingView = view({
      sheets: [
        bac({
          lines: [
            line({ awaitingProduction: true }),
            line({ sku: 'BAG', productName: 'Baguette', quantity: 8 }),
          ],
        }),
      ],
    });

    const { el } = await render();
    const boxes = el.querySelectorAll<HTMLInputElement>('.co-line input');

    expect(boxes).toHaveLength(2);
    // K3b : plus aucune coche — les lignes se rangent dans les contenants.
    expect(boxes[0]?.disabled).toBe(true);
    expect(boxes[1]?.disabled).toBe(true);
    expect(said(el.querySelector('.co-line.is-awaiting .co-awaiting'))).toContain(
      'En attente de la prod',
    );
  });

  /**
   * 🔴 Attente et manque sont DEUX choses, et un article peut être les deux :
   * pas encore sorti, et déjà survendu. Les fondre ferait disparaître le manque
   * derrière l'attente le matin — c'est-à-dire exactement quand il compte.
   */
  it('🔴 met l’article en attente en warning, sans effacer son manque', async () => {
    api.packingView = view({
      resources: [resource({ produced: 40, remaining: -10, awaitingProduction: true })],
    });

    const { el } = await render();
    const rows = el.querySelectorAll('.co-res');

    expect(rows).toHaveLength(1);
    expect(rows[0]?.classList.contains('is-awaiting')).toBe(true);
    expect(rows[0]?.classList.contains('is-short')).toBe(true);
    // L'article reste dans la marchandise à répartir : ce qui est dû existe
    // avant d'être fabriqué.
    expect(said(rows[0])).toContain('En attente de la prod');
    expect(said(rows[0])).toContain('-10');
  });

  /* ── LA RECHERCHE ─────────────────────────────────────────────────────────
     🔴 Elle SURLIGNE, elle ne filtre pas — et elle ne fait plus aucun total. */

  /** Le poste, avec deux commandes dont une seule veut des croissants. */
  function searchable(): ProductionPackingView {
    return view({
      sheets: [
        bac({ reference: 'CMD-001', customerLabel: 'Hôtel du Parc', lines: [line()] }),
        bac({
          reference: 'CMD-002',
          customerLabel: 'Café Neuf',
          lines: [line({ sku: 'BAG', productName: 'Baguette', quantity: 8 })],
        }),
      ],
      resources: [
        resource({ sku: 'CRO', productName: 'Croissant' }),
        resource({ sku: 'BAG', productName: 'Baguette', produced: 20, remaining: 20 }),
      ],
      orderCount: 2,
      todoCount: 2,
    });
  }

  it('🔴 surligne les TROIS colonnes à la fois, et ne retire RIEN', async () => {
    api.packingView = searchable();
    const { fixture, el } = await render();

    // Le compte AVANT la saisie — c'est à lui qu'on compare après.
    expect(el.querySelectorAll('.co-bac')).toHaveLength(2);
    expect(el.querySelectorAll('.co-res')).toHaveLength(2);
    expect(el.querySelectorAll('.co-line')).toHaveLength(1);

    type(fixture, 'croissant');

    // 🔴 RIEN n'a disparu : le reste à répartir porte sur la journée entière.
    expect(el.querySelectorAll('.co-bac')).toHaveLength(2);
    expect(el.querySelectorAll('.co-res')).toHaveLength(2);
    expect(el.querySelectorAll('.co-line')).toHaveLength(1);

    expect(el.querySelectorAll('.co-bac.is-hit')).toHaveLength(1);
    expect(said(el.querySelector('.co-bac.is-hit'))).toContain('Hôtel du Parc');
    expect(el.querySelectorAll('.co-line.is-hit')).toHaveLength(1);
    expect(el.querySelectorAll('.co-res.is-hit')).toHaveLength(1);
    expect(said(el.querySelector('.co-res.is-hit'))).toContain('Croissant');
  });

  it('ne surligne PAS une commande qui ne contient pas l’article', async () => {
    api.packingView = searchable();
    const { fixture, el } = await render();

    type(fixture, 'croissant');
    const orders = el.querySelectorAll('.co-bac');

    expect(orders).toHaveLength(2);
    expect(said(orders[1])).toContain('Café Neuf');
    expect(orders[1]?.classList.contains('is-hit')).toBe(false);
  });

  /**
   * 🔴 Les quantités des lignes trouvées, une par une, JAMAIS additionnées.
   * Avant le 2026-09-14 l'écran affichait « 20 demandés » — une somme faite à
   * la frappe.
   */
  it('🔴 montre les quantités des lignes trouvées, sans les additionner', async () => {
    api.packingView = view({
      sheets: [
        bac({
          lines: [
            line({ sku: 'PAC', productName: 'Pain au chocolat', quantity: 12 }),
            line({ sku: 'PDM', productName: 'Pain de mie', quantity: 8 }),
          ],
        }),
      ],
      resources: [
        resource({ sku: 'PAC', productName: 'Pain au chocolat' }),
        resource({ sku: 'PDM', productName: 'Pain de mie' }),
      ],
    });
    const { fixture, el } = await render();

    type(fixture, 'pain');
    const chips = el.querySelectorAll('.co-hit-chip');

    expect(chips).toHaveLength(2);
    const shown = Array.from(chips).map((chip) => said(chip));
    expect(shown).toEqual(['12 Pain au chocolat', '8 Pain de mie']);
    expect(shown.join(' | ')).not.toContain('20');
  });

  it('cherche aussi par SKU, pas seulement par nom', async () => {
    api.packingView = searchable();
    const { fixture, el } = await render();

    type(fixture, 'bag');

    expect(el.querySelectorAll('.co-bac.is-hit')).toHaveLength(1);
    expect(said(el.querySelector('.co-bac.is-hit'))).toContain('Café Neuf');
  });

  it('ignore la casse et les accents', async () => {
    api.packingView = view({
      sheets: [bac({ lines: [line({ sku: 'PAC', productName: 'Pâte à choux', quantity: 4 })] })],
      resources: [resource({ sku: 'PAC', productName: 'Pâte à choux' })],
    });
    const { fixture, el } = await render();

    type(fixture, 'PATE A CHOUX');

    expect(el.querySelectorAll('.co-res.is-hit')).toHaveLength(1);
  });

  it('DIT sobrement quand rien ne correspond, plutôt que de ne rien changer', async () => {
    api.packingView = searchable();
    const { fixture, el } = await render();

    type(fixture, 'kouign');

    expect(el.textContent).toContain('Aucun produit de cette journée ne correspond');
    expect(el.querySelectorAll('.co-bac')).toHaveLength(2);
    expect(el.querySelector('.co-bac.is-hit')).toBeNull();
  });

  it('Échap vide la recherche, et tout redevient de plein poids', async () => {
    api.packingView = searchable();
    const { fixture, el } = await render();

    type(fixture, 'croissant');
    expect(el.querySelector('.co-plates')?.classList.contains('is-searching')).toBe(true);

    el.querySelector('.co-search')?.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
    );
    fixture.detectChanges();

    expect(el.querySelector('.co-plates')?.classList.contains('is-searching')).toBe(false);
    expect(el.querySelector('.co-bac.is-hit')).toBeNull();
  });

  /* ── LES DEUX PILES ───────────────────────────────────────────────────────
     Le sélecteur FILTRE, la recherche SURLIGNE — et les deux cohabitent. */

  /** Deux en cours, une déjà déclarée prête. */
  function twoStacks(): ProductionPackingView {
    return view({
      sheets: [
        bac({ reference: 'CMD-001', customerLabel: 'Hôtel du Parc' }),
        bac({ reference: 'CMD-002', customerLabel: 'Café Neuf' }),
        readyBac({ reference: 'CMD-003', customerLabel: 'Boulangerie Est' }),
      ],
      orderCount: 3,
      todoCount: 2,
      readyCount: 1,
    });
  }

  it('ouvre sur « En cours », et range les prêtes à part', async () => {
    api.packingView = twoStacks();
    const { el } = await render();

    // Le compte AVANT toute boucle : la pile par défaut est ce qui reste à faire.
    expect(el.querySelectorAll('.co-bac')).toHaveLength(2);
    expect(said(el.querySelector('.co-stack'))).toContain('En cours 2');
    expect(said(el.querySelector('.co-stack'))).toContain('Prêtes 1');
    expect(said(el.querySelector('.co-bacs'))).not.toContain('Boulangerie Est');
  });

  it('montre la pile des prêtes quand on la demande', async () => {
    api.packingView = twoStacks();
    const { fixture, el } = await render();

    openStack(fixture, 'ready');

    expect(el.querySelectorAll('.co-bac')).toHaveLength(1);
    expect(said(el.querySelector('.co-bac'))).toContain('Boulangerie Est');
  });

  /**
   * 🔴 La marchandise à répartir porte sur la JOURNÉE ENTIÈRE, prêtes comprises :
   * ce qui est parti dans un bac reste réparti.
   */
  it('🔴 ne touche PAS à la marchandise quand on change de pile', async () => {
    api.packingView = twoStacks();
    const { fixture, el } = await render();
    const before = said(el.querySelector('.co-resource-list'));

    openStack(fixture, 'ready');

    expect(el.querySelectorAll('.co-res')).toHaveLength(2);
    expect(said(el.querySelector('.co-resource-list'))).toBe(before);
  });

  /**
   * 🔴 Le moment le plus fréquent de la journée : la commande quitte la pile
   * sous les doigts. L'écran doit enchaîner, pas se vider.
   */
  it('🔴 enchaîne sur la commande suivante après une déclaration, et le DIT', async () => {
    api.packingView = view({
      sheets: [
        bac({ reference: 'CMD-001', customerLabel: 'Hôtel du Parc', canDeclareReady: true }),
        bac({ reference: 'CMD-002', customerLabel: 'Café Neuf' }),
      ],
      orderCount: 2,
      todoCount: 2,
    });
    const { fixture, el } = await render();
    expect(said(el.querySelector('.co-title'))).toBe('Hôtel du Parc');

    // Ce que le serveur rendra après la déclaration.
    api.packingView = view({
      sheets: [
        readyBac({ reference: 'CMD-001', customerLabel: 'Hôtel du Parc' }),
        bac({ reference: 'CMD-002', customerLabel: 'Café Neuf' }),
      ],
      orderCount: 2,
      todoCount: 1,
      readyCount: 1,
    });
    el.querySelector<HTMLButtonElement>('.co-close button')?.click();
    await settle(fixture);

    expect(api.closed).toEqual(['o-CMD-001']);
    expect(said(el.querySelector('.co-title'))).toBe('Café Neuf');
    expect(el.textContent).toContain('Hôtel du Parc est déclarée prête');
    // Et les compteurs sont ceux que le serveur a relus.
    expect(said(el.querySelector('.co-stack'))).toContain('En cours 1');
  });

  /**
   * 🔴 Le sélecteur filtre ; sans cet avis, il rendrait faux ce que la recherche
   * promet — un article présent seulement dans des commandes déjà prêtes
   * n'apparaîtrait nulle part. L'avis ne porte AUCUN nombre : « combien » serait
   * un compte fait par l'écran.
   */
  it('🔴 dit que l’autre pile contient l’article, sans compter', async () => {
    api.packingView = view({
      sheets: [
        bac({
          reference: 'CMD-001',
          customerLabel: 'Hôtel du Parc',
          lines: [line({ sku: 'BAG', productName: 'Baguette', quantity: 8 })],
        }),
        readyBac({ reference: 'CMD-003', customerLabel: 'Boulangerie Est' }),
      ],
      orderCount: 2,
      todoCount: 1,
      readyCount: 1,
    });
    const { fixture, el } = await render();

    type(fixture, 'croissant');
    const notice = said(el.querySelector('.co-found-elsewhere'));

    expect(el.querySelector('.co-bac.is-hit')).toBeNull();
    expect(notice).toContain('trouvé dans les prêtes');
    expect(notice).not.toMatch(/\d/u);
    // Et surtout PAS le message « rien ne correspond », qui serait faux.
    expect(el.textContent).not.toContain('Aucun produit de cette journée ne correspond');
  });

  /** « Tout est prêt » et « rien n'est encore prêt » ne se ressemblent pas. */
  it('distingue les deux piles vides', async () => {
    // Rien n'est encore prêt : la pile des prêtes est vide.
    api.packingView = view();
    const debut = await render();
    openStack(debut.fixture, 'ready');

    expect(debut.el.textContent).toContain('Rien n’est encore prêt');
    expect(debut.el.textContent).not.toContain('Tout est déclaré prêt');
    // Le sélecteur reste là : une pile vide ne doit pas fermer la porte par
    // laquelle on en sort.
    expect(debut.el.querySelector('.co-stack')).not.toBeNull();

    // Tout est prêt : c'est la pile « en cours » qui est vide.
    api.packingView = view({ sheets: [readyBac()], todoCount: 0, readyCount: 1 });
    const fin = await render();

    expect(fin.el.textContent).toContain('Tout est déclaré prêt');
    expect(fin.el.textContent).not.toContain('Rien n’est encore prêt');
  });
});
