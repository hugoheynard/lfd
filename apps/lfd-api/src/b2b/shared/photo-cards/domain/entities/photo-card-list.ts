import type { AppError } from "../../../../../platform/shared/errors/app-error.js";

/** Ce que toute carte porte en texte : un titre et un corps, déjà validés. */
export interface PhotoCardText {
  readonly title: string;
  readonly body: string;
}

/** Une carte telle que la liste la rend et la reçoit. */
export interface PhotoCard<C extends PhotoCardText> {
  readonly id: string;
  readonly content: C;
  readonly photoKey: string | null;
}

/**
 * Où une carte neuve prend place : **en fin** pour une procédure (on suit les
 * étapes dans l'ordre où on les écrit), **en tête** pour un carnet de notes (la
 * dernière note est celle qu'on cherche).
 */
export type PhotoCardInsertion = "end" | "start";

/**
 * Les refus de la liste, **fabriqués par l'usage** : la règle est commune, les
 * mots ne le sont pas. Une étape « n'existe plus dans la procédure », une note
 * n'existe plus dans le carnet — et le message est lu par quelqu'un qui n'a pas
 * le code sous les yeux.
 */
export interface PhotoCardListRefusals {
  readonly full: (max: number) => AppError;
  readonly cardNotFound: (cardId: string) => AppError;
  readonly orderStale: () => AppError;
}

/** Ce que chaque usage fixe : la borne, le côté d'ajout, les mots des refus. */
export interface PhotoCardListRules {
  readonly max: number;
  readonly insertAt: PhotoCardInsertion;
  readonly refusals: PhotoCardListRefusals;
}

/** La carte telle que la liste la mute. */
interface MutableCard<C extends PhotoCardText> {
  readonly id: string;
  content: C;
  photoKey: string | null;
}

/**
 * **Une liste ordonnée de cartes à photo** — la mécanique commune aux étapes
 * d'une procédure de livraison et aux notes d'un commercial (plan
 * `documentation/b2b/plan-notes-photo-du-commercial.md`, D8).
 *
 * Ce n'est pas un agrégat : elle n'a pas d'identité. C'est la part d'invariant
 * que les deux agrégats partagent, et qu'ils portent en champ privé en gardant
 * chacun son vocabulaire public.
 *
 * Trois règles peuvent refuser : la borne, une carte inconnue, un ordre qui
 * n'est pas une permutation EXACTE. Cette dernière est la raison d'être de la
 * liste : un ordre envoyé depuis un écran périmé ne se complète pas en devinant.
 *
 * Elle ne connaît pas le stockage objet : elle porte des **clés**. Chaque geste
 * qui rend une photo orpheline rend son ancienne clé, et c'est la séquence
 * applicative qui la supprime — après la transaction, jamais avant.
 */
export class PhotoCardList<C extends PhotoCardText> {
  private constructor(
    private readonly rules: PhotoCardListRules,
    private cards: MutableCard<C>[],
  ) {}

  /** Une liste vide. */
  static empty<C extends PhotoCardText>(rules: PhotoCardListRules): PhotoCardList<C> {
    return new PhotoCardList<C>(rules, []);
  }

  /**
   * Une liste relue, dans l'ordre donné.
   *
   * ⚠️ La borne n'est PAS revérifiée ici : une ligne en trop écrite hors du
   * domaine rendrait l'agrégat illisible, et la procédure de livraison ne l'a
   * jamais refusée à la relecture — le faire serait un changement observable.
   */
  static of<C extends PhotoCardText>(
    rules: PhotoCardListRules,
    cards: readonly PhotoCard<C>[],
  ): PhotoCardList<C> {
    return new PhotoCardList<C>(
      rules,
      cards.map((card) => ({ ...card })),
    );
  }

  get size(): number {
    return this.cards.length;
  }

  /**
   * Ajoute une carte du côté que l'usage a choisi.
   *
   * @throws la fabrique `full` — la liste a déjà son maximum.
   */
  add(cardId: string, content: C, photoKey: string | null): void {
    if (this.cards.length >= this.rules.max) {
      throw this.rules.refusals.full(this.rules.max);
    }
    const card = { id: cardId, content, photoKey };
    if (this.rules.insertAt === "start") {
      this.cards.unshift(card);
    } else {
      this.cards.push(card);
    }
  }

  /** Nouveau contenu ; la photo se change à part. @throws la fabrique `cardNotFound`. */
  revise(cardId: string, content: C): void {
    this.require(cardId).content = content;
  }

  /** Pose une photo et rend la clé remplacée (`null` sans photo). @throws `cardNotFound`. */
  attachPhoto(cardId: string, photoKey: string): string | null {
    const card = this.require(cardId);
    const previous = card.photoKey;
    card.photoKey = photoKey;
    return previous;
  }

  /** Retire la photo et rend sa clé (`null` sans photo). @throws `cardNotFound`. */
  detachPhoto(cardId: string): string | null {
    const card = this.require(cardId);
    const previous = card.photoKey;
    card.photoKey = null;
    return previous;
  }

  /**
   * Retire **définitivement** la carte et rend la clé de sa photo, pour qu'elle
   * parte du stockage avec elle. Chaque usage écrit, au-dessus de sa propre
   * méthode, pourquoi il fait exception à « pas de DELETE physique ».
   *
   * @throws la fabrique `cardNotFound`.
   */
  remove(cardId: string): string | null {
    const card = this.require(cardId);
    this.cards = this.cards.filter((candidate) => candidate.id !== cardId);
    return card.photoKey;
  }

  /**
   * Range les cartes dans l'ordre donné. La liste doit nommer **chaque** carte
   * présente, **une** fois ; sinon rien ne bouge.
   *
   * @throws la fabrique `orderStale` — carte manquante, en trop, répétée ou inconnue.
   */
  reorder(cardIds: readonly string[]): void {
    const byId = new Map(this.cards.map((card) => [card.id, card]));
    const unique = new Set(cardIds);
    if (cardIds.length !== this.cards.length || unique.size !== cardIds.length) {
      throw this.rules.refusals.orderStale();
    }
    const ordered: MutableCard<C>[] = [];
    for (const cardId of cardIds) {
      const card = byId.get(cardId);
      if (card === undefined) {
        throw this.rules.refusals.orderStale();
      }
      ordered.push(card);
    }
    this.cards = ordered;
  }

  /** Les cartes dans l'ordre, en copies : les muter ne touche pas la liste. */
  snapshot(): readonly PhotoCard<C>[] {
    return this.cards.map((card) => ({ ...card }));
  }

  private require(cardId: string): MutableCard<C> {
    const card = this.cards.find((candidate) => candidate.id === cardId);
    if (card === undefined) {
      throw this.rules.refusals.cardNotFound(cardId);
    }
    return card;
  }
}
