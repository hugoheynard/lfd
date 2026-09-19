import { z } from "zod";

import { weekdaySchema } from "../address.js";
import {
  basisPoints,
  cents,
  clockTime,
  count,
  day,
  days,
  empty,
  fact,
  instant,
  minutes,
  payload,
  percent,
  ref,
  type JournalFactFamily,
} from "./fact.js";

/**
 * **Les commandes et la production** — la vie d'une commande, ce qui décide
 * où et quand elle part (zones, points de retrait, heures limites, dérogations,
 * ouverture de la livraison), et la journée du fournil.
 */

/** Une réduction ou un frais : en points de base, ou en centimes. */
const percentOrAmount = () =>
  z.union([payload({ bp: basisPoints() }), payload({ cents: cents() })]);

/** Le même, avec son mode explicite (`CartAdjustment`). */
const adjustment = () =>
  z.discriminatedUnion("mode", [
    payload({ mode: z.literal("percent"), bp: basisPoints() }),
    payload({ mode: z.literal("amount"), cents: cents() }),
  ]);

/** Un point de retrait, et la remise qu'on y consent. */
const pickupPoint = () =>
  payload({
    label: z.string(),
    ville: z.string(),
    codePostal: z.string(),
    /** `null` : aucune remise au retrait. */
    discount: percentOrAmount().nullable(),
    /** À quelle clientèle la remise s'applique. */
    discountAudiences: payload({ b2b: z.boolean(), b2c: z.boolean() }),
  });

/** Une zone de livraison et ses frais. */
const deliveryZone = () =>
  payload({
    label: z.string(),
    /** ⚠️ Un NOMBRE de préfixes postaux, pas la liste. */
    postalPrefixes: count(),
    fee: percentOrAmount(),
  });

/** Une heure limite de commande ; `null` = règle par défaut, ou tous les jours. */
const cutoffRule = () =>
  payload({
    pickupAddressId: ref("pickup_address").nullable(),
    weekday: weekdaySchema.nullable(),
    daysBefore: days(),
    time: clockTime(),
    graceMinutes: minutes(),
  });

const waiverDecision = () =>
  payload({ companyId: ref("company"), fulfillmentDate: day(), reason: z.string() });

const lateFee = () => payload({ fee: adjustment(), vatRatePercent: percent() });

const containerRule = () =>
  payload({ unitsPerContainer: count(), singular: z.string(), plural: z.string() });

const openings = () => payload({ openToB2b: z.boolean(), openToB2c: z.boolean() });

export const ORDERS_PRODUCTION_FACTS = {
  /** Le sujet est le client qui a passé la commande. */
  "order.placed": fact(
    payload({
      orderId: ref("order"),
      orderNumber: z.string(),
      companyId: ref("company").nullable(),
      /** Figés à la passation, absents quand l'annuaire n'a pas répondu. */
      clientName: z.string().optional(),
      clientLegalName: z.string().optional(),
      totalCents: cents(),
    }),
  ),
  "order.ready": fact(
    payload({
      orderId: ref("order"),
      orderNumber: z.string(),
      readyBy: ref("staff_user"),
      readyAt: instant(),
    }),
  ),
  "order.handed_over": fact(
    payload({
      orderId: ref("order"),
      orderNumber: z.string(),
      handedOverBy: ref("staff_user"),
      handedOverAt: instant(),
      /** QR scanné, ou saisie à la main. */
      via: z.enum(["scan", "manual"]),
    }),
  ),

  "delivery_zone.created": fact(deliveryZone()),
  "delivery_zone.updated": fact(deliveryZone()),
  "delivery_zone.removed": fact(empty()),

  "pickup_address.created": fact(pickupPoint()),
  "pickup_address.updated": fact(pickupPoint()),
  "pickup_address.removed": fact(empty()),
  "pickup_address.default_set": fact(empty()),
  "public_pickup_schedule.updated": fact(
    payload({
      label: z.string(),
      ruleCount: count(),
      closureCount: count(),
      configured: z.boolean(),
    }),
  ),

  "order_cutoff.created": fact(cutoffRule()),
  "order_cutoff.updated": fact(cutoffRule()),
  "order_cutoff.removed": fact(empty()),
  "order_cutoff_waiver.granted": fact(waiverDecision()),
  "order_cutoff_waiver.revoked": fact(waiverDecision()),
  "order_late_fee.set": fact(payload({ before: lateFee().nullable(), after: lateFee() })),
  "order_late_fee.cleared": fact(payload({ before: lateFee() })),
  "delivery_availability.updated": fact(
    payload({ openToB2b: z.boolean(), openToB2c: z.boolean(), previous: openings() }),
  ),

  /** `absorbed` : les commandes que la journée a absorbées en se fermant. */
  "production_day.closed": fact(payload({ serviceDay: day(), absorbed: count() })),
  "production_day.retaken": fact(payload({ serviceDay: day(), absorbed: count() })),
  "production_container.set": fact(
    payload({ before: containerRule().nullable(), after: containerRule() }),
  ),
  "production_container.removed": fact(payload({ before: containerRule() })),
} as const satisfies JournalFactFamily;
