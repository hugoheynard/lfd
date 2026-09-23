import type { WriteTicket } from "../../../platform/journal/scoped-journal.js";
import type { LocalizedText } from "../../../pim/catalogue/shared/domain/value-objects/localized-text.js";
import type { FocalPoint } from "../value-objects/image.js";

/** Ce qu'on décide d'une image, par opposition à ce qu'on en a mesuré. */
export interface MediaDetails {
  /** L'étiquette de bibliothèque ; `''` = personne ne l'a nommée. */
  readonly name: string;
  /** Normalisés par le domaine avant d'arriver ici. */
  readonly tags: readonly string[];
  /**
   * Le texte alternatif, dans les langues où il est écrit.
   *
   * 🔴 Il vit ICI depuis le 2026-09-23, et nulle part ailleurs. Il se saisissait
   * depuis la fiche produit, et arrivait dans la bibliothèque parce que chaque
   * enregistrement y recréait une ligne. Une image, une description — corriger
   * une faute se fait une fois.
   */
  readonly alt: LocalizedText;
  /** `null` = personne ne s'est prononcé, jamais « au centre ». */
  readonly focal: FocalPoint | null;
}

/**
 * L'ÉCRITURE des décisions portées par une image.
 *
 * Port distinct de la lecture (`MediaLibraryReader`) et du dépôt
 * (`MediaLibrary`) : un consommateur ne dépend que de ce qu'il appelle.
 * L'écran de la médiathèque nomme et tague ; il ne ramasse pas d'orphelins.
 */
export abstract class MediaLibraryWriter {
  /*
   * 🔴 Les deux méthodes exigent un `WriteTicket`, qu'on ne peut obtenir qu'en
   * traçant ou en dérogeant explicitement. Écrire sans avoir rien affirmé
   * devient donc **inexprimable**, et non pas interdit par une relecture : la
   * même mécanique que les ports d'écriture du reste du référentiel.
   */
  /**
   * Écrit ce qu'on a décidé de CETTE image.
   *
   * 🔴 Clé = l'URL, et l'écriture vise **toutes** les inscriptions qui la
   * portent. La table des actifs est un journal de lignes — `replaceMedia` en
   * recrée une par visuel à chaque enregistrement de fiche — et l'URL, adressée
   * par contenu, est la seule identité qui traverse deux sauvegardes. Écrire
   * une seule ligne laisserait les autres dire le contraire, et la lecture
   * groupée en choisirait une au hasard de sa date.
   *
   * @returns `false` si aucune inscription ne porte cette URL — la route en
   *   fait un 404 plutôt qu'un succès silencieux.
   */
  abstract describe(url: string, details: MediaDetails, ticket: WriteTicket): Promise<boolean>;

  /**
   * Oublie **toutes** les inscriptions portant cette URL.
   *
   * Par l'URL et non par la clé de stockage : les deux sont équivalentes pour
   * ce qu'on héberge — la clé est le hachage du contenu et l'URL en dérive —
   * mais l'URL couvre AUSSI les visuels saisis à la main, qui n'ont pas de clé.
   * Une seule notion d'identité, celle qui vaut partout.
   *
   * ⚠️ Appelé **après** la suppression de l'objet, jamais avant : l'ordre
   * inverse perdrait la seule trace de ce qu'il reste à supprimer, et l'octet
   * resterait dans le bucket sans que rien ne puisse le désigner.
   *
   * @returns le nombre de lignes oubliées.
   */
  abstract discard(url: string, ticket: WriteTicket): Promise<number>;
}
