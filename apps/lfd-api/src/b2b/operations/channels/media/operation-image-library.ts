/** Un point focal : deux fractions de 0 à 1, à partir du coin haut gauche. */
export interface LibraryFocal {
  readonly x: number;
  readonly y: number;
}

/** Une image du fonds, telle que l'opération a besoin de la connaître pour la montrer. */
export interface LibraryImage {
  /** L'identité de l'image : son adresse (`documentation/mediatheque/mediatheque.md` §2). */
  readonly url: string;
  /** La description française écrite à la médiathèque ; `''` = personne ne l'a écrite. */
  readonly alt: string;
  readonly width: number | null;
  readonly height: number | null;
  /** `null` : personne ne s'est prononcé — la boutique recadre au centre. */
  readonly focal: LibraryFocal | null;
}

/**
 * **« Décris-moi cette image »** — ce que les opérations du commerce demandent
 * à la médiathèque quand on leur choisit une image (plan
 * `documentation/operations-datees/plan-l-operation-passe-au-commerce.md`, O3,
 * lot 2).
 *
 * 🔴 Déclaré ICI et implémenté dans `appBootstrap/` : `b2b → media` est hors
 * de la matrice (CLAUDE.md §3), et ce plan ne la change pas. Même forme que
 * `pim/channels/media/image-catalogue.ts` : le bloc qui a besoin déclare,
 * la racine de composition relie.
 *
 * En lecture seule : l'opération choisit une image du fonds, elle n'en dépose
 * ni n'en décrit aucune.
 */
export abstract class OperationImageLibrary {
  /** L'image, ou `null` si le fonds ne la connaît pas — jamais une description vide. */
  abstract describe(url: string): Promise<LibraryImage | null>;

  /**
   * Plusieurs images d'un coup — pour les LECTURES (lot 3) : le texte
   * alternatif d'une opération est celui de la médiathèque, relu à chaque
   * affichage, et une boutique qui montre trois opérations ne fait qu'une
   * lecture. Une URL que le fonds ne connaît pas est ABSENTE de la table.
   */
  abstract describeMany(urls: readonly string[]): Promise<ReadonlyMap<string, LibraryImage>>;
}
