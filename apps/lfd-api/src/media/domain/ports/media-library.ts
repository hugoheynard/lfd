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

  /**
   * Les images **hébergées et anciennes** — celles qu'un ramassage pourrait
   * viser, sans rien savoir encore de qui les affiche.
   *
   * 🔴 La bibliothèque ne sait PAS si une image sert : les tables de
   * rattachement appartiennent aux porteurs, et `lint:prisma-model-ownership`
   * dit qu'un modèle n'est lu que par son propriétaire. Elle rend donc des
   * candidates au sens faible — « voici ce qui est chez nous depuis assez
   * longtemps » — et c'est le HANDLER qui interroge les porteurs.
   *
   * ⚠️ Ce port répondait autrefois « plus aucune fiche ne les porte », par un
   * `products: { none: {} }`. Cette phrase est devenue impossible à tenir le
   * jour où la clé étrangère est tombée : la relation n'existait plus, la
   * requête n'avait plus de sens, et elle aurait déclaré ORPHELIN tout le
   * fonds. La réécriture est venue avant la migration, pas après.
   *
   * @param limit plafond par passage : un premier ramassage sur un arriéré ne
   *   doit pas tourner une heure ni saturer R2 d'appels.
   */
  abstract findCandidates(
    before: Date,
    limit: number,
  ): Promise<readonly { readonly storageKey: string; readonly url: string }[]>;

  /**
   * Cette clé de stockage est-elle **encore** hors du délai de grâce ?
   *
   * Relue au dernier moment, avec le comptage des porteurs. Elle ne ferme pas
   * la fenêtre — rien ne peut la fermer sans verrou — mais la réduit de
   * plusieurs minutes à quelques millisecondes. Le pire cas restant est un
   * objet supprimé alors qu'il vient d'être rattaché ; l'adressage par contenu
   * le rend réparable en redéposant le même fichier.
   *
   * @returns l'URL de l'image si elle est encore hors délai, `null` sinon.
   */
  abstract stillOld(storageKey: string, before: Date): Promise<string | null>;

  /**
   * Oublie **toutes** les inscriptions portant cette clé.
   *
   * Appelé APRÈS la suppression de l'objet, jamais avant : l'ordre inverse
   * perdrait la seule trace de ce qu'il reste à supprimer, et l'octet
   * resterait dans le bucket sans que rien ne puisse le désigner. À l'endroit,
   * l'état intermédiaire — des lignes qui pointent un objet disparu, et qu'aucune
   * fiche ne porte — est inoffensif et se répare au passage suivant.
   *
   * @returns le nombre de lignes oubliées.
   */
  abstract forget(storageKey: string): Promise<number>;
}
