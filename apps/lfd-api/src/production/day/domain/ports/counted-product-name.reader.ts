import type { ServiceDay } from "../value-objects/service-day.value-object.js";

/**
 * **« Comment s'appelle ce produit au compte du jour ? »** — une ligne du
 * compte, par sa clé, sans relire la journée. Un port à part du dépôt (ISP) :
 * un libellé, jamais une décision.
 */
export abstract class CountedProductNameReader {
  /** `null` : ce SKU n'est pas au compte de cette journée. */
  abstract nameOf(day: ServiceDay, sku: string): Promise<string | null>;
}
