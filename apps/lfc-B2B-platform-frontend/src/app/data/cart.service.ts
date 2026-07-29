import { computed, Injectable, signal } from '@angular/core';

import type { FoldProduct } from '../../shared';
import { priceEurOf, productById } from './catalogue-seed';

/** Une ligne du panier — le produit résolu, sa quantité et ses totaux. */
export interface CartLine {
  readonly product: FoldProduct;
  readonly qty: number;
  readonly unitPriceEur: number;
  readonly lineTotalEur: number;
}

/**
 * Panier du client pro — état **en mémoire** (id → quantité). Les lignes, le
 * nombre d'articles et le total sont dérivés : la source de vérité est la seule
 * table des quantités, tout le reste est `computed`. Se branchera sur l'API B2B
 * (Prisma) plus tard sans changer la surface.
 */
@Injectable({ providedIn: 'root' })
export class CartService {
  /** id produit → quantité (immutable ; on remplace la Map à chaque mutation). */
  private readonly qtys = signal<ReadonlyMap<string, number>>(new Map());

  /** Lignes résolues (produit + prix), dans l'ordre d'ajout. */
  readonly lines = computed<readonly CartLine[]>(() => {
    const out: CartLine[] = [];
    for (const [id, qty] of this.qtys()) {
      const product = productById(id);
      if (product === undefined || qty <= 0) {
        continue;
      }
      const unitPriceEur = priceEurOf(id);
      out.push({ product, qty, unitPriceEur, lineTotalEur: unitPriceEur * qty });
    }
    return out;
  });

  /** Nombre total d'articles (somme des quantités). */
  readonly count = computed(() => this.lines().reduce((n, l) => n + l.qty, 0));

  /** Total TTC (€). */
  readonly totalEur = computed(() => this.lines().reduce((s, l) => s + l.lineTotalEur, 0));

  readonly isEmpty = computed(() => this.lines().length === 0);

  add(id: string, qty = 1): void {
    this.qtys.update((m) => {
      const next = new Map(m);
      next.set(id, (next.get(id) ?? 0) + qty);
      return next;
    });
  }

  /** Fixe la quantité ; ≤ 0 retire la ligne. */
  setQty(id: string, qty: number): void {
    this.qtys.update((m) => {
      const next = new Map(m);
      if (qty <= 0) {
        next.delete(id);
      } else {
        next.set(id, qty);
      }
      return next;
    });
  }

  remove(id: string): void {
    this.qtys.update((m) => {
      const next = new Map(m);
      next.delete(id);
      return next;
    });
  }

  clear(): void {
    this.qtys.set(new Map());
  }
}
