import { computed, inject, Injectable, signal } from '@angular/core';
import {
  REVIEW_BATCH_MAX,
  type CatalogScreenItemView,
  type CatalogScreenRowsView,
  type MadeToOrderMarkView,
  type PublishedCatalogView,
  type PublishedEntryView,
} from '@lfd/contracts';
import { pendingReviewOf, publishedShelvesOf } from '@lfd/contracts/published-catalog-counts';

import { CatalogueService } from './catalogue.service';
import { MadeToOrderService } from './made-to-order.service';

export type CatalogueScreenState = 'idle' | 'loading' | 'ready' | 'error';

/** La copie de l'écran et le numéro `catalog-admin` qu'elle porte. */
interface ScreenCopy {
  readonly version: number;
  readonly published: PublishedCatalogView;
  readonly items: readonly CatalogScreenItemView[];
}

const EMPTY_VIEW: PublishedCatalogView = { shelves: [], entries: [], pendingReview: [] };

/**
 * **La copie de l'écran Catalogue**, gardée tant que l'onglet du navigateur
 * vit (`documentation/caching-usage/plan-catalogue-du-back-office.md`, § 3.4).
 *
 * - Chargée à la **première** ouverture de l'écran, rien avant ; une
 *   réouverture montre la copie sans relire.
 * - Elle **retient le numéro** rendu avec la copie : le veilleur compare le
 *   numéro servi à celui-là, si bien que l'écho du propre geste de l'onglet ne
 *   relit rien, et que le geste d'un collègue relit tout.
 * - Après un geste, seules les lignes touchées sont relues ; les comptes par
 *   rayon et la liste à valider se recalculent avec l'arithmétique du serveur
 *   (`@lfd/contracts/published-catalog-counts`).
 * - Une relecture en fond ne repasse pas par le chargement : l'écran garde sa
 *   copie, et un échec la laisse en place.
 */
@Injectable({ providedIn: 'root' })
export class CatalogueScreenStore {
  private readonly catalogue = inject(CatalogueService);
  private readonly madeToOrder = inject(MadeToOrderService);

  private readonly loadState = signal<CatalogueScreenState>('idle');
  private readonly copy = signal<ScreenCopy | null>(null);
  private readonly markList = signal<readonly MadeToOrderMarkView[]>([]);

  readonly state = this.loadState.asReadonly();
  readonly view = computed(() => this.copy()?.published ?? EMPTY_VIEW);
  readonly items = computed(() => this.copy()?.items ?? []);
  readonly marks = computed<ReadonlyMap<string, MadeToOrderMarkView>>(
    () => new Map(this.markList().map((mark) => [mark.sku, mark])),
  );

  /** Le numéro de la copie — `null` tant qu'elle n'existe pas. */
  readonly version = computed(() => this.copy()?.version ?? null);

  /** Charge à la première ouverture, ou après un échec ; sinon rien. */
  async open(): Promise<void> {
    const state = this.loadState();
    if (state === 'idle' || state === 'error') {
      await this.load();
    }
  }

  /** Le chargement visible : l'écran montre l'attente, puis la copie ou l'erreur. */
  async load(): Promise<void> {
    this.loadState.set('loading');
    try {
      await this.readAll();
      this.loadState.set('ready');
    } catch {
      this.loadState.set('error');
    }
  }

  /**
   * La relecture en fond — le veilleur ou le filet. Ne rejette pas : un échec
   * garde la copie, le tour suivant reposera la question.
   */
  async refresh(): Promise<void> {
    if (this.loadState() !== 'ready') {
      return;
    }
    try {
      await this.readAll();
    } catch {
      // La copie reste : le veilleur reposera la question.
    }
  }

  /**
   * Relit les lignes touchées par un geste, les remplace dans la copie et
   * recalcule comptes et liste à valider. Rejette si la relecture échoue :
   * l'écran le dit.
   */
  async refreshRows(skus: readonly string[]): Promise<void> {
    const unique = [...new Set(skus)];
    const batches: string[][] = [];
    for (let start = 0; start < unique.length; start += REVIEW_BATCH_MAX) {
      batches.push(unique.slice(start, start + REVIEW_BATCH_MAX));
    }
    const answers = await Promise.all(batches.map((batch) => this.catalogue.screenRows(batch)));
    const current = this.copy();
    if (current === null) {
      return;
    }
    this.copy.set(
      answers.reduce((copy, answer, index) => merged(copy, answer, batches[index] ?? []), current),
    );
  }

  /** Les marqueurs seuls, après le panneau du sur mesure. */
  async refreshMarks(): Promise<void> {
    this.markList.set(await this.madeToOrder.marks());
  }

  private async readAll(): Promise<void> {
    const screen = await this.catalogue.screen();
    this.copy.set({ version: screen.version, published: screen.published, items: screen.items });
    this.markList.set(screen.madeToOrder ?? []);
  }
}

/**
 * La copie, les lignes relues remplacées. Une fiche relue remplace la sienne
 * à sa place ; les articles des fiches relues et les SKU demandés sortent,
 * puis les articles relus reprennent la place du premier d'entre eux — un SKU
 * demandé et absent de la réponse n'est plus en vente.
 */
export function merged(
  copy: ScreenCopy,
  answer: CatalogScreenRowsView,
  requested: readonly string[],
): ScreenCopy {
  const entries = replacedEntries(copy.published.entries, answer.entries);
  const touchedProducts = new Set([
    ...answer.entries.map((entry) => entry.productId),
    ...answer.items.map((item) => item.productId),
  ]);
  const requestedSkus = new Set(requested);
  const leaves = (item: CatalogScreenItemView): boolean =>
    touchedProducts.has(item.productId) || requestedSkus.has(item.sku);
  const firstLeaving = copy.items.findIndex(leaves);
  const kept = copy.items.filter((item) => !leaves(item));
  const at =
    firstLeaving === -1
      ? kept.length
      : copy.items.slice(0, firstLeaving).filter((item) => !leaves(item)).length;
  const items = [...kept.slice(0, at), ...answer.items, ...kept.slice(at)];
  const families = copy.published.shelves.flatMap((shelf) =>
    shelf.name === null
      ? []
      : [
          {
            categoryId: shelf.categoryId,
            name: shelf.name,
            position: shelf.position,
            withdrawn: shelf.withdrawn,
          },
        ],
  );
  // Le numéro de la copie ne bouge pas : celui que rendent les lignes peut
  // couvrir le geste d'un collègue, que ces seules lignes ne montrent pas. Le
  // veilleur verra donc un numéro différent et relira l'écran entier, servi
  // le plus souvent par l'objet partagé.
  return {
    version: copy.version,
    items,
    published: {
      shelves: publishedShelvesOf(families, entries),
      entries,
      pendingReview: pendingReviewOf(items),
    },
  };
}

function replacedEntries(
  entries: readonly PublishedEntryView[],
  fresh: readonly PublishedEntryView[],
): PublishedEntryView[] {
  const byProduct = new Map(fresh.map((entry) => [entry.productId, entry]));
  const replaced = entries.map((entry) => byProduct.get(entry.productId) ?? entry);
  const known = new Set(entries.map((entry) => entry.productId));
  return [...replaced, ...fresh.filter((entry) => !known.has(entry.productId))];
}
