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
  /**
   * L'écran **à un instant donné**, aujourd'hui par défaut.
   *
   * Daté parce que tout ce qu'il montre l'est déjà : les fenêtres de validité,
   * les suspensions, les archivages. Ce que la lecture datée rend est donc
   * « quelles décisions étaient en vigueur ce jour-là », pas « quel prix a été
   * facturé » — cette question-là a sa réponse ailleurs, exacte : la trace figée
   * sur la ligne de commande. Le tarif canonique, lui, vient du PIM au présent.
   */
  abstract read(at?: Date): Promise<PricingBoardView>;

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
