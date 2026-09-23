import type { FocalPoint } from "../value-objects/media.js";

/** Ce qu'on décide d'une image, par opposition à ce qu'on en a mesuré. */
export interface MediaDetails {
  /** L'étiquette de bibliothèque ; `''` = personne ne l'a nommée. */
  readonly name: string;
  /** Normalisés par le domaine avant d'arriver ici. */
  readonly tags: readonly string[];
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
  abstract describe(url: string, details: MediaDetails): Promise<boolean>;
}
