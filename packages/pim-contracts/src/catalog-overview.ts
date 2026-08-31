import type { CatalogRevisionSummaryView } from "./catalog-revision.js";

/**
 * **Le catalogue vu comme un tout** — l'écran d'accueil du référentiel.
 *
 * La réponse existait, éclatée sur trois écrans : la liste des produits disait
 * les statuts, la publication disait les canaux, les révisions disaient
 * l'histoire. Personne ne tenait « où en est le catalogue ».
 *
 * Ce qu'il ne contient PAS, délibérément : le détail de ce qui manque à une
 * fiche pour être publiable. Cette règle vit dans l'écran de la fiche, et
 * l'agréger ici en ferait une seconde déclaration — la forme de dérive qui a
 * déjà coûté trois fois dans ce dépôt.
 */
export interface CatalogOverviewView {
  /** Fiches non archivées, tous statuts confondus. */
  readonly products: number;
  readonly published: number;
  readonly drafts: number;
  /** Fiches dont quelqu'un a déclaré le contenu juste. */
  readonly signed: number;
  /** Déclinaisons vendables — l'unité qu'un canal reçoit. */
  readonly articles: number;

  /** La dernière ancre posée. `null` = aucune. */
  readonly lastRevision: CatalogRevisionSummaryView | null;

  /**
   * Ce qui a bougé **depuis** cette ancre, sans en poser une nouvelle.
   *
   * `null` quand il n'y a aucune ancre — il n'y a alors rien à soustraire. Tout
   * à zéro veut dire que le catalogue n'a pas bougé, et c'est une réponse : elle
   * dit qu'une capture ne poserait rien.
   */
  readonly sinceLastRevision: {
    readonly added: number;
    readonly removed: number;
    readonly changed: number;
  } | null;
}

/**
 * Ce que le référentiel **peut faire sur ce déploiement** (`GET /pim/capabilities`).
 *
 * Une vue plain, sans schéma zod : c'est une réponse de lecture, servie depuis
 * la configuration. Rien n'entre par ce chemin.
 *
 * ⚠️ Ce n'est pas un droit. Un droit dit ce que LA PERSONNE peut faire ; ceci
 * dit ce que l'INSTALLATION offre. Les deux se composent, et les confondre
 * ferait chercher une permission manquante là où il n'en manque aucune.
 */
export interface PimCapabilitiesView {
  /** La publication du catalogue est-elle ouverte — pousser, et ancrer avant. */
  readonly publication: boolean;
}
