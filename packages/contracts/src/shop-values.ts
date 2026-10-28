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
  resolveWindowMode,
  WINDOW_MODES,
  type WindowMode,
  type DeliveryAvailabilityView,
  type PublicDeliveryAvailabilityView,
} from "./delivery-availability.values.js";
export {
  CUSTOMER_CANCEL_CODE_PREFIX,
  CUSTOMER_CANCELLATION_REASON_CODES,
  CUSTOMER_CANCELLATION_REASON_MAX_LENGTH,
  type CustomerCancellationMoney,
  type CustomerCancellationReasonCode,
  type CustomerCancellationRefusal,
  type GuestOrderCancellationView,
  type OrderCancellability,
} from "./customer-cancellation.values.js";
export {
  ORDER_REVISION_REFUSALS,
  type OrderRevisability,
  type OrderRevisionRefusal,
} from "./order-revision.values.js";
export { SALES_TERMS_OUTDATED, type AcceptedSalesTerms } from "./sales-terms-acceptance.values.js";
export {
  DEFAULT_ORDER_OPENING,
  ORDERS_CLOSED_FOR_AUDIENCE,
  SERVICE_DAY_BEFORE_FIRST_ORDERABLE_DAY,
  ordersOpenTo,
  type GuestOrderAdmissionView,
  type MyOrderAdmissionView,
  type OrderOpeningView,
  type PublicOrderOpeningView,
} from "./order-opening.values.js";
export {
  CONTACT_BOUNDS,
  CONTACT_CARD_DEFAULTS,
  type ContactCardFallback,
  DEFAULT_CONTACT_SETTINGS,
  type ContactCardText,
  type ContactLocalizedText,
  type OrderChangeRequestStatusResponse,
  type OrderChangeRequestStatusView,
  type PublicContactPhoneView,
  type PublicContactSettingsView,
  type PublicRequestReasonView,
  REQUEST_PHOTO_BOUNDS,
} from "./contact.values.js";
export { ALL_DISCOUNT_AUDIENCES } from "./pickup-discount-audiences.js";
export {
  NO_PICKUP_DISCOUNTS,
  pickupDiscountCovers,
  pickupDiscountFor,
} from "./pickup-discount-scope.js";
export {
  PICKUP_CHOICE_REQUIRED,
  PICKUP_CLOSED_FOR_AUDIENCE,
  pickupOpenTo,
  preselectedPickupId,
} from "./pickup-audiences.values.js";
export { PERSONAL_WORKSPACE, WORKSPACE_HEADER } from "./workspace.js";
export { exposedHandoverToken, isSettled } from "./order-settlement.values.js";
export {
  MAX_AUDIENCE_EVENTS_PER_BATCH,
  type ProductAudienceBatchPayload,
  type ProductAudienceEvent,
  type ProductAudienceEventInput,
} from "./product-audience.values.js";
export type { ProductAudienceSource } from "./product-audience-sources.values.js";
