import { z } from "zod";

/**
 * **La TVA de la livraison d'une commande**, figée à sa passation
 * (`documentation/commandes/bon-et-pieces/architecture-tva-des-frais-de-port.md`).
 *
 * - `follows_goods` : le port est l'accessoire de la vente et suit le taux de
 *   ce qu'il transporte, au prorata de la base hors taxe de chaque taux — le
 *   mode de toute commande neuve (décidé par Hugo le 2026-11-19) ;
 * - `standard` : le port au taux normal (20 %), que portent encore les
 *   commandes passées avant cette règle.
 *
 * ⚠️ Ces deux valeurs sont **persistées** sur les commandes : les renommer est
 * une migration de données, pas un renommage.
 */
export const DELIVERY_VAT_MODES = ["standard", "follows_goods"] as const;
export const deliveryVatModeSchema = z.enum(DELIVERY_VAT_MODES);
export type DeliveryVatMode = z.infer<typeof deliveryVatModeSchema>;
