import type { SaleUnit } from "@lfd/money";

import {
  BatchShortcutNotFoundError,
  DuplicateBatchShortcutLabelError,
  TooManyBatchShortcutsError,
} from "../errors/batch-shortcut-errors.js";
import {
  BatchShortcut,
  batchShortcutLabelKey,
  batchShortcutLabelOf,
  batchShortcutPiecesOf,
  type BatchShortcutAuthor,
  type BatchShortcutTerms,
} from "./batch-shortcut.js";

/** Au plus six raccourcis vivants par produit (plan des raccourcis, §2). */
export const MAX_BATCH_SHORTCUTS_PER_PRODUCT = 6;

/** Une modification effective : le raccourci, et ce qu'il disait avant. */
export interface BatchShortcutChange {
  readonly shortcut: BatchShortcut;
  readonly previous: BatchShortcutTerms;
}

/**
 * **Les raccourcis d'UN produit** — l'agrégat (plan
 * `documentation/fournil/plan-raccourcis-du-fournil.md`, §2-§3).
 *
 * Ses invariants regardent l'ensemble, d'où sa frontière au produit : au plus
 * {@link MAX_BATCH_SHORTCUTS_PER_PRODUCT} vivants, et jamais deux fois le même
 * nom, casse ignorée. L'index unique partiel de la table tient le second
 * contre une course ; le premier est tenu ici, sous le verrou que prend le
 * dépôt au chargement.
 *
 * Il retient ce qui a changé depuis le chargement ; le dépôt l'écrit.
 */
export class ProductBatchShortcuts {
  private readonly live: BatchShortcut[];
  private readonly touched = new Map<string, BatchShortcut>();

  private constructor(
    readonly sku: string,
    shortcuts: readonly BatchShortcut[],
  ) {
    this.live = [...shortcuts].sort((left, right) => left.position - right.position);
  }

  /** Les raccourcis vivants du produit, relus. */
  static restore(sku: string, shortcuts: readonly BatchShortcut[]): ProductBatchShortcuts {
    return new ProductBatchShortcuts(sku, shortcuts);
  }

  /** Les vivants, dans l'ordre de leur position. */
  get shortcuts(): readonly BatchShortcut[] {
    return this.live;
  }

  /** Les raccourcis créés, modifiés ou retirés depuis le chargement. */
  get changed(): readonly BatchShortcut[] {
    return [...this.touched.values()];
  }

  /**
   * @throws {InvalidBatchShortcutLabelError} | {InvalidBatchShortcutPiecesError} la saisie.
   * @throws {TooManyBatchShortcutsError} le produit a déjà son plafond.
   * @throws {DuplicateBatchShortcutLabelError} le nom existe déjà pour ce produit.
   */
  add(input: {
    readonly id: string;
    readonly terms: BatchShortcutTerms;
    /** L'unité de l'article, pour nommer un refus ; `null` si elle n'a pas pu être lue. */
    readonly saleUnit: SaleUnit | null;
    readonly author: BatchShortcutAuthor;
    readonly at: Date;
  }): BatchShortcut {
    const terms = termsOf(input.terms, input.saleUnit);
    if (this.live.length >= MAX_BATCH_SHORTCUTS_PER_PRODUCT) {
      throw new TooManyBatchShortcutsError(this.sku, MAX_BATCH_SHORTCUTS_PER_PRODUCT);
    }
    this.refuseDuplicate(terms.label, null);
    const shortcut = BatchShortcut.create({
      id: input.id,
      sku: this.sku,
      terms,
      position: this.nextPosition(),
      author: input.author,
      at: input.at,
    });
    this.live.push(shortcut);
    this.touched.set(shortcut.id, shortcut);
    return shortcut;
  }

  /**
   * Change le nom et les pièces. `null` : rien ne change — rien à écrire ni à
   * journaliser.
   *
   * @throws {BatchShortcutNotFoundError} l'id n'est pas un raccourci vivant du produit.
   * @throws {DuplicateBatchShortcutLabelError} le nouveau nom est celui d'un autre.
   */
  update(
    id: string,
    raw: BatchShortcutTerms,
    at: Date,
    saleUnit: SaleUnit | null,
  ): BatchShortcutChange | null {
    const shortcut = this.find(id);
    const terms = termsOf(raw, saleUnit);
    const previous = shortcut.terms();
    if (previous.label === terms.label && previous.pieces === terms.pieces) {
      return null;
    }
    this.refuseDuplicate(terms.label, id);
    shortcut.reshape(terms, at);
    this.touched.set(id, shortcut);
    return { shortcut, previous };
  }

  /** @throws {BatchShortcutNotFoundError} l'id n'est pas un raccourci vivant du produit. */
  remove(id: string, at: Date): BatchShortcut {
    const shortcut = this.find(id);
    shortcut.remove(at);
    this.live.splice(this.live.indexOf(shortcut), 1);
    this.touched.set(id, shortcut);
    return shortcut;
  }

  private find(id: string): BatchShortcut {
    const shortcut = this.live.find((candidate) => candidate.id === id);
    if (shortcut === undefined) {
      throw new BatchShortcutNotFoundError(id);
    }
    return shortcut;
  }

  private refuseDuplicate(label: string, exceptId: string | null): void {
    const key = batchShortcutLabelKey(label);
    const holder = this.live.find(
      (shortcut) => shortcut.id !== exceptId && batchShortcutLabelKey(shortcut.label) === key,
    );
    if (holder !== undefined) {
      throw new DuplicateBatchShortcutLabelError(this.sku, holder.label);
    }
  }

  /** Après le dernier : un retrait laisse un trou, l'ordre reste juste. */
  private nextPosition(): number {
    return this.live.reduce((max, shortcut) => Math.max(max, shortcut.position + 1), 0);
  }
}

function termsOf(raw: BatchShortcutTerms, saleUnit: SaleUnit | null): BatchShortcutTerms {
  return {
    label: batchShortcutLabelOf(raw.label),
    pieces: batchShortcutPiecesOf(raw.pieces, saleUnit),
  };
}
