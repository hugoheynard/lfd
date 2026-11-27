import { z } from "zod";

import { operationAudienceSchema, type OperationAudience } from "./operation.js";

/**
 * **Les options de commande** — « tranché » pour le pain
 * (`documentation/catalogue/plan-options-de-commande.md`, § 3.1).
 *
 * Un groupe (« Tranchage ») porte des choix ordonnés ; « sans » est implicite.
 * Un choix se propose à une clientèle : les pros, les particuliers, les deux
 * — le vocabulaire des opérations (`OPERATION_AUDIENCES`), sans le réassort :
 * un choix se propose à quelqu'un qui commande. Aucun prix.
 */

/**
 * Un choix tel que l'écran l'envoie. La clé est l'identité du choix dans le
 * groupe, celle que la commande gardera : elle ne change pas une fois posée.
 * Le référentiel en valide la forme (minuscules, chiffres, tirets).
 */
export const optionChoicePayloadSchema = z.object({
  key: z.string().min(1),
  label: z.string().min(1),
  audience: operationAudienceSchema,
});
export type OptionChoicePayload = z.infer<typeof optionChoicePayloadSchema>;

/**
 * Le groupe entier, d'un bloc (`POST` et `PUT /pim/option-groups`). `choices`
 * est la liste des choix EN SERVICE, dans l'ordre : un choix connu absent de
 * la liste s'archive, un choix archivé qui y revient est restauré.
 */
export const optionGroupPayloadSchema = z.object({
  name: z.string().min(1),
  choices: z.array(optionChoicePayloadSchema).min(1),
});
export type OptionGroupPayload = z.infer<typeof optionGroupPayloadSchema>;

/** Un choix tel que l'écran du référentiel le lit, archivés compris. */
export interface OptionChoiceView {
  readonly key: string;
  readonly label: string;
  readonly audience: OperationAudience;
  readonly archived: boolean;
}

/** Un groupe tel que l'écran du référentiel le lit. */
export interface OptionGroupView {
  readonly id: string;
  readonly name: string;
  readonly archived: boolean;
  /** Les choix en service d'abord, dans leur ordre ; les archivés ensuite. */
  readonly choices: readonly OptionChoiceView[];
  /** Combien de fiches l'activent — pour prévenir avant une archive. */
  readonly products: number;
}

/**
 * Activer un groupe sur une fiche (`PUT /pim/catalogue/products/:id/option-groups/:groupId`).
 * `variantIds: null` = toutes ses déclinaisons, celles qui viendront comprises.
 */
export const activateProductOptionGroupPayloadSchema = z.object({
  variantIds: z.array(z.string().min(1)).min(1).nullable(),
});
export type ActivateProductOptionGroupPayload = z.infer<
  typeof activateProductOptionGroupPayloadSchema
>;

/** Un groupe activé sur une fiche, tel que l'onglet de la fiche le lit. */
export interface ProductOptionGroupView {
  readonly groupId: string;
  readonly name: string;
  /** Archivé depuis l'activation : il ne se propose plus, l'activation reste. */
  readonly archived: boolean;
  /** `null` = toutes les déclinaisons. */
  readonly variantIds: readonly string[] | null;
}
