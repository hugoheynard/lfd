import type { OutsideAnnexLabel } from "../../../allergens/domain/services/inco-projector.js";

/**
 * Le nom imprimé d'un allergène de la colonne « Autres » : le code GS1 suit le
 * libellé d'une entrée OFFICIELLE hors annexe — `official && incoCategory ===
 * null`, c'est-à-dire les entrées de « hors obligation UE » (AM0, décision de
 * Hugo) ; une entrée maison n'est jamais officielle, son code libre ne
 * s'affiche pas. Le tableur et le PDF le lisent ici.
 */
export function otherAllergenName(other: OutsideAnnexLabel): string {
  return other.official ? `${other.label} (${other.code})` : other.label;
}
