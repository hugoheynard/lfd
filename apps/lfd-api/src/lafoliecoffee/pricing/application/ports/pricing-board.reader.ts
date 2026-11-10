import type { PriceRuleView, PricingBoardView } from "@lfd/contracts";

/**
 * Port de lecture de **l'écran de tarification**.
 *
 * Il rend une vue déjà résolue — prix final compris. C'est délibéré : le calcul
 * du prix n'a pas à traverser le fil pour être refait dans un navigateur. Deux
 * implémentations du prix en donneraient deux, et celle qu'on regarderait le
 * moins finirait par diverger de celle qui facture.
 *
 * **Déclaré dans `application/` et non dans `domain/`**, et c'est le seul port de
 * ce contexte qui y vive. Il se contractualise en `PricingBoardView`, un type de
 * `@lfd/contracts` — donc du **fil**, donc du transport. Le laisser dans le
 * domaine y faisait entrer la forme d'un écran : le jour où la vue gagne une
 * colonne, c'est le domaine qui recompile. Les ports du domaine (règles,
 * planchers, barèmes, volumes) ne parlent, eux, que de types de domaine, et
 * cette frontière-là doit rester lisible d'un coup d'œil sur les imports.
 */
export abstract class PricingBoardReader {
  /**
   * L'écran **à un instant donné**, aujourd'hui par défaut, **sans la mesure des
   * ventes**.
   *
   * Daté parce que tout ce qu'il montre l'est déjà : les fenêtres de validité,
   * les suspensions, les archivages. Ce que la lecture datée rend est donc
   * « quelles décisions étaient en vigueur ce jour-là », pas « quel prix a été
   * facturé » — cette question-là a sa réponse ailleurs, exacte : la trace figée
   * sur la ligne de commande. Le tarif canonique, lui, vient du PIM au présent.
   *
   * Sans élasticité, et c'est le point : la comparaison de deux marqueurs lit
   * deux tableaux dont elle ne veut que les prix, et mesure elle-même les
   * volumes sur la fenêtre qui les sépare. Les enrichir ici lui ferait payer
   * quatre requêtes de ventes qu'elle jetterait aussitôt.
   */
  abstract read(at?: Date): Promise<PricingBoardView>;

  /**
   * Le même tableau, **avec le rapport prix/volume** — ce que l'écran affiche.
   *
   * Séparé de {@link read} plutôt que piloté par un booléen : un drapeau aurait
   * mis les deux appelants dans la même méthode, et le jour où l'un des deux
   * change de besoin, c'est l'autre qui casse.
   */
  abstract readForScreen(at?: Date): Promise<PricingBoardView>;

  /**
   * **Ce qu'on a rangé** — les règles archivées, de la plus récente à la plus
   * ancienne.
   *
   * Séparé de `read` parce que ce sont deux questions : « qu'est-ce qui
   * s'applique ? » et « qu'a-t-on retiré ? ». Les mêler alourdirait chaque nœud
   * du tableau pour un besoin qu'on a trois fois par an — et rendrait l'écran
   * ambigu là où il doit être net.
   */
  abstract archivedRules(): Promise<PriceRuleView[]>;
}
