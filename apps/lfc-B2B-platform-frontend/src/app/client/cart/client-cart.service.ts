import { computed, effect, inject, Injectable } from '@angular/core';

import { type CartLine } from './cart-total';
import { CartStore } from './cart.store';
import { ShopCartSync } from './shop-cart-sync.service';
import { ShopQuote } from './shop-quote.service';
import { ShopCatalogue } from '../shop/shop-catalogue.store';

/**
 * **Le panier en cours** — un seul, partagé par le rayon, la fiche et le panier.
 *
 * Ce service porte les RÈGLES ; l'état est dans {@link CartStore}, qu'il est
 * seul à faire bouger. Le partage a une raison précise : une règle de panier se
 * relit et se discute (« retirer la dernière pièce retire la ligne »), alors
 * qu'une persistance se remplace. C'est arrivé : le panier vit désormais en base
 * pour qui est reconnu ({@link ShopCartSync}), et **aucune des trois règles
 * ci-dessous n'a bougé** — le dépôt a gagné une date, rien d'autre n'a changé
 * ici.
 *
 * Trois règles vivent ici, et nulle part ailleurs :
 *
 * 1. **on n'ajoute que ce qui est au catalogue HYDRATÉ** — une référence
 *    inconnue est ignorée en silence plutôt que de rentrer dans un état qu'aucun
 *    écran ne saurait afficher. Tant que le catalogue n'est pas arrivé, rien ne
 *    s'ajoute : il n'y a alors aucun écran d'où le demander ;
 * 2. **une ligne à zéro n'existe pas** — retirer la dernière pièce retire la
 *    ligne, ce qui n'est pas la même chose que la garder à zéro ;
 * 3. **les lignes sortent dans l'ordre du RAYON**, pas dans celui des ajouts :
 *    le panier doit se relire comme la boutique se parcourt.
 */
@Injectable({ providedIn: 'root' })
export class ClientCart {
  private readonly store = inject(CartStore);
  private readonly quote = inject(ShopQuote);
  private readonly catalogue = inject(ShopCatalogue);

  constructor() {
    // Instanciée pour son EFFET, pas pour son API — le même parti que
    // `ClientOnboarding` dans le shell. Elle reprend le panier gardé chez nous à
    // la première reconnaissance, puis écrit ce que le client compose. Réveillée
    // ici parce que c'est ici que le panier existe : partout où il est
    // construit, elle doit tourner.
    inject(ShopCartSync);

    /**
     * 🔴 **Le panier demande le catalogue lui-même.**
     *
     * Ses lignes se projettent à travers lui : sans catalogue, un panier plein
     * se lit comme un panier vide. L'hydratation était déclenchée par l'écran du
     * RAYON, et lui seul — recharger la page sur le panier, ou y arriver par un
     * lien, montrait donc zéro pièce et un total à zéro, avec le vrai panier
     * intact dans le navigateur. La pastille du bandeau comptait zéro pour la
     * même raison, sur tous les écrans.
     *
     * Ce n'est pas une requête de trop : partout où le panier est construit, sa
     * pastille est affichée, donc le catalogue est nécessaire. `hydrate()` est
     * idempotent — l'appel du rayon reste sans effet.
     */
    void this.catalogue.hydrate();

    // Le catalogue arrive du réseau : l'élagage des références disparues ne peut
    // pas se faire à la relecture du stockage, il se fait ici, une fois qu'on
    // sait ce qui est encore en vente. Cf. `CartStore.keepOnly`.
    effect(() => {
      if (this.catalogue.status() === 'ready') {
        this.store.keepOnly(new Set(this.catalogue.items().map((item) => item.sku)));
      }
    });
  }

  /**
   * Les lignes, dans l'ordre du rayon — pas dans l'ordre des ajouts.
   *
   * Elles se projettent à travers le CATALOGUE : une référence qu'il ne connaît
   * pas — retirée de la vente, ou pas encore arrivée — n'a pas de ligne. C'est
   * ce qui rend l'élagage du stockage inoffensif quand il tarde.
   */
  readonly lines = computed<readonly CartLine[]>(() => {
    const quantities = this.store.quantities();
    return this.catalogue
      .items()
      .filter((item) => (quantities[item.sku] ?? 0) > 0)
      .map((product) => ({ product, quantity: quantities[product.sku] ?? 0 }));
  });

  /** Le nombre de PIÈCES, pas de références : c'est ce que le comptoir prépare. */
  readonly count = computed(() => this.lines().reduce((sum, l) => sum + l.quantity, 0));

  readonly isEmpty = computed(() => this.count() === 0);

  /**
   * **Le décompte, tel que le serveur le rend** — plus une ligne d'arithmétique
   * d'argent dans ce fichier.
   *
   * Il se calculait ici : `prix × quantité`, une remise en pourcentage venue
   * d'une maquette, des frais en euros flottants, une TVA recalculée à côté de
   * celle de la caisse. Quatre nombres, quatre occasions de contredire la
   * facture. Cf. {@link ShopQuote}.
   */
  readonly totals = this.quote.totals;

  /**
   * Où en est ce décompte — le dernier connu reste affiché pendant qu'on en
   * demande un autre, et l'écran doit pouvoir le dire.
   */
  readonly pricing = this.quote.status;

  quantityOf(productId: string): number {
    return this.store.quantityOf(productId);
  }

  add(productId: string): void {
    if (this.catalogue.itemOf(productId) === null) {
      return;
    }
    this.store.setQuantity(productId, this.store.quantityOf(productId) + 1);
  }

  /** Retirer la dernière pièce retire la ligne : une ligne à zéro n'existe pas. */
  remove(productId: string): void {
    this.store.setQuantity(productId, this.store.quantityOf(productId) - 1);
  }

  /**
   * Poser la quantité d'une ligne — ce que fait un champ, par opposition au
   * « + » qui en ajoute une.
   *
   * Le catalogue garde la porte comme pour {@link add} : une référence qu'il
   * ne connaît pas n'entre pas dans un état qu'aucun écran ne saurait afficher.
   */
  setQuantity(productId: string, quantity: number): void {
    if (this.catalogue.itemOf(productId) === null) {
      return;
    }
    this.store.setQuantity(productId, quantity);
  }

  /**
   * Retirer la LIGNE, quelle que soit sa quantité — la corbeille du panier.
   *
   * Distinct de {@link remove}, qui décompte : quand on a changé d'avis sur
   * douze croissants, appuyer douze fois n'est pas un geste. Le dépôt ramène
   * déjà zéro à l'absence, donc il n'y a rien de plus à dire ici.
   */
  drop(productId: string): void {
    this.store.setQuantity(productId, 0);
  }

  clear(): void {
    this.store.clear();
  }
}
