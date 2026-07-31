import { computed, effect, Injectable, signal } from '@angular/core';

import type { FoldProduct } from '../../shared';
import { priceEurOf, productById } from './catalogue-seed';

/**
 * Clé de persistance **versionnée** (cf. `CartService`) : bumper le suffixe si
 * la forme stockée change, pour ignorer proprement les anciens paniers.
 */
const STORAGE_KEY = 'lfc-b2b-saved-baskets-v1';

/** Rythme de récurrence d'un panier enregistré. */
export type Recurrence = 'none' | 'weekly' | 'biweekly' | 'monthly';

/** Libellés FR des rythmes, pour les sélecteurs et l'affichage. */
export const RECURRENCE_LABELS: Readonly<Record<Recurrence, string>> = {
  none: 'Ponctuel',
  weekly: 'Chaque semaine',
  biweekly: 'Toutes les 2 semaines',
  monthly: 'Chaque mois',
};

/** Une ligne stockée : le strict minimum (sku + quantité), comme le panier actif. */
export interface BasketLineInput {
  readonly sku: string;
  readonly qty: number;
}

/**
 * Un **panier enregistré** — une **pré-configuration** réutilisable de panier,
 * rattachée à un établissement : un nom, des lignes, une récurrence éventuelle,
 * et un **compteur d'utilisations** (combien de fois recommandé). On stocke le
 * minimum (sku + qté) ; produits, prix et totaux sont re-résolus à l'affichage.
 */
export interface SavedBasket {
  readonly id: string;
  readonly companyId: string;
  readonly name: string;
  readonly lines: readonly BasketLineInput[];
  readonly recurrence: Recurrence;
  /** Prochaine date planifiée (`AAAA-MM-JJ`) ou `null` (ponctuel / non planifié). */
  readonly nextDate: string | null;
  /** Nombre de fois où ce panier a été recommandé (« utilisé »). */
  readonly usageCount: number;
  /** ISO de création — sert de tri (le plus récent d'abord). */
  readonly createdAt: string;
}

/** Une ligne résolue d'un panier enregistré (produit + prix + total). */
export interface ResolvedBasketLine {
  readonly product: FoldProduct;
  readonly qty: number;
  readonly unitPriceEur: number;
  readonly lineTotalEur: number;
}

/** Compteur monotone d'ids — SSR-safe (pas de `crypto.randomUUID`), suffit par appareil. */
let idSeq = 0;

/**
 * Les **paniers enregistrés** du client. Parallèle du `CartService` : source de
 * vérité = la liste des pré-configurations, persistée en localStorage réactif
 * (écriture à chaque mutation, ré-hydratation à la construction). Multi-panier,
 * là où le panier actif est unique.
 *
 * Front-only à ce stade (brouillon par appareil) ; la surface ne changera pas
 * quand la persistance passera côté serveur.
 */
@Injectable({ providedIn: 'root' })
export class SavedBasketsService {
  private readonly _baskets = signal<readonly SavedBasket[]>(hydrate());

  /** Les paniers, du plus récent au plus ancien. */
  readonly baskets = computed(() =>
    [...this._baskets()].sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
  );

  readonly count = computed(() => this._baskets().length);

  constructor() {
    effect(() => persist(this._baskets()));
  }

  /** Les paniers d'un établissement donné (vue filtrée, triée récent d'abord). */
  forCompany(companyId: string): readonly SavedBasket[] {
    return this.baskets().filter((basket) => basket.companyId === companyId);
  }

  /** Un panier par son id, ou `undefined`. */
  byId(basketId: string): SavedBasket | undefined {
    return this._baskets().find((basket) => basket.id === basketId);
  }

  /**
   * Crée un panier enregistré (éventuellement vide, pour le construire ensuite
   * via les suggestions). Renvoie l'id créé.
   */
  create(companyId: string, name: string, lines: readonly BasketLineInput[] = []): string {
    idSeq += 1;
    const id = `basket_${Date.now().toString(36)}_${idSeq}`;
    const basket: SavedBasket = {
      id,
      companyId,
      name,
      lines: lines.filter((line) => line.qty > 0).map((line) => ({ sku: line.sku, qty: line.qty })),
      recurrence: 'none',
      nextDate: null,
      usageCount: 0,
      createdAt: new Date().toISOString(),
    };
    this._baskets.update((list) => [...list, basket]);
    return id;
  }

  /** Ajoute un produit (ou incrémente sa quantité) dans un panier. */
  addProduct(basketId: string, sku: string, qty = 1): void {
    this._baskets.update((list) =>
      list.map((basket) => {
        if (basket.id !== basketId) {
          return basket;
        }
        const existing = basket.lines.find((line) => line.sku === sku);
        const lines = existing
          ? basket.lines.map((line) => (line.sku === sku ? { sku, qty: line.qty + qty } : line))
          : [...basket.lines, { sku, qty }];
        return { ...basket, lines };
      }),
    );
  }

  /** Ajuste la quantité d'une ligne ; ≤ 0 retire la ligne (le panier vidé reste, vide). */
  setQty(basketId: string, sku: string, qty: number): void {
    this._baskets.update((list) =>
      list.map((basket) => {
        if (basket.id !== basketId) {
          return basket;
        }
        const lines = basket.lines
          .map((line) => (line.sku === sku ? { sku, qty } : line))
          .filter((line) => line.qty > 0);
        return { ...basket, lines };
      }),
    );
  }

  /** Fixe le rythme de récurrence et la prochaine date planifiée. */
  setRecurrence(basketId: string, recurrence: Recurrence, nextDate: string | null): void {
    this._baskets.update((list) =>
      list.map((basket) =>
        basket.id === basketId
          ? { ...basket, recurrence, nextDate: recurrence === 'none' ? null : nextDate }
          : basket,
      ),
    );
  }

  /** Renomme un panier (nom vide ignoré). */
  rename(basketId: string, name: string): void {
    const trimmed = name.trim();
    if (trimmed === '') {
      return;
    }
    this._baskets.update((list) =>
      list.map((basket) => (basket.id === basketId ? { ...basket, name: trimmed } : basket)),
    );
  }

  /** Incrémente le compteur d'utilisations (à chaque « recommander »). */
  markUsed(basketId: string): void {
    this._baskets.update((list) =>
      list.map((basket) =>
        basket.id === basketId ? { ...basket, usageCount: basket.usageCount + 1 } : basket,
      ),
    );
  }

  remove(basketId: string): void {
    this._baskets.update((list) => list.filter((basket) => basket.id !== basketId));
  }
}

/** Résout les lignes d'un panier (produit + prix), en ignorant les sku inconnus. */
export function resolveBasketLines(basket: SavedBasket): readonly ResolvedBasketLine[] {
  const out: ResolvedBasketLine[] = [];
  for (const line of basket.lines) {
    const product = productById(line.sku);
    if (product === undefined || line.qty <= 0) {
      continue;
    }
    const unitPriceEur = priceEurOf(line.sku);
    out.push({ product, qty: line.qty, unitPriceEur, lineTotalEur: unitPriceEur * line.qty });
  }
  return out;
}

/** Total € d'un panier (somme des lignes résolues). */
export function basketTotalEur(basket: SavedBasket): number {
  return resolveBasketLines(basket).reduce((sum, line) => sum + line.lineTotalEur, 0);
}

/** Nombre d'articles d'un panier (somme des quantités). */
export function basketItemCount(basket: SavedBasket): number {
  return basket.lines.reduce((sum, line) => sum + line.qty, 0);
}

/** Vrai si `localStorage` est disponible (SSR / mode privé strict → faux). */
function hasStorage(): boolean {
  return typeof localStorage !== 'undefined';
}

/** Recharge la liste depuis localStorage — vide si absente ou corrompue. */
function hydrate(): readonly SavedBasket[] {
  if (!hasStorage()) {
    return [];
  }
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(STORAGE_KEY);
  } catch {
    return [];
  }
  if (raw === null) {
    return [];
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }
    const baskets: SavedBasket[] = [];
    for (const entry of parsed) {
      const basket = asBasket(entry);
      if (basket !== null) {
        baskets.push(basket);
      }
    }
    return baskets;
  } catch {
    return [];
  }
}

/** Écrit la liste en localStorage (échec silencieux : quota / mode privé). */
function persist(baskets: readonly SavedBasket[]): void {
  if (!hasStorage()) {
    return;
  }
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(baskets));
  } catch {
    // Quota dépassé ou stockage refusé : la liste reste en mémoire pour la session.
  }
}

const RECURRENCES: readonly Recurrence[] = ['none', 'weekly', 'biweekly', 'monthly'];

/** Valide une entrée stockée en `SavedBasket`, sinon `null`. */
function asBasket(value: unknown): SavedBasket | null {
  if (typeof value !== 'object' || value === null) {
    return null;
  }
  const v = value as Record<string, unknown>;
  const lines = asLines(v['lines']);
  if (
    typeof v['id'] !== 'string' ||
    typeof v['companyId'] !== 'string' ||
    typeof v['name'] !== 'string' ||
    typeof v['createdAt'] !== 'string' ||
    lines === null
  ) {
    return null;
  }
  const recurrence = RECURRENCES.includes(v['recurrence'] as Recurrence)
    ? (v['recurrence'] as Recurrence)
    : 'none';
  const nextDate = typeof v['nextDate'] === 'string' ? v['nextDate'] : null;
  const usageCount = typeof v['usageCount'] === 'number' && v['usageCount'] >= 0 ? v['usageCount'] : 0;
  return {
    id: v['id'],
    companyId: v['companyId'],
    name: v['name'],
    lines,
    recurrence,
    nextDate: recurrence === 'none' ? null : nextDate,
    usageCount,
    createdAt: v['createdAt'],
  };
}

/** Valide un tableau de lignes stockées. */
function asLines(value: unknown): readonly BasketLineInput[] | null {
  if (!Array.isArray(value)) {
    return null;
  }
  const lines: BasketLineInput[] = [];
  for (const entry of value) {
    if (typeof entry === 'object' && entry !== null) {
      const e = entry as Record<string, unknown>;
      if (typeof e['sku'] === 'string' && typeof e['qty'] === 'number' && e['qty'] > 0) {
        lines.push({ sku: e['sku'], qty: e['qty'] });
      }
    }
  }
  return lines;
}
