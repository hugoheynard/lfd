import type { PromotionsSource } from "../promotions-source.js";

/**
 * **La source du calcul des promotions**, lue en base (§ 13.5). Port étroit :
 * ses lecteurs — le chargeur des prix, les ajustements de panier — n'en
 * demandent pas plus.
 */
export abstract class PromotionsSourceReader {
  /** @throws {PromotionsSourceUnreadableError} la ligne manque ou est inconnue. */
  abstract current(): Promise<PromotionsSource>;
}
