import { computed, effect, inject, Injectable, Injector, untracked } from '@angular/core';
import { FoldPanelHostService } from 'fold-ng';

import { type CartLine } from './cart-total';
import { CartStore } from './cart.store';
import { ShopCartSync } from './shop-cart-sync.service';
import { ShopQuote } from './shop-quote.service';
import { ShopCatalogue } from '../shop/shop-catalogue.store';
import { ProVisit } from '../shop/pro-visit.service';
import { nextQuantity, previousQuantity, isSoldByWeight } from '../shop/sale-unit';
import { SignInDialog } from '../../login/sign-in-dialog/sign-in-dialog';

/** Où mène la connexion demandée par un geste d'achat en visite pro — la porte du repère. */
const PRO_VISIT_SIGN_IN = '/mon-compte';

/**
 * Ce qu'est devenu un geste d'achat : posé au panier, ou détourné vers la
 * connexion (visite pro). L'appelant le lit pour ne pas compter un ajout qui
 * n'a pas eu lieu.
 */
export type CartGesture = 'applied' | 'signInRequired';

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
  private readonly proVisit = inject(ProVisit);
  private readonly panels = inject(FoldPanelHostService);

  private readonly injector = inject(Injector);

  constructor() {
    /**
     * Le panier démarre au premier passage des effets, et une seule fois : un
     * effet qui ne lit aucun signal ne repasse jamais.
     *
     * Il attendait jusqu'au 2026-10-09 que la boutique permette de COMMANDER
     * (clé `shop`) ; la clé est retirée, on commande toujours. Le report d'un
     * passage est gardé tel quel : c'est le moment où le panier démarrait déjà
     * boutique ouverte, et les suites qui le construisent en dépendent.
     */
    effect(() => {
      // `untracked` : la synchronisation pose ses propres effets, ce qu'Angular
      // refuse depuis un contexte réactif.
      untracked(() => {
        this.start();
      });
    });

    // Le catalogue arrive du réseau : l'élagage des références disparues ne peut
    // pas se faire à la relecture du stockage, il se fait ici, une fois qu'on
    // sait ce qui est encore en vente. Cf. `CartStore.keepOnly`.
    effect(() => {
      if (this.catalogue.status() === 'ready') {
        this.store.keepOnly(new Set(this.catalogue.items().map((item) => item.sku)));
      }
    });
  }

  private start(): void {
    // Instanciée pour son EFFET, pas pour son API — le même parti que
    // `ClientOnboarding` dans le shell. Elle reprend le panier gardé chez nous à
    // la première reconnaissance, puis écrit ce que le client compose.
    this.injector.get(ShopCartSync);

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
     * `hydrate()` est idempotent — l'appel du rayon reste sans effet.
     */
    void this.catalogue.hydrate();
  }

  /**
   * Les lignes, dans l'ordre du rayon — pas dans l'ordre des ajouts.
   *
   * Elles se projettent à travers le CATALOGUE : une référence qu'il ne connaît
   * pas — retirée de la vente, ou pas encore arrivée — n'a pas de ligne. C'est
   * ce qui rend l'élagage du stockage inoffensif quand il tarde.
   */
  readonly lines = computed<readonly CartLine[]>(() => {
    // 🔴 En visite pro, le panier est CACHÉ, pas vidé (Hugo, 2026-10-19 : « un
    // pro non loggé ne doit pas pouvoir commander ») : le dépôt garde ce qu'un
    // particulier y avait mis, et tout reparaît quand la visite cesse.
    if (this.proVisit.active()) {
      return [];
    }
    const quantities = this.store.quantities();
    return this.catalogue
      .items()
      .filter((item) => (quantities[item.sku] ?? 0) > 0)
      .map((product) => ({ product, quantity: quantities[product.sku] ?? 0 }));
  });

  /**
   * Le nombre de PIÈCES, pas de références : c'est ce que le comptoir prépare.
   * Un article au poids compte pour UNE ligne, jamais pour ses grammes (plan
   * `plan-vente-au-poids.md` §2).
   */
  readonly count = computed(() =>
    this.lines().reduce((sum, l) => sum + (isSoldByWeight(l.product) ? 1 : l.quantity), 0),
  );

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

  /** Le refus du serveur que le décompte doit montrer à la place de ses montants. */
  readonly refusal = this.quote.refusal;

  /** Les points que le panier rapporterait, selon le serveur — cf. {@link ShopQuote.loyaltyPointsToEarn}. */
  readonly loyaltyPointsToEarn = this.quote.loyaltyPointsToEarn;

  /** La baisse de TTC du bon choisi, selon le serveur — cf. {@link ShopQuote.voucherTotalEffectCents}. */
  readonly voucherTotalEffectCents = this.quote.voucherTotalEffectCents;

  quantityOf(productId: string): number {
    return this.proVisit.active() ? 0 : this.store.quantityOf(productId);
  }

  /**
   * **La porte de tout geste d'achat.** En visite pro, rien n'entre au panier :
   * la connexion s'ouvre à la place — la même que partout (`SignInDialog`) —
   * et le geste rend `signInRequired`.
   *
   * Elle est ICI, et pas sur chaque bouton, parce que ce service est le seul à
   * faire bouger le panier : un point d'entrée ajouté demain (une carte de
   * plus, un « recommander ») passe par {@link add} ou {@link setQuantity} et
   * hérite du refus sans le savoir. Un appelant qui doit agir AVANT d'écrire
   * (vider pour recommander) l'appelle lui-même.
   */
  admit(): CartGesture {
    if (!this.proVisit.active()) {
      return 'applied';
    }
    SignInDialog.open(this.panels, PRO_VISIT_SIGN_IN);
    return 'signInRequired';
  }

  add(productId: string): CartGesture {
    if (this.admit() === 'signInRequired') {
      return 'signInRequired';
    }
    const item = this.catalogue.itemOf(productId);
    if (item !== null) {
      // Une pièce de plus ; au poids, un pas de plus — ou le minimum au premier geste.
      this.store.setQuantity(productId, nextQuantity(item, this.store.quantityOf(productId)));
    }
    return 'applied';
  }

  /**
   * Retirer la dernière pièce retire la ligne : une ligne à zéro n'existe pas.
   * Au poids, un pas de moins — et la ligne part sous le minimum.
   */
  remove(productId: string): void {
    const current = this.store.quantityOf(productId);
    const item = this.catalogue.itemOf(productId);
    this.store.setQuantity(
      productId,
      item === null ? current - 1 : previousQuantity(item, current),
    );
  }

  /**
   * Poser la quantité d'une ligne — ce que fait un champ, par opposition au
   * « + » qui en ajoute une.
   *
   * Le catalogue garde la porte comme pour {@link add} : une référence qu'il
   * ne connaît pas n'entre pas dans un état qu'aucun écran ne saurait afficher.
   */
  setQuantity(productId: string, quantity: number): CartGesture {
    if (this.admit() === 'signInRequired') {
      return 'signInRequired';
    }
    if (this.catalogue.itemOf(productId) !== null) {
      this.store.setQuantity(productId, quantity);
    }
    return 'applied';
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
