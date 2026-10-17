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
}
