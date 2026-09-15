/**
 * **Les valeurs que la boutique lit au démarrage**, sans zod — l'entrée
 * `@lfd/contracts/shop-values`.
 *
 * 🔴 Le 2026-09-15, le déploiement de la boutique a échoué sur son budget
 * `cloudflare` (1,52 Mo pour 1,30 Mo) : cinq modules chargés au démarrage
 * prenaient ces valeurs au baril du paquet, qui embarque zod et tous les
 * schémas (354 Ko de zod dans le bundle initial, mesuré dans les stats esbuild).
 *
 * Chaque module réexporté ici n'importe ni zod ni un module qui l'importe — que
 * des types. Ajouter une ligne qui viole ça ramène le baril au démarrage, et le
 * budget le dira au déploiement, pas avant.
 */
export { audienceOf, type CustomerAudience } from "./customer-audience.js";
export {
  DEFAULT_DELIVERY_AVAILABILITY,
  DELIVERY_CLOSED_FOR_AUDIENCE,
  deliveryOpenTo,
  type DeliveryAvailabilityView,
  type PublicDeliveryAvailabilityView,
} from "./delivery-availability.values.js";
export { ALL_DISCOUNT_AUDIENCES } from "./pickup-discount-audiences.js";
export { PERSONAL_WORKSPACE, WORKSPACE_HEADER } from "./workspace.js";
