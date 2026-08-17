import type { PricingBoardView } from "@lfd/contracts";

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
}
