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
