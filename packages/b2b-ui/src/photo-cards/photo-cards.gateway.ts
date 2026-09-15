/**
 * Ce qui se voit d'une carte photo : un titre, un texte, une photo facultative.
 *
 * `photoRevision` change quand la photo change, et seulement alors : c'est ce
 * qui distingue une image déjà montrée d'une nouvelle sous la même route.
 */
export interface PhotoCardView {
  readonly id: string;
  readonly title: string;
  readonly body: string;
  readonly photoRevision: string | null;
}

/** Les champs texte d'une carte, tels qu'ils partent. */
export interface PhotoCardFields {
  readonly title: string;
  readonly body: string;
}

/**
 * Ce qu'on fait de la photo d'une carte qu'on refait.
 *
 * Trois cas et non un `Blob | null` : `null` ne distinguerait pas « je n'y
 * touche pas » de « je la retire », et c'est exactement la confusion qui
 * effacerait une photo en corrigeant une faute de frappe dans le titre.
 */
export type PhotoCardPhotoChange =
  | { readonly kind: 'keep' }
  | { readonly kind: 'replace'; readonly photo: Blob }
  | { readonly kind: 'remove' };

/**
 * Une **liste ordonnée de cartes photo**, vue de l'écran, déjà liée à ce qui la
 * possède (une adresse, une société) : l'éditeur ne parle que de cartes.
 *
 * Classe abstraite plutôt qu'interface : elle sert de type ET, si une app le
 * veut, de jeton d'injection.
 *
 * Les méthodes **rejettent** en cas d'échec, avec :
 * - {@link PhotoCardsConflictError} quand la liste a changé sous l'écran —
 *   l'éditeur recharge ;
 * - {@link PhotoCardsWriteError} sinon, dont le `message` est **affichable**.
 */
export abstract class PhotoCardsGateway<C extends PhotoCardView = PhotoCardView> {
  /** Les cartes, dans l'ordre ; aucune rend une liste vide. */
  abstract load(): Promise<readonly C[]>;

  /** Ajoute une carte — du côté que le serveur a choisi ; rend son identifiant. */
  abstract add(fields: PhotoCardFields, photo: Blob | null): Promise<string>;

  /** Refait une carte : titre, texte, et ce qu'on fait de sa photo. */
  abstract revise(
    cardId: string,
    fields: PhotoCardFields,
    change: PhotoCardPhotoChange,
  ): Promise<void>;

  /** Supprime une carte **définitivement**, photo comprise. */
  abstract remove(cardId: string): Promise<void>;

  /** Pose le nouvel ordre : tous les identifiants, chacun une fois. */
  abstract reorder(cardIds: readonly string[]): Promise<void>;

  /** Les octets de la photo d'une carte, à la révision de la vue. */
  abstract photo(cardId: string, revision: string): Promise<Blob>;
}

/** La liste a changé entre la lecture et l'écriture : il faut la relire. */
export class PhotoCardsConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PhotoCardsConflictError';
  }
}

/** Une écriture refusée ou échouée ; `message` est sûr à afficher. */
export class PhotoCardsWriteError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PhotoCardsWriteError';
  }
}
