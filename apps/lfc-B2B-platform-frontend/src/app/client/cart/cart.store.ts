import { effect, Injectable, signal, type Signal } from '@angular/core';

import { isRecord, readLocal, readNumber, readString, writeLocal } from '../local-store';

const KEY = 'cart';

/**
 * La date du dernier geste sur ce panier, **dans une clé à part**.
 *
 * À part, et pas dans `cart` : la clé du panier est déjà écrite dans les
 * navigateurs des clients, et changer sa forme rendrait illisible tout ce qui y
 * est. Une clé neuve absente veut dire « je ne sais pas quand », ce que la
 * fusion traite comme le plus ancien — le bon défaut, puisque c'est un panier
 * d'avant ce chantier.
 */
const SAVED_AT_KEY = 'cart.savedAt';

/**
 * Le panier relu du navigateur : des quantités entières positives, et rien
 * d'autre.
 *
 * 🔴 **Il ne vérifie plus que la référence existe au catalogue**, et ce n'est
 * pas un renoncement : le catalogue vient du réseau désormais, et il n'est pas
 * là quand ce dépôt naît. Vérifier ici demanderait d'attendre une requête pour
 * relire une clé de stockage — c'est-à-dire de faire dépendre l'état local d'un
 * serveur joignable.
 *
 * L'oubli des références disparues n'a pas disparu pour autant : il a changé de
 * moment. `ClientCart` l'élague dès que le catalogue arrive, et ses lignes ne
 * montrent de toute façon que ce que le catalogue connaît — une référence
 * inconnue est invisible avant même d'être élaguée.
 */
function parseCart(raw: unknown): Readonly<Record<string, number>> | null {
  if (!isRecord(raw)) {
    return null;
  }
  const clean: Record<string, number> = {};
  for (const [id, value] of Object.entries(raw)) {
    const quantity = readNumber(value);
    if (quantity !== null && quantity > 0) {
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
 * ## Où il vit désormais
 *
 * Le navigateur reste la mémoire **immédiate** : elle est synchrone, elle
 * survit à un rechargement, et elle est la seule dont dispose un visiteur qui
 * n'est pas reconnu — la boutique se visite sans compte, par décision. Pour qui
 * EST reconnu, {@link ShopCartSync} en fait le miroir d'une ligne en base, et
 * c'est elle qui traverse les appareils.
 *
 * Ce dépôt ne sait rien de cette bascule : il porte un état, sa persistance
 * locale, et **la date du dernier geste** — la seule chose que la fusion ait
 * besoin de savoir pour trancher entre deux copies.
 */
@Injectable({ providedIn: 'root' })
export class CartStore {
  private readonly quantities$ = signal<Readonly<Record<string, number>>>(
    readLocal(KEY, parseCart) ?? {},
  );

  /** Les quantités par référence — la seule donnée que le panier retient. */
  readonly quantities: Signal<Readonly<Record<string, number>>> = this.quantities$.asReadonly();

  private readonly savedAt$ = signal<string | null>(readLocal(SAVED_AT_KEY, readString));

  /**
   * Quand ce panier a été TOUCHÉ pour la dernière fois, en ISO — `null` tant
   * qu'il ne l'a jamais été.
   *
   * C'est l'arbitre de la fusion, et rien d'autre : entre la copie du navigateur
   * et celle du serveur, la plus récente gagne **en entier**. Fusionner ligne à
   * ligne aurait paru plus doux et aurait été faux — un panier vidé sur le
   * téléphone se serait alors rempli à nouveau depuis l'ordinateur, et retirer
   * une pièce n'aurait jamais pu traverser.
   */
  readonly savedAt: Signal<string | null> = this.savedAt$.asReadonly();

  constructor() {
    // 🔴 Ce commentaire annonçait qu'« un vrai agrégat serveur ne changerait
    // que cette ligne-ci, et rien d'autre ». Le jour est venu, et la prédiction
    // était fausse : cette ligne n'a PAS bougé. Ce qui a bougé, c'est tout
    // autour — un stockage local est synchrone à la construction, un stockage
    // serveur arrive plus tard et peut contredire ce qui est déjà à l'écran. Il
    // a donc fallu une DATE pour trancher, et un service pour la reprise
    // (`ShopCartSync`). Une écriture locale reste juste : elle est la mémoire
    // immédiate, la seule dont dispose un visiteur non reconnu.
    effect(() => {
      writeLocal(KEY, this.quantities$());
    });
    effect(() => {
      writeLocal(SAVED_AT_KEY, this.savedAt$());
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
  setQuantity(productId: string, quantity: number, at: string = now()): void {
    this.savedAt$.set(at);
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

  clear(at: string = now()): void {
    this.savedAt$.set(at);
    this.quantities$.set({});
  }

  /**
   * Pose l'état ENTIER, avec la date qui l'accompagne — ce que fait une reprise
   * depuis le serveur.
   *
   * Il prend la date de la copie qu'il installe, et surtout pas l'instant
   * présent : reprendre un panier n'est pas y toucher. Dater la reprise ferait
   * de la copie relue la plus récente à chaque chargement de page, et le
   * panier composé ailleurs entre-temps ne gagnerait plus jamais.
   */
  replaceAll(quantities: Readonly<Record<string, number>>, at: string): void {
    this.savedAt$.set(at);
    this.quantities$.set(parseCart(quantities) ?? {});
  }

  /**
   * Oublie les références que le catalogue ne connaît plus.
   *
   * Appelé quand le catalogue arrive, et pas avant : c'est ce qui remplace la
   * vérification que la relecture faisait quand le catalogue était une constante
   * compilée. Sans lui, le stockage garderait indéfiniment des références
   * retirées de la vente.
   */
  keepOnly(known: ReadonlySet<string>): void {
    // Sans dater : élaguer n'est pas un geste du client. Tous ses appareils
    // reçoivent le même catalogue et élaguent pareil ; faire de cet élagage la
    // touche la plus récente ferait gagner l'appareil qui a chargé en dernier.
    this.quantities$.update((current) =>
      Object.fromEntries(Object.entries(current).filter(([sku]) => known.has(sku))),
    );
  }
}

/** L'instant du geste. Le front n'a pas de port d'horloge — cf. `lint:clock-port`, qui garde l'API. */
function now(): string {
  return new Date().toISOString();
}
