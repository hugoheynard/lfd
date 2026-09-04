import { z } from "zod";

import { cartAdjustmentSchema } from "./cart-adjustment.js";

/**
 * **La surtaxe de commande tardive** — ce qu'une dérogation coûte.
 *
 * Un ajustement de panier, de la même forme que la remise d'un point de retrait
 * et le frais d'une zone : ce n'est **pas** un prix d'article, et ça n'entre pas
 * dans les étages tarifaires. Ceux-ci répondent à « ce que cet article vaut pour
 * ce client » ; la surtaxe à « comment cette commande a été passée ».
 *
 * Une seule valeur pour toute la maison : le coût couvert est la reprise d'une
 * production close, et il ne dépend ni du client ni du comptoir.
 */
export const orderLateFeePayloadSchema = z.object({
  fee: cartAdjustmentSchema,
  /**
   * Le taux appliqué, en %, **choisi** parmi ceux du référentiel — jamais
   * deviné.
   *
   * Sans valeur par défaut, et c'est délibéré : personne ne sait encore si une
   * majoration pour retard suit les marchandises ou la prestation. Inventer 20 %
   * ou 5,5 % facturerait un taux que personne n'a décidé, sur toutes les
   * commandes tardives et **rétroactivement**.
   */
  vatRatePercent: z.number().min(0).max(100),
});
export type OrderLateFeePayload = z.infer<typeof orderLateFeePayloadSchema>;

/**
 * Le réglage relu, ou `null` — **aucune surtaxe**.
 *
 * `null` est un état valable, pas un trou : la maison peut vouloir rattraper une
 * commande tardive sans la facturer.
 */
export type OrderLateFeeView = OrderLateFeePayload | null;

/**
 * **La surtaxe telle qu'une commande la porte** — l'ajustement qui l'a produite
 * et le taux qui l'a taxée, figés le jour de la passation.
 *
 * Le taux voyage AVEC le montant, et ce n'est pas de la redondance : il ne se
 * recalcule pas. Le réglage aura changé, et rien sur la commande ne permettrait
 * alors de dire à quel taux elle a été facturée — ce qui est précisément la
 * question qu'un comptable pose six mois plus tard.
 *
 * Un `type` et non une `interface` : une interface n'a pas de signature d'index
 * implicite, donc TypeScript refuse de la ranger dans un `jsonb` sans cast — et
 * le cast ferait taire le seul mécanisme qui vérifie qu'on y range du
 * sérialisable.
 */
export const lateFeeAdjustmentSchema = z.object({
  adjustment: cartAdjustmentSchema,
  vatRatePercent: z.number().min(0).max(100),
});
export type LateFeeAdjustment = z.infer<typeof lateFeeAdjustmentSchema>;
