import type { PriceRuleView, PricingBoardView } from "@lfd/contracts";

/**
 * Port de lecture de **l'écran de tarification**.
 *
 * Il rend une vue déjà résolue — prix final compris. C'est délibéré : le calcul
 * du prix n'a pas à traverser le fil pour être refait dans un navigateur. Deux
 * implémentations du prix en donneraient deux, et celle qu'on regarderait le
 * moins finirait par diverger de celle qui facture.
 */
export abstract class PricingBoardReader {
  abstract read(): Promise<PricingBoardView>;

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
