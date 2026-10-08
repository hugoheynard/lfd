import { z } from "zod";

/**
 * **La TVA de la livraison** — le réglage global du comptable (plan
 * `documentation/order/plan-tva-des-frais-de-port.md`, décision du 2026-09-21).
 *
 * - `standard` : le port est une prestation à part, au taux normal (20 %) ;
 * - `follows_goods` : le port est l'accessoire de la vente et suit le taux de
 *   ce qu'il transporte, au prorata de la base hors taxe de chaque taux.
 *
 * ⚠️ Ces deux valeurs sont **persistées** (réglage et commandes) : les renommer
 * est une migration de données, pas un renommage.
 */
export const DELIVERY_VAT_MODES = ["standard", "follows_goods"] as const;
export const deliveryVatModeSchema = z.enum(DELIVERY_VAT_MODES);
export type DeliveryVatMode = z.infer<typeof deliveryVatModeSchema>;

/** L'écriture du réglage : un mode, rien d'autre. */
export const orderDeliveryVatPayloadSchema = z.object({ mode: deliveryVatModeSchema });
export type OrderDeliveryVatPayload = z.infer<typeof orderDeliveryVatPayloadSchema>;

/**
 * Le réglage relu — **toujours** un mode : sans réglage posé, c'est `standard`,
 * ce que toute commande a fait jusque-là. `configured` dit si le comptable l'a
 * effectivement choisi, pour que l'écran ne présente pas un repli comme une
 * décision.
 */
export interface OrderDeliveryVatView {
  readonly mode: DeliveryVatMode;
  readonly configured: boolean;
}
