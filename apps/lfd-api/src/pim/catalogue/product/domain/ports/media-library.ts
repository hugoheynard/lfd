/** Ce qu'on a constaté d'un visuel qu'on héberge. `null` ⇒ URL externe. */
export interface MediaFacts {
  readonly storageKey: string | null;
  readonly contentType: string | null;
  readonly width: number | null;
  readonly height: number | null;
  readonly bytes: number | null;
}

/** Une entrée de la bibliothèque, telle qu'elle sort d'un dépôt. */
export interface RegisteredMedia extends MediaFacts {
  readonly id: string;
  readonly url: string;
}

/**
 * La bibliothèque de visuels — les fichiers, indépendamment des produits.
 *
 * Un visuel existe avant d'être attaché : on le dépose, puis on décide où il
 * sert. C'est ce que le modèle disait déjà (`MediaAsset` est une table à part,
 * reliée par `ProductMedia`) et que le code ne faisait pas — les visuels
 * n'apparaissaient qu'au moment de sauver une fiche.
 */
export abstract class MediaLibrary {
  /** Inscrit un visuel déposé. Sa `url` est celle du bucket public. */
  abstract register(entry: Omit<RegisteredMedia, "id">): Promise<RegisteredMedia>;

  /**
   * Retrouve ce qu'on sait d'une URL, ou `null`.
   *
   * Sert au rattachement : les faits techniques sont **relus ici** plutôt que
   * renvoyés par le navigateur. Une largeur qui a fait l'aller-retour par un
   * écran est une largeur que le client peut choisir — et on n'a aucune raison
   * de la lui demander, puisqu'on l'a mesurée nous-mêmes au dépôt.
   */
  abstract factsFor(url: string): Promise<MediaFacts | null>;
}
