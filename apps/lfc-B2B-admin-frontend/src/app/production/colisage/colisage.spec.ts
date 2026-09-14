import { signal } from '@angular/core';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import type {
  PackingLine,
  PackingResource,
  PackingSheet,
  ProductionPackingAck,
  ProductionPackingView,
} from '@lfd/contracts';
import { beforeEach, describe, expect, it } from 'vitest';

import { PermissionsStore } from '../../auth/permissions.store';
import { PackingQueue, type QueuedPackingMark } from '../packing-queue';
import type { Rejected } from '../queue-refusal';
import { PackingService } from '../packing.service';
import { Colisage } from './colisage';

/**
 * Ce que ces cas tiennent, et que ni `tsc` ni le build AOT ne peuvent dire :
 *
 * - 🔴 **une journée non arrêtée le DIT** — une liste vide ressemblerait à
 *   « tout est fait », qui est exactement le contraire ;
 * - 🔴 **un reste NÉGATIF se voit** — c'est le cas métier que ce poste existe
 *   pour attraper, et le borner à zéro l'effacerait ;
 * - 🔴 **une coche s'écrit à l'écran AVANT de partir**, et **un bac fermé n'est
 *   plus cochable** : le premier geste est réversible, le second ne l'est pas ;
 * - **le QR d'une feuille imprimée ouvre le bon bac**, et une référence
 *   inconnue se dit en toutes lettres plutôt que de laisser un écran muet.
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

function bac(over: Partial<PackingSheet> = {}): PackingSheet {
  return {
    reference: 'CMD-001',
    containers: 0,
    customerLabel: 'Hôtel du Parc',
    fulfillmentMethod: 'delivery',
    destination: '12 rue des Lilas',
    lines: [line(), line({ sku: 'BAG', productName: 'Baguette', quantity: 8 })],
    packedAt: null,
    packedBy: null,
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
    ...over,
  };
}

class FakePackingService {
  packingView: ProductionPackingView | null = view();
  /** Les journées demandées, dans l'ordre — la règle de choix se lit là-dessus. */
  readonly asked: string[] = [];
  /** Une réponse par journée ; à défaut, `packingView` pour toutes. */
  readonly byDay = new Map<string, ProductionPackingView>();
  readonly closed: string[] = [];
  closeRefuses = false;
  /** Les comptes de containers envoyés, dans l'ordre. */
  readonly containerCalls: { reference: string; containers: number }[] = [];
  containersRefuse = false;

  async packing(date: string): Promise<ProductionPackingView> {
    this.asked.push(date);
    const served = this.byDay.get(date) ?? this.packingView;
    if (served === null) {
      throw new Error('lecture refusée');
    }
    return served;
  }

  async setContainers(_date: string, reference: string, containers: number): Promise<void> {
    if (this.containersRefuse) {
      throw new Error('containers refusés');
    }
    this.containerCalls.push({ reference, containers });
  }

  async packOrder(date: string, reference: string): Promise<ProductionPackingAck> {
    if (this.closeRefuses) {
      throw new Error('déclaration refusée');
    }
    this.closed.push(reference);
    return { reference, packedAt: `${date}T05:00:00`, packedBy: 'staff', alreadyPacked: false };
  }
}

class FakeQueue {
  readonly marks: QueuedPackingMark[] = [];
  readonly pending = (): number => this.marks.length;
  readonly offline = (): boolean => false;
  /** Les refus définitifs, posés à la main par un test — la vraie file les produit au vidage. */
  readonly refused = signal<readonly Rejected<QueuedPackingMark>[]>([]);
  readonly rejected = this.refused.asReadonly();
  acknowledged = 0;

  mark(mark: QueuedPackingMark): void {
    this.marks.push(mark);
  }

  acknowledge(): void {
    this.acknowledged += 1;
    this.refused.set([]);
  }
}

const ME = { firstName: 'Marie', lastName: 'Jost' };

let api: FakePackingService;
let queue: FakeQueue;

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

describe('le poste de colisage', () => {
  beforeEach(() => {
    api = new FakePackingService();
    queue = new FakeQueue();
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: PackingService, useValue: api },
        { provide: PackingQueue, useValue: queue },
        { provide: PermissionsStore, useValue: { identity: () => ME } },
      ],
    });
  });

  /**
   * 🔴 Une liste vide ressemblerait à « tout est fait ». Tant que le plan du
   * soir n'est pas arrêté, la journée n'a pas de bacs — et on le DIT, avec
   * l'endroit où le geste se fait.
   */
  it('🔴 dit que le plan n’est pas arrêté, et renvoie au prévisionnel', async () => {
    api.packingView = view({ closedAt: null, sheets: [], resources: [] });

    const { el } = await render();

    expect(el.querySelector('.co-body')).toBeNull();
    const empty = el.querySelector('fold-empty-state');
    expect(empty).not.toBeNull();
    expect(el.textContent).toContain('pas arrêté');
    expect(el.querySelector('a[foldButton]')?.getAttribute('href')).toBe(
      '/production/previsionnel',
    );
  });

  it('montre DEMAIN dès que le plan de demain est arrêté', async () => {
    api.byDay.set(tomorrow(), view({ date: tomorrow(), closedAt: `${tomorrow()}T20:05:00` }));

    const { el } = await render();

    // Une seule lecture : la journée qui porte un plan arrêté est celle qu'on colise.
    expect(api.asked).toEqual([tomorrow()]);
    expect(el.textContent).toContain('demain');
  });

  it('retombe sur AUJOURD’HUI tant que le plan de demain n’est pas arrêté', async () => {
    api.byDay.set(tomorrow(), view({ date: tomorrow(), closedAt: null, sheets: [] }));
    api.byDay.set(today(), view());

    const { el } = await render();

    expect(api.asked).toEqual([tomorrow(), today()]);
    expect(el.textContent).toContain('aujourd’hui');
  });

  it('montre les commandes, leur volume en produits, leur mode et leur destination', async () => {
    api.packingView = view({
      sheets: [
        bac(),
        bac({
          reference: 'CMD-002',
          customerLabel: 'Café Neuf',
          fulfillmentMethod: 'pickup',
          destination: 'Comptoir Bastille',
          lines: [line({ packed: true, initials: 'PL' })],
        }),
      ],
    });

    const { el } = await render();

    // Le compte AVANT la boucle : une liste qui rend un élément de moins que
    // prévu passerait sinon inaperçue.
    expect(el.querySelectorAll('.co-bac')).toHaveLength(2);
    expect(el.textContent).toContain('Livraison · 12 rue des Lilas');
    expect(el.textContent).toContain('Retrait · Comptoir Bastille');
    // 🔴 Le volume est en PRODUITS, pas en lignes : une commande de trois lignes
    // peut porter quarante croissants, et c'est ce nombre-là qui se compare à la
    // marchandise à répartir. Un compte de lignes ne se compare à rien.
    expect(el.querySelectorAll('.co-bac')[1]?.textContent).toContain('12 / 12 produits');
  });

  it('🔴 écrit la coche à l’écran AVANT de la confier à la file', async () => {
    const { fixture, el } = await render();

    el.querySelector<HTMLInputElement>('.co-line input[type="checkbox"]')?.click();
    fixture.detectChanges();

    // Le serveur n'a rien confirmé, et la ligne est déjà dans le bac : c'est
    // tout l'objet du sous-sol.
    expect(el.querySelector('.co-line')?.classList.contains('is-packed')).toBe(true);
    expect(queue.marks).toEqual([
      { date: today(), reference: 'CMD-001', sku: 'CRO', packed: true, initials: 'MJ' },
    ]);
  });

  /**
   * Régression : une coche de colisage refusée pour de bon restait affichée, et
   * la balance comptait comme réparti ce que le serveur n'avait jamais accepté
   * (même défaut que la fiche d'atelier, corrigé le 2026-09-14).
   */
  it('🔴 sort du bac une ligne refusée pour de bon, et DIT pourquoi', async () => {
    const { fixture, el } = await render();
    el.querySelector<HTMLInputElement>('.co-line input[type="checkbox"]')?.click();
    fixture.detectChanges();
    expect(el.querySelector('.co-line')?.classList.contains('is-packed')).toBe(true);

    const [mark] = queue.marks;
    if (mark === undefined) {
      throw new Error('la coche n’est pas partie dans la file');
    }
    queue.refused.set([{ mark, message: 'Cette commande a déjà été déclarée prête.' }]);
    fixture.detectChanges();

    expect(el.querySelector('.co-line')?.classList.contains('is-packed')).toBe(false);
    expect(el.querySelector('.co-refusals')?.textContent).toContain(
      'Cette commande a déjà été déclarée prête.',
    );

    el.querySelector<HTMLButtonElement>('.co-refusals button')?.click();
    fixture.detectChanges();

    expect(queue.acknowledged).toBe(1);
    expect(el.querySelector('.co-refusals')).toBeNull();
    expect(el.querySelector('.co-line')?.classList.contains('is-packed')).toBe(false);
  });

  /**
   * 🔴 L'écran est plus exigeant que la route de scan, et c'est assumé : ici
   * rien ne presse, et un bac fermé à moitié est un colis annoncé prêt qui ne
   * l'est pas.
   */
  it('🔴 laisse « déclarer prête » INACTIF tant qu’une ligne est dehors', async () => {
    const { fixture, el } = await render();
    const button = (): HTMLButtonElement | null => el.querySelector('.co-close button');

    expect(button()?.disabled).toBe(true);

    for (const box of Array.from(el.querySelectorAll<HTMLInputElement>('.co-line input'))) {
      box.click();
    }
    fixture.detectChanges();

    expect(button()?.disabled).toBe(false);
  });

  it('déclare la commande prête, et ce geste ne passe PAS par la file', async () => {
    api.packingView = view({ sheets: [bac({ lines: [line({ packed: true, initials: 'PL' })] })] });

    const { fixture, el } = await render();
    el.querySelector<HTMLButtonElement>('.co-close button')?.click();
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    fixture.detectChanges();

    expect(api.closed).toEqual(['CMD-001']);
    expect(queue.marks).toHaveLength(0);
  });

  /** Un fait irréversible échoue VISIBLEMENT plutôt que d'attendre en silence. */
  it('garde l’échec de déclaration à l’écran, et le redit', async () => {
    api.packingView = view({ sheets: [bac({ lines: [line({ packed: true, initials: 'PL' })] })] });
    api.closeRefuses = true;

    const { fixture, el } = await render();
    el.querySelector<HTMLButtonElement>('.co-close button')?.click();
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    fixture.detectChanges();

    const callout = el.querySelector('fold-callout');
    expect(callout?.getAttribute('variant')).toBe('alert');
    expect(el.querySelector('.co-line')).not.toBeNull();
  });

  it('🔴 ne laisse plus rien cocher sur une commande DÉCLARÉE PRÊTE', async () => {
    api.packingView = view({
      sheets: [
        bac({
          packedAt: `${today()}T05:12:00`,
          packedBy: 'Paul',
          lines: [line({ packed: true, initials: 'PL' })],
        }),
      ],
    });

    const { fixture, el } = await render();
    // Une commande prête a quitté la pile « en cours » : on va la chercher dans
    // la sienne, exactement comme on le ferait pour vérifier un colis.
    openStack(fixture, 'ready');

    expect(el.querySelector<HTMLInputElement>('.co-line input')?.disabled).toBe(true);
    expect(el.querySelector('.co-close button')).toBeNull();
    expect(el.textContent).toContain('Commande déclarée prête');
  });

  /**
   * 🔴 Les bacs demandent plus que le four n'a sorti. C'est le cas que ce poste
   * existe pour attraper : il se voit, il ne se borne pas à zéro.
   */
  it('🔴 montre un reste NÉGATIF, sans le masquer', async () => {
    api.packingView = view({
      sheets: [bac({ lines: [line({ quantity: 50, packed: true, initials: 'PL' })] })],
      resources: [resource({ produced: 40 })],
    });

    const { el } = await render();
    const short = el.querySelector('.co-res.is-short');

    expect(short).not.toBeNull();
    expect(short?.textContent).toContain('-10');
  });

  /** La balance se rééquilibre sous les doigts, sans attendre une relecture. */
  it('recompte la ressource à la coche, pas à la relecture', async () => {
    api.packingView = view({
      sheets: [bac({ lines: [line({ quantity: 12 })] })],
      resources: [resource({ produced: 40 })],
    });

    const { fixture, el } = await render();
    expect(el.querySelector('.co-res')?.textContent).toContain('40');

    el.querySelector<HTMLInputElement>('.co-line input')?.click();
    fixture.detectChanges();

    expect(el.querySelector('.co-res')?.textContent).toContain('28');
  });

  /** Le QR d'une feuille imprimée : `/colisage/:reference` ouvre CE bac. */
  it('ouvre le bac que la référence de l’URL désigne', async () => {
    api.packingView = view({
      sheets: [bac(), bac({ reference: 'CMD-002', customerLabel: 'Café Neuf' })],
    });

    const { el } = await render('CMD-002');

    expect(el.querySelector('.co-title')?.textContent?.trim()).toBe('Café Neuf');
    expect(el.querySelector('.co-bac.is-open')?.textContent).toContain('Café Neuf');
  });

  it('🔴 DIT la référence inconnue en toutes lettres, plutôt qu’un écran vide', async () => {
    const { el } = await render('CMD-999');

    expect(el.querySelector('fold-callout')?.textContent).toContain('CMD-999');
    // Les bacs de la journée restent à l'écran : un QR d'hier ne doit pas faire
    // croire que le poste est vide.
    expect(el.querySelectorAll('.co-bac')).toHaveLength(1);
  });

  it('passe par fold pour l’erreur de lecture, avec de quoi réessayer', async () => {
    api.packingView = null;

    const { el } = await render();
    const empty = el.querySelector('fold-empty-state');

    expect(empty?.getAttribute('tone')).toBe('alert');
    expect(el.querySelector('.co-body')).toBeNull();
  });

  /* ── LES CONTAINERS ────────────────────────────────────────────────────── */

  /**
   * 🔴 Une BOUCLE, pas un chiffre : les produits y seront glissés-déposés, et le
   * nombre deviendra la longueur d'une liste de containers nommés. Le compte
   * d'aujourd'hui doit donc se lire sur des entrées, pas sur un texte.
   */
  it('ajoute un container, et le compte se lit sur des entrées', async () => {
    const { fixture, el } = await render();

    expect(el.querySelectorAll('.co-container')).toHaveLength(0);

    el.querySelector<HTMLButtonElement>('.co-container-step--add')?.click();
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    fixture.detectChanges();

    expect(el.querySelectorAll('.co-container')).toHaveLength(1);
    expect(api.containerCalls).toEqual([{ reference: 'CMD-001', containers: 1 }]);
  });

  it('redescend, et le « − » disparaît à zéro plutôt que de rester inerte', async () => {
    api.packingView = view({ sheets: [bac({ containers: 1 })] });

    const { fixture, el } = await render();
    const minus = (): HTMLButtonElement | null =>
      el.querySelector('.co-container-step:not(.co-container-step--add)');

    expect(minus()).not.toBeNull();
    minus()?.click();
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    fixture.detectChanges();

    expect(api.containerCalls).toEqual([{ reference: 'CMD-001', containers: 0 }]);
    expect(el.querySelectorAll('.co-container')).toHaveLength(0);
    expect(minus()).toBeNull();
  });

  it('🔴 ne laisse plus toucher au compte d’une commande DÉCLARÉE PRÊTE', async () => {
    api.packingView = view({
      sheets: [
        bac({
          containers: 2,
          packedAt: `${today()}T05:12:00`,
          packedBy: 'Paul',
          lines: [line({ packed: true, initials: 'PL' })],
        }),
      ],
    });

    const { fixture, el } = await render();
    openStack(fixture, 'ready');

    expect(el.querySelectorAll('.co-container')).toHaveLength(2);
    expect(el.querySelector('.co-container-step')).toBeNull();
  });

  /**
   * Un compte de containers sert à charger un véhicule : le montrer enregistré
   * alors qu'il ne l'est pas ferait partir un camion sur une croyance.
   */
  it('🔴 repose le compte servi quand l’envoi est refusé, et le DIT', async () => {
    api.containersRefuse = true;

    const { fixture, el } = await render();
    el.querySelector<HTMLButtonElement>('.co-container-step--add')?.click();
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    fixture.detectChanges();

    expect(el.querySelectorAll('.co-container')).toHaveLength(0);
    expect(el.textContent).toContain('containers n’a pas pu être enregistré');
  });

  /* ── L'ATTENTE DE PRODUCTION ───────────────────────────────────────────── */

  /**
   * 🔴 Le trou que ce poste avait : on cochait ce qui n'était pas fabriqué, et
   * la balance comptait comme réparti ce qui n'était jamais sorti du four — le
   * reste devenait faux dans le seul sens qui coûte, optimiste.
   */
  it('🔴 ne laisse PAS cocher une ligne en attente de la prod, et le dit', async () => {
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
    expect(boxes[0]?.disabled).toBe(true);
    // L'autre ligne reste cochable : l'attente est PAR ARTICLE, pas par commande.
    expect(boxes[1]?.disabled).toBe(false);
    expect(el.querySelector('.co-line.is-awaiting .co-awaiting')?.textContent).toContain(
      'En attente de la prod',
    );
  });

  it('un clic forcé sur une ligne en attente n’envoie rien dans la file', async () => {
    api.packingView = view({ sheets: [bac({ lines: [line({ awaitingProduction: true })] })] });

    const { fixture, el } = await render();
    el.querySelector<HTMLInputElement>('.co-line input')?.click();
    fixture.detectChanges();

    expect(queue.marks).toHaveLength(0);
    expect(el.querySelector('.co-line')?.classList.contains('is-packed')).toBe(false);
  });

  /**
   * 🔴 Attente et manque sont DEUX choses, et un article peut être les deux :
   * pas encore sorti, et déjà survendu. Les fondre ferait disparaître le manque
   * derrière l'attente le matin — c'est-à-dire exactement quand il compte.
   */
  it('🔴 met l’article en attente en warning, sans effacer son manque', async () => {
    api.packingView = view({
      sheets: [bac({ lines: [line({ quantity: 50, packed: true, initials: 'PL' })] })],
      resources: [resource({ produced: 40, awaitingProduction: true })],
    });

    const { el } = await render();
    const rows = el.querySelectorAll('.co-res');

    expect(rows).toHaveLength(1);
    const row = rows[0];
    expect(row?.classList.contains('is-awaiting')).toBe(true);
    expect(row?.classList.contains('is-short')).toBe(true);
    // L'article reste dans la marchandise à répartir : ce qui est dû existe
    // avant d'être fabriqué.
    expect(row?.textContent).toContain('En attente de la prod');
    expect(row?.textContent).toContain('-10');
  });

  /* ── LA RECHERCHE ─────────────────────────────────────────────────────────
     🔴 Elle SURLIGNE, elle ne filtre pas. C'est la régression que ces cas
     existent pour interdire : filtrer casserait la balance, parce que le reste
     à répartir porte sur la journée entière et qu'une liste réduite ferait lire
     un reste qui ne correspond à rien de ce qui est affiché. */

  /** Le poste, avec deux commandes dont une seule veut des croissants. */
  function searchable(): ProductionPackingView {
    return view({
      sheets: [
        bac({
          reference: 'CMD-001',
          customerLabel: 'Hôtel du Parc',
          lines: [line({ quantity: 12 })],
        }),
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
    });
  }

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

    // Et les trois colonnes se sont surlignées ensemble.
    expect(el.querySelectorAll('.co-bac.is-hit')).toHaveLength(1);
    expect(el.querySelector('.co-bac.is-hit')?.textContent).toContain('Hôtel du Parc');
    expect(el.querySelectorAll('.co-line.is-hit')).toHaveLength(1);
    expect(el.querySelectorAll('.co-res.is-hit')).toHaveLength(1);
    expect(el.querySelector('.co-res.is-hit')?.textContent).toContain('Croissant');
  });

  it('ne surligne PAS une commande qui ne contient pas l’article', async () => {
    api.packingView = searchable();
    const { fixture, el } = await render();

    type(fixture, 'croissant');
    const orders = el.querySelectorAll('.co-bac');

    expect(orders[1]?.textContent).toContain('Café Neuf');
    expect(orders[1]?.classList.contains('is-hit')).toBe(false);
  });

  /**
   * Répartir une marchandise courte, c'est choisir entre des commandes — et on
   * ne choisit pas sans savoir combien chacune en demande.
   */
  it('dit COMBIEN chaque commande en attend', async () => {
    api.packingView = searchable();
    const { fixture, el } = await render();

    type(fixture, 'croissant');

    expect(el.querySelectorAll('.co-hit-chip')).toHaveLength(1);
    expect(el.querySelector('.co-hit-chip')?.textContent).toContain('12 demandés');
  });

  it('cherche aussi par SKU, pas seulement par nom', async () => {
    api.packingView = searchable();
    const { fixture, el } = await render();

    type(fixture, 'bag');

    expect(el.querySelectorAll('.co-bac.is-hit')).toHaveLength(1);
    expect(el.querySelector('.co-bac.is-hit')?.textContent).toContain('Café Neuf');
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

  it('une ligne surlignée reste cochable', async () => {
    api.packingView = searchable();
    const { fixture, el } = await render();

    type(fixture, 'croissant');
    const box = el.querySelector<HTMLInputElement>('.co-line.is-hit input');

    expect(box?.disabled).toBe(false);
    box?.click();
    fixture.detectChanges();
    expect(queue.marks).toHaveLength(1);
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
     Le sélecteur FILTRE, la recherche SURLIGNE — et les deux cohabitent. Ce que
     ces cas tiennent, c'est que le filtre ne fasse jamais croire qu'un article
     n'est demandé nulle part. */

  /** Deux en cours, une déjà déclarée prête. */
  function twoStacks(): ProductionPackingView {
    return view({
      sheets: [
        bac({ reference: 'CMD-001', customerLabel: 'Hôtel du Parc' }),
        bac({ reference: 'CMD-002', customerLabel: 'Café Neuf' }),
        bac({
          reference: 'CMD-003',
          customerLabel: 'Boulangerie Est',
          packedAt: `${today()}T05:12:00`,
          packedBy: 'Paul',
          lines: [line({ packed: true, initials: 'PL' })],
        }),
      ],
    });
  }

  it('ouvre sur « En cours », et range les prêtes à part', async () => {
    api.packingView = twoStacks();
    const { el } = await render();

    // Le compte AVANT toute boucle : la pile par défaut est ce qui reste à faire.
    expect(el.querySelectorAll('.co-bac')).toHaveLength(2);
    expect(el.textContent).toContain('En cours 2');
    expect(el.textContent).toContain('Prêtes 1');
    expect(el.querySelector('.co-bacs')?.textContent).not.toContain('Boulangerie Est');
  });

  it('montre la pile des prêtes quand on la demande', async () => {
    api.packingView = twoStacks();
    const { fixture, el } = await render();

    openStack(fixture, 'ready');

    expect(el.querySelectorAll('.co-bac')).toHaveLength(1);
    expect(el.querySelector('.co-bac')?.textContent).toContain('Boulangerie Est');
  });

  /**
   * 🔴 La marchandise à répartir porte sur la JOURNÉE ENTIÈRE, prêtes comprises :
   * ce qui est parti dans un bac reste réparti. Une colonne qui suivrait la pile
   * remonterait un reste qui ne correspond à rien de réel.
   */
  it('🔴 ne touche PAS à la marchandise quand on change de pile', async () => {
    api.packingView = twoStacks();
    const { fixture, el } = await render();
    const before = el.querySelector('.co-resource-list')?.textContent;

    openStack(fixture, 'ready');

    expect(el.querySelectorAll('.co-res')).toHaveLength(2);
    expect(el.querySelector('.co-resource-list')?.textContent).toBe(before);
  });

  /**
   * 🔴 Le moment le plus fréquent de la journée : la commande quitte la pile
   * sous les doigts. L'écran doit enchaîner, pas se vider.
   */
  it('🔴 enchaîne sur la commande suivante après une déclaration, et le DIT', async () => {
    api.packingView = view({
      sheets: [
        bac({
          reference: 'CMD-001',
          customerLabel: 'Hôtel du Parc',
          lines: [line({ packed: true, initials: 'PL' })],
        }),
        bac({ reference: 'CMD-002', customerLabel: 'Café Neuf' }),
      ],
    });
    const { fixture, el } = await render();
    expect(el.querySelector('.co-title')?.textContent?.trim()).toBe('Hôtel du Parc');

    // Le serveur rend la journée suivante : la première est passée en prête.
    api.packingView = view({
      sheets: [
        bac({
          reference: 'CMD-001',
          customerLabel: 'Hôtel du Parc',
          lines: [line({ packed: true, initials: 'PL' })],
          packedAt: `${today()}T05:20:00`,
          packedBy: 'Marie',
        }),
        bac({ reference: 'CMD-002', customerLabel: 'Café Neuf' }),
      ],
    });
    el.querySelector<HTMLButtonElement>('.co-close button')?.click();
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    fixture.detectChanges();

    expect(api.closed).toEqual(['CMD-001']);
    // Pas de vide : la suivante est ouverte, et on dit ce qui vient d'arriver.
    expect(el.querySelector('.co-title')?.textContent?.trim()).toBe('Café Neuf');
    expect(el.textContent).toContain('Hôtel du Parc est déclarée prête');
  });

  /**
   * 🔴 Le sélecteur filtre ; sans ce compte, il rendrait faux ce que la
   * recherche promet — un article présent dans trois commandes déjà prêtes
   * n'apparaîtrait nulle part, et on conclurait que personne ne le demande.
   */
  it('🔴 DIT combien l’autre pile en contient quand la pile affichée n’a rien', async () => {
    api.packingView = view({
      sheets: [
        bac({
          reference: 'CMD-001',
          customerLabel: 'Hôtel du Parc',
          lines: [line({ sku: 'BAG', productName: 'Baguette', quantity: 8 })],
        }),
        bac({
          reference: 'CMD-003',
          customerLabel: 'Boulangerie Est',
          lines: [line({ packed: true, initials: 'PL' })],
          packedAt: `${today()}T05:12:00`,
          packedBy: 'Paul',
        }),
      ],
    });
    const { fixture, el } = await render();

    type(fixture, 'croissant');

    expect(el.querySelector('.co-bac.is-hit')).toBeNull();
    expect(el.textContent).toContain('1 commande dans les prêtes');
    // Et surtout PAS le message « rien ne correspond », qui serait faux.
    expect(el.textContent).not.toContain('Aucun produit de cette journée ne correspond');
  });

  /** « Tout est prêt » et « rien n'est encore prêt » ne se ressemblent pas. */
  it('distingue les deux piles vides', async () => {
    // Rien n'est encore prêt : la pile des prêtes est vide, et le début de
    // journée ne se dit pas comme sa fin.
    api.packingView = view({
      sheets: [bac({ reference: 'CMD-001', customerLabel: 'Hôtel du Parc' })],
    });
    const debut = await render();
    openStack(debut.fixture, 'ready');

    expect(debut.el.textContent).toContain('Rien n’est encore prêt');
    expect(debut.el.textContent).not.toContain('Tout est déclaré prêt');
    // Le sélecteur reste là : une pile vide ne doit pas fermer la porte par
    // laquelle on en sort.
    expect(debut.el.querySelector('.co-stack')).not.toBeNull();

    // Tout est prêt : c'est la pile « en cours » qui est vide, et ça se dit
    // autrement.
    api.packingView = view({
      sheets: [
        bac({
          reference: 'CMD-001',
          customerLabel: 'Hôtel du Parc',
          lines: [line({ packed: true, initials: 'PL' })],
          packedAt: `${today()}T05:12:00`,
          packedBy: 'Paul',
        }),
      ],
    });
    const fin = await render();

    expect(fin.el.textContent).toContain('Tout est déclaré prêt');
    expect(fin.el.textContent).not.toContain('Rien n’est encore prêt');
  });

  it('dit en pied que tout est parti quand la file est vide', async () => {
    const { el } = await render();

    expect(el.querySelector('.co-foot-origin')?.textContent).toContain('Toutes les coches');
  });
});
