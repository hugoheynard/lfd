import { z } from "zod";

/**
 * **La nature « maison » d'un payeur** — un de nos restaurants, enregistré
 * comme client (`documentation/comptabilite/facturation/restaurants-maison.md`)
 * . Lue sous `b2b_companies:read` (`GET
 * /admin/companies/:companyId/in-house`), posée sous `b2b_in_house_payers:write`
 * (`PUT`, clé d'intention obligatoire).
 *
 * Le schéma ne tient que la FORME. Ce qui refuse le geste — un organisme
 * public, un suivi de facturation entre deux comptes de natures différentes —
 * se juge au serveur.
 */
export const inHousePayerPayloadSchema = z.object({
  /** `true` : marquer « maison » ; `false` : retirer la nature. */
  inHouse: z.boolean("maison : vrai ou faux"),
});
export type InHousePayerPayload = z.infer<typeof inHousePayerPayloadSchema>;

/** Ce que la fiche client montre de la nature « maison ». */
export interface InHousePayerView {
  readonly companyId: string;
  readonly inHouse: boolean;
  /** L'instant du marquage, ISO 8601 ; `null` quand le payeur n'est pas maison. */
  readonly declaredAt: string | null;
}
