import type { AppError } from "../../../../platform/shared/errors/app-error.js";
import type { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import type { IdGenerator } from "../../../../platform/id/id-generator.js";
import type { DocumentStore } from "../../../../platform/storage/document-store.js";
import type { PhotoCardText } from "../domain/entities/photo-card-list.js";

/**
 * Ce qu'un usage branche sur la séquence d'écriture des cartes à photo.
 *
 * Coupé en morceaux étroits parce que chacun change pour une raison
 * différente : l'identité (une adresse vérifiée active, une société), les
 * agrégats (un dépôt), les gestes (le vocabulaire public de l'agrégat), les mots
 * des refus, et la façon de dire qu'une photo est restée au stockage.
 */

/** Les ports techniques : le stockage objet, les identifiants, la transaction. */
export interface PhotoCardPorts {
  readonly store: DocumentStore;
  readonly ids: IdGenerator;
  readonly uow: UnitOfWork;
}

/** Ce qui s'écrit dans la même transaction que les cartes — un fait tracé, ou rien. */
export type InTransaction = () => Promise<void>;

/**
 * Ce qui s'écrit dans la transaction d'un AJOUT, qui reçoit l'id de la carte
 * neuve : il n'est tiré qu'à l'intérieur de la séquence, et un fait qui nomme la
 * carte ajoutée doit le connaître avant le commit (les notes du commercial le
 * nomment, la procédure de livraison non). Un {@link InTransaction} s'y passe
 * tel quel.
 */
export type InTransactionForNewCard = (cardId: string) => Promise<void>;

/** Qui porte les cartes, et comment on le vérifie, le verrouille et range ses photos. */
export interface PhotoCardIdentity<T> {
  /** Refuse une cible absente ou close — AVANT tout geste de stockage. */
  readonly ensure: (target: T) => Promise<void>;
  /** Pose le verrou de la cible pour la transaction ambiante. */
  readonly lock: (target: T) => Promise<void>;
  /** La clé d'une photo ; `revision` est neuve à chaque dépôt. */
  readonly photoKey: (target: T, cardId: string, revision: string) => string;
}

/** Charger, ouvrir, enregistrer l'agrégat qui porte les cartes. */
export interface PhotoCardAggregates<T, A> {
  readonly load: (target: T) => Promise<A | null>;
  /** L'agrégat neuf d'une cible qui n'en a pas — il reçoit aussitôt sa première carte. */
  readonly open: (target: T, aggregateId: string) => A;
  readonly save: (aggregate: A) => Promise<void>;
}

/** Les méthodes métier de l'agrégat, sous leur nom à lui (`addStep`, `addNote`…). */
export interface PhotoCardGestures<A, C extends PhotoCardText> {
  readonly add: (aggregate: A, cardId: string, content: C, photoKey: string | null) => void;
  readonly revise: (aggregate: A, cardId: string, content: C) => void;
  readonly attachPhoto: (aggregate: A, cardId: string, photoKey: string) => string | null;
  readonly detachPhoto: (aggregate: A, cardId: string) => string | null;
  readonly remove: (aggregate: A, cardId: string) => string | null;
  readonly reorder: (aggregate: A, cardIds: readonly string[]) => void;
}

/** Les refus quand la cible n'a pas encore d'agrégat. */
export interface PhotoCardMissingRefusals {
  /** Réviser ou retirer une carte d'une cible sans cartes. */
  readonly cardNotFound: (cardId: string) => AppError;
  /** Réordonner les cartes d'une cible sans cartes. */
  readonly orderStale: () => AppError;
}

/** Pourquoi une photo devait partir du stockage. */
export type OrphanPhotoReason = "replaced_or_removed" | "card_removed" | "write_failed";

/** Dit qu'une photo n'a pas pu partir du stockage — sans faire échouer la requête. */
export interface OrphanPhotoLog {
  readonly remained: (reason: OrphanPhotoReason, key: string, trace: string | undefined) => void;
}

/** Tout ce qu'un usage branche, en un objet. */
export interface PhotoCardUsage<T, A, C extends PhotoCardText> {
  readonly identity: PhotoCardIdentity<T>;
  readonly aggregates: PhotoCardAggregates<T, A>;
  readonly gestures: PhotoCardGestures<A, C>;
  readonly missing: PhotoCardMissingRefusals;
  readonly orphans: OrphanPhotoLog;
}
