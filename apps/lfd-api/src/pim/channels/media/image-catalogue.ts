import type { LocalizedText } from "../../catalogue/shared/domain/value-objects/localized-text.js";

/** Une image de la bibliothèque, telle qu'un PORTEUR a besoin de la connaître. */
export interface CatalogueImage {
  readonly url: string;
  /** L'étiquette de bibliothèque ; `''` = personne ne l'a nommée. */
  readonly name: string;
  /** Une image, une description — écrite dans la médiathèque et nulle part ailleurs. */
  readonly alt: LocalizedText;
  readonly width: number | null;
  readonly height: number | null;
  readonly bytes: number | null;
  readonly contentType: string | null;
}

/**
 * **Ce que le référentiel a besoin de savoir des images qu'il affiche.**
 *
 * 🔴 Un PORT, et pas une lecture directe de la table. Le référentiel ne possède
 * pas la bibliothèque : les fiches en portent, les familles aussi, et les
 * contenus de la vitrine en porteront. `lint:prisma-model-ownership` le dira
 * bientôt en toutes lettres — « un modèle a UN propriétaire, et lui seul le
 * lit » —, mais ce n'est pas la porte qui commande ici : c'est que le
 * référentiel n'a aucune raison de connaître la forme d'une table qui ne lui
 * appartient pas.
 *
 * Déclaré ICI et implémenté ailleurs, comme `production/channels/commerce/` :
 * le bloc qui a besoin déclare, celui qui sait implémente, et
 * `appBootstrap` les relie. Un bloc qui publie un port ne doit pas connaître
 * ceux qui le branchent — sinon la dépendance revient par l'autre bout.
 *
 * ⚠️ **En lecture seule, et c'est le sujet.** Depuis le 2026-09-23, le
 * référentiel n'écrit plus rien dans la bibliothèque : ni étiquette, ni
 * alternative, ni inscription à la volée. Ajouter une écriture ici rendrait au
 * PIM la propriété qu'on vient de lui retirer.
 */
export abstract class ImageCatalogue {
  /**
   * Les images citées, indexées par URL. Une URL inconnue est **absente** de la
   * carte — jamais rendue vide : un porteur doit pouvoir distinguer « l'image
   * n'existe pas » de « elle n'a rien d'écrit ».
   */
  abstract describe(urls: readonly string[]): Promise<ReadonlyMap<string, CatalogueImage>>;

  /**
   * Cette URL est-elle dans la bibliothèque ?
   *
   * Sert au RATTACHEMENT : une fiche ne peut porter qu'une image déposée
   * (Hugo, 2026-09-23), et c'est cette question-là qui le tient.
   */
  abstract has(url: string): Promise<boolean>;

  /**
   * La **référence opaque** de cette image, ou `null` si elle n'existe pas.
   *
   * 🔴 Opaque veut dire : le porteur la RANGE, il ne l'interprète pas. C'est le
   * motif que le dépôt applique partout entre blocs — une `OrderLine` du B2B
   * porte un SKU du référentiel sans rien savoir de ses tables.
   *
   * ⚠️ Elle n'existe que le temps que `product_media.media_id` soit une colonne
   * OBLIGATOIRE et une clé primaire. La rendre facultative demande d'abord de
   * refondre la clé en `(porteur, url, rôle)` — c'est le déploiement ③, il est
   * IRRÉVERSIBLE, et il emporte avec lui le `ON DELETE RESTRICT` qui tient
   * aujourd'hui la règle « on ne supprime pas une image qu'un porteur
   * affiche ». Cette méthode disparaît avec la colonne.
   *
   * ➡️ Tant qu'elle est là, la clé étrangère protège encore, et c'est une bonne
   * raison de ne pas se presser.
   */
  abstract reference(url: string): Promise<string | null>;
}
