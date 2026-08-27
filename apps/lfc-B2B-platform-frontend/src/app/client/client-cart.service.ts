import { computed, effect, inject, Injectable, signal } from '@angular/core';

import { type CartLine, type CartTotals, priceCart } from './cart-total';
import { ClientOrder } from './client-order.service';
import { isRecord, readLocal, readNumber, writeLocal } from './local-store';
import { productById, SHOP_PRODUCTS } from './mock-shop';

const KEY = 'cart';

/**
 * Le panier relu du navigateur : on ne garde que les références qui EXISTENT
 * encore au catalogue, avec une quantité entière positive. Un produit retiré du
 * rayon disparaît ainsi du panier au lieu de le faire tomber.
 */
function parseCart(raw: unknown): Readonly<Record<string, number>> | null {
  if (!isRecord(raw)) {
    return null;
  }
  const clean: Record<string, number> = {};
  for (const [id, value] of Object.entries(raw)) {
    const quantity = readNumber(value);
    if (quantity !== null && quantity > 0 && productById(id) !== null) {
      clean[id] = Math.floor(quantity);
    }
  }
  return clean;
}

/** Ce qu'on propose en relance : ce qui se rajoute par gourmandise, pas par besoin. */
const TREATS: readonly string[] = ['choco', 'patis'];

/**
 * Le panier en cours — un seul, partagé par le rayon, la fiche et le panier.
 *
 * Les quantités sont la SEULE donnée retenue ; tout le reste (lignes, nombre de
 * pièces, décompte) en dérive. Un panier qui stockerait aussi son total aurait
 * deux vérités à tenir d'accord.
 *
 * Il est relu du NAVIGATEUR, jamais de la base : le panier en attente est le
 * seul vrai ajout de modèle côté serveur (cf. `07-accueil-connecte.md`), et
 * tant qu'il n'existe pas la démo n'a pas à écrire dans les données de
 * l'entreprise.
 */
@Injectable({ providedIn: 'root' })
export class ClientCart {
  private readonly order = inject(ClientOrder);

  private readonly quantities = signal<Readonly<Record<string, number>>>(
    readLocal(KEY, parseCart) ?? {},
  );

  constructor() {
    // ⚠️ Le panier est stocké dans le NAVIGATEUR, pas en base : c'est de la
    // matière de démonstration. Le jour où le panier en attente devient un vrai
    // agrégat serveur (cf. `07-accueil-connecte.md`), c'est cette ligne-ci qui
    // change, et rien d'autre.
    effect(() => {
      writeLocal(KEY, this.quantities());
    });
  }

  /** Les lignes, dans l'ordre du rayon — pas dans l'ordre des ajouts. */
  readonly lines = computed<readonly CartLine[]>(() => {
    const quantities = this.quantities();
    return SHOP_PRODUCTS.filter((p) => (quantities[p.id] ?? 0) > 0).map((product) => ({
      product,
      quantity: quantities[product.id] ?? 0,
    }));
  });

  /** Le nombre de PIÈCES, pas de références : c'est ce que le comptoir prépare. */
  readonly count = computed(() => this.lines().reduce((sum, l) => sum + l.quantity, 0));

  readonly isEmpty = computed(() => this.count() === 0);

  readonly totals = computed<CartTotals>(() => {
    const choice = this.order.choice();
    return priceCart(this.lines(), choice?.discount ?? 0, choice?.fee ?? 0);
  });

  /**
   * La relance : la première gourmandise ABSENTE du panier.
   *
   * Jamais un produit déjà dedans — proposer ce qu'on a déjà se lit comme un
   * bug —, et `null` quand il n'y a plus rien à proposer : la carte disparaît
   * alors au lieu de tourner à vide.
   */
  readonly upsell = computed(() => {
    const quantities = this.quantities();
    return (
      SHOP_PRODUCTS.find((p) => TREATS.includes(p.category) && (quantities[p.id] ?? 0) === 0) ??
      null
    );
  });

  quantityOf(productId: string): number {
    return this.quantities()[productId] ?? 0;
  }

  add(productId: string): void {
    if (!productById(productId)) {
      return;
    }
    this.quantities.update((q) => ({ ...q, [productId]: (q[productId] ?? 0) + 1 }));
  }

  /** Retirer la dernière pièce retire la ligne : une ligne à zéro n'existe pas. */
  remove(productId: string): void {
    this.quantities.update((q) => {
      const next = { ...q };
      const left = (next[productId] ?? 0) - 1;
      if (left > 0) {
        next[productId] = left;
      } else {
        delete next[productId];
      }
      return next;
    });
  }

  clear(): void {
    this.quantities.set({});
  }
}
