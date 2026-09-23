/**
 * Une image de la bibliothèque, **une seule fois**, quel qu'ait été son nombre
 * d'inscriptions.
 *
 * 🔴 Il n'y a pas d'identifiant ici, et ce n'est pas un oubli.
 * `replaceMedia` détache tout puis recrée un `MediaAsset` NEUF par visuel à
 * chaque enregistrement de section : un identifiant d'actif ne traverse pas
 * deux sauvegardes, et `media_asset` est en fait un journal de lignes. Ce qui
 * traverse, c'est l'URL — adressée par contenu (`products/{sha256}.{ext}`),
 * donc stable pour des octets donnés (vérifié le 2026-09-23).
 *
 * **L'identité d'une image est donc son URL**, et toute lecture de la
 * bibliothèque groupe par elle. Une requête ligne à ligne montrerait la même
 * image autant de fois qu'on a enregistré les fiches qui la portent.
 */
export interface LibraryMediaRecord {
  /** L'identité. Voir ci-dessus : ce n'est pas un raccourci. */
  readonly url: string;
  /** L'étiquette de la bibliothèque ; `''` = personne ne l'a nommée. */
  readonly name: string;
  /** Les mots par lesquels on la retrouve. Normalisés à l'écriture. */
  readonly tags: readonly string[];
  readonly storageKey: string | null;
  readonly contentType: string | null;
  readonly width: number | null;
  readonly height: number | null;
  readonly bytes: number | null;
  /** Le point gardé au centre quand le cadre n'a pas la forme de l'image. */
  readonly focal: { readonly x: number; readonly y: number } | null;
  /**
   * Combien de porteurs l'affichent — fiches et familles confondues.
   *
   * 🔴 C'est ce compte qui permet à l'écran de DIRE « cette image sert dans
   * trois fiches » avant de proposer de la supprimer. Les clés étrangères sont
   * en `ON DELETE RESTRICT` : sans ce compte, l'écran proposerait une
   * suppression que Postgres refuserait, et l'utilisateur apprendrait la règle
   * par un échec.
   */
  readonly uses: number;
  /** La PREMIÈRE inscription de ces octets — l'entrée dans la bibliothèque. */
  readonly depositedAt: Date;
}

/** Une page de la bibliothèque, et le total pour la pagination. */
export interface LibraryMediaPage {
  readonly items: readonly LibraryMediaRecord[];
  readonly total: number;
}

/**
 * La LECTURE de la bibliothèque de visuels.
 *
 * Un port à part de {@link MediaLibrary}, qui écrit : un consommateur ne dépend
 * que des méthodes qu'il appelle (ISP). L'écran de la médiathèque lit ; il n'a
 * rien à faire d'`isStillOrphan` ni de `forget`.
 *
 * Rangé sous `shared/` et non sous `product/` parce que **la bibliothèque
 * n'appartient à aucun référentiel** — les fiches en portent, les familles
 * aussi (`CategoryMedia`). C'est déjà ce que disent les value-objects de
 * `shared/domain/value-objects/media.ts` : « ni l'un ni l'autre ne possède la
 * bibliothèque ».
 */
export abstract class MediaLibraryReader {
  /**
   * Une page de la bibliothèque, de l'entrée la plus récente à la plus
   * ancienne.
   *
   * Par date de PREMIER dépôt, et non de dernière inscription : réenregistrer
   * une fiche recrée des lignes, et trier par elles ferait remonter en tête une
   * image déposée il y a six mois parce qu'on vient de sauver le produit qui la
   * porte.
   */
  abstract page(limit: number, offset: number): Promise<LibraryMediaPage>;
}
