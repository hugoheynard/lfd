import { computed, effect, Injectable, signal } from '@angular/core';

import type { FoldProduct } from '../../shared';
import { priceEurOf, productById } from './catalogue-seed';

/**
 * Clé de persistance — **versionnée** : si la forme stockée change un jour, on
 * bumpe le suffixe (`-v2`) pour ignorer proprement les anciens paniers.
 */
const CART_STORAGE_KEY = 'lfc-b2b-cart-v1';

/** Une ligne du panier — le produit résolu, sa quantité et ses totaux. */
export interface CartLine {
  readonly product: FoldProduct;
  readonly qty: number;
  readonly unitPriceEur: number;
  readonly lineTotalEur: number;
}

/**
 * Panier du client pro. Source de vérité = la seule table `id → quantité` ;
 * lignes, nombre d'articles et total sont **dérivés** (`computed`), les prix
 * re-résolus à l'affichage (un prix qui change est reflété tout seul).
 *
 * **Persistance : localStorage réactif** — on écrit à *chaque* mutation (pas à
 * la fermeture du panel : le panel n'est qu'une vue) et on ré-hydrate à la
 * construction du singleton. Le panier survit ainsi au reload, à la fermeture
 * d'onglet et à la navigation. On ne persiste QUE la map `id→qty` (la source de
 * vérité), jamais les dérivés.
 *
 * Brouillon **par appareil** — suffisant à ce stade. Trajectoire notée dans
 * `documentation/architecture-flux-commande-prod.md` : passage à un **cart
 * serveur (Redis/Upstash) multi-appareil + merge-on-login** avant le launch si
 * voulu. La surface du service ne changera pas — seule la couche persistance.
 */
@Injectable({ providedIn: 'root' })
export class CartService {
  /** id produit → quantité (immutable ; on remplace la Map à chaque mutation). */
  private readonly qtys = signal<ReadonlyMap<string, number>>(hydrate());

  constructor() {
    // Écrit à chaque changement de la source de vérité. Tourne aussi une fois à
    // l'init (ré-écrit l'état hydraté — idempotent).
    effect(() => persist(this.qtys()));
  }

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

/** Vrai si `localStorage` est disponible (SSR / mode privé strict → faux). */
function hasStorage(): boolean {
  return typeof localStorage !== 'undefined';
}

/** Recharge la map `id→qty` depuis localStorage — vide si absent ou corrompu. */
function hydrate(): ReadonlyMap<string, number> {
  if (!hasStorage()) {
    return new Map();
  }
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(CART_STORAGE_KEY);
  } catch {
    return new Map();
  }
  if (raw === null) {
    return new Map();
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return new Map();
    }
    const map = new Map<string, number>();
    for (const entry of parsed) {
      const line = asLine(entry);
      if (line !== null) {
        map.set(line[0], line[1]);
      }
    }
    return map;
  } catch {
    return new Map();
  }
}

/** Écrit la map `id→qty` en localStorage (échec silencieux : quota / mode privé). */
function persist(qtys: ReadonlyMap<string, number>): void {
  if (!hasStorage()) {
    return;
  }
  try {
    localStorage.setItem(CART_STORAGE_KEY, JSON.stringify([...qtys]));
  } catch {
    // Quota dépassé ou stockage refusé : le panier reste en mémoire, tant pis
    // pour la persistance de cette session.
  }
}

/** Valide une entrée stockée en `[id, qty]` avec `qty > 0`, sinon `null`. */
function asLine(value: unknown): readonly [string, number] | null {
  if (!Array.isArray(value) || value.length !== 2) {
    return null;
  }
  const pair: readonly unknown[] = value;
  const [id, qty] = pair;
  if (typeof id === 'string' && typeof qty === 'number' && qty > 0) {
    return [id, qty];
  }
  return null;
}
