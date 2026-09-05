import { effect, Injectable, signal, type Signal } from '@angular/core';

import { isRecord, readLocal, readNumber, writeLocal } from '../local-store';
import { productById } from '../shop/mock-shop';

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

/**
 * **L'état du panier**, et rien de plus : des quantités par référence, relues et
 * réécrites dans le navigateur.
 *
 * Les quantités sont la SEULE donnée retenue ; tout le reste — lignes, nombre de
 * pièces, décompte, relance — en dérive et vit dans les services d'à côté. Un
 * panier qui stockerait aussi son total aurait deux vérités à tenir d'accord.
 *
 * **Ce que ce dépôt ne fait pas** est ce qui le définit : il ne sait pas qu'une
 * ligne à zéro n'existe pas, ni qu'on ne peut ajouter qu'un produit du
 * catalogue, ni ce que le panier coûte. Ce sont des règles de panier, pas des
 * règles d'état — elles sont dans {@link ClientCart}, où elles se lisent et se
 * changent sans toucher à la persistance.
 *
 * La seule règle qu'il porte est celle de sa propre relecture : une référence
 * que le catalogue ne connaît plus ne rentre pas. Elle est ici parce qu'elle
 * parle de ce que le STOCKAGE a le droit de rendre — pas de ce que le panier a
 * le droit de faire.
 *
 * ⚠️ Il est relu du NAVIGATEUR, jamais de la base : le panier en attente est le
 * seul vrai ajout de modèle côté serveur (cf. `07-accueil-connecte.md`), et tant
 * qu'il n'existe pas la démo n'a pas à écrire dans les données de l'entreprise.
 */
@Injectable({ providedIn: 'root' })
export class CartStore {
  private readonly quantities$ = signal<Readonly<Record<string, number>>>(
    readLocal(KEY, parseCart) ?? {},
  );

  /** Les quantités par référence — la seule donnée que le panier retient. */
  readonly quantities: Signal<Readonly<Record<string, number>>> = this.quantities$.asReadonly();

  constructor() {
    // ⚠️ Le panier est stocké dans le NAVIGATEUR, pas en base : c'est de la
    // matière de démonstration. Le jour où le panier en attente devient un vrai
    // agrégat serveur (cf. `07-accueil-connecte.md`), c'est cette ligne-ci qui
    // change, et rien d'autre.
    effect(() => {
      writeLocal(KEY, this.quantities$());
    });
  }

  quantityOf(productId: string): number {
    return this.quantities$()[productId] ?? 0;
  }

  /**
   * Fixe la quantité d'une référence. **Zéro ou moins la retire** — la clé
   * disparaît au lieu de rester à zéro, sans quoi le stockage garderait une
   * trace de tout ce qui a un jour été au panier.
   */
  setQuantity(productId: string, quantity: number): void {
    this.quantities$.update((current) => {
      const next = { ...current };
      if (quantity > 0) {
        next[productId] = Math.floor(quantity);
      } else {
        delete next[productId];
      }
      return next;
    });
  }

  clear(): void {
    this.quantities$.set({});
  }
}
