import {
  checkedAdmission,
  type PromotionAdmission,
} from "../../domain/entities/mercuriale-promotion-policy.js";
import { SelectedPromotionNotFoundError } from "../../domain/errors/mercuriale-promotion-policy-errors.js";
import type { PolicyPromotionNamesReader } from "../../domain/ports/policy-promotion-names.reader.js";

/**
 * **La politique de promotions reçue, vérifiée et nommée** — partagée par la
 * pose et l'avenant (`plan-la-mercuriale-decide.md`, § 8).
 *
 * Rend la politique canonique et la phrase que le journal fige : « Promotions :
 * aucune », « toutes », ou « au choix — « Rentrée », « Noël » ».
 *
 * @throws {InconsistentPromotionSelectionError} mode et liste qui ne vont pas ensemble.
 * @throws {SelectedPromotionNotFoundError} une promotion de la liste n'existe pas.
 */
export async function namedPolicy(
  names: PolicyPromotionNamesReader,
  policy: PromotionAdmission,
): Promise<{ readonly policy: PromotionAdmission; readonly phrase: string }> {
  const checked = checkedAdmission(policy);
  const known = await names.namesOf(checked.promotionIds);
  const missing = checked.promotionIds.filter((id) => !known.has(id));
  if (missing.length > 0) {
    throw new SelectedPromotionNotFoundError(missing);
  }
  return { policy: checked, phrase: describePolicy(checked, known) };
}

function describePolicy(policy: PromotionAdmission, names: ReadonlyMap<string, string>): string {
  switch (policy.mode) {
    case "none":
      return "promotions : aucune";
    case "all":
      return "promotions : toutes";
    case "selected":
      return `promotions : au choix — ${policy.promotionIds
        .map((id) => `« ${names.get(id) ?? id} »`)
        .join(", ")}`;
  }
}
