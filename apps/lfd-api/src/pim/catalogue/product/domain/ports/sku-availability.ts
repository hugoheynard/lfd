import type { Sku } from "../value-objects/sku.value-object.js";

/**
 * Consultation du registre des références : « cette référence est-elle déjà prise ? ».
 *
 * Le générateur de référence en dépend sans connaître le registre, et les cas d'usage
 * l'obtiennent par le jeton {@link SKU_AVAILABILITY}. Elle ne garantit rien : seule la
 * clé primaire de `sku_registry` tranche une course (doc 06 §5).
 */
export interface SkuAvailability {
  isTaken(candidate: Sku): Promise<boolean>;
}

/** Jeton d'injection du port {@link SkuAvailability}, lié à son adaptateur par le module catalogue. */
export const SKU_AVAILABILITY = Symbol("SkuAvailability");
