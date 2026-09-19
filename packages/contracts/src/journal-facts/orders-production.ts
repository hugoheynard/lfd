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
  named,
  namedOrBare,
  payload,
  percent,
  ref,
  subjectLabel,
  type JournalFactFamily,
} from "./fact.js";

/**
 * **Les commandes et la production** — la vie d'une commande, ce qui décide
 * où et quand elle part (zones, points de retrait, heures limites, dérogations,
 * ouverture de la livraison), et la journée du fournil.
 *
 * Lot B du plan des phrases (2026-09-19) : chaque objet cité l'est avec son
 * nom du moment (D5), chaque sujet qui a un nom le porte en `subjectLabel`
 * (D6). Les formes d'avant restent dans `history` : le journal ne se réécrit
 * pas.
 *
 * Sans `subjectLabel`, et c'est voulu : les **réglages uniques**
 * (`order_late_fee.*`, `delivery_availability.updated`), dont le sujet n'a pas
 * d'autre nom que son type ; les **heures limites** et les **dérogations**, qui
 * n'ont pas de nom du tout — une règle se dit par son contenu (point, jour,
 * heure), une dérogation par son client et sa journée, et les deux sont dans la
 * charge.
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

/** Un point de retrait, et la remise qu'on y consent — avant le lot B. */
const pickupPointBeforeLabel = () =>
  payload({
    label: z.string(),
    ville: z.string(),
    codePostal: z.string(),
    discount: percentOrAmount().nullable(),
    discountAudiences: payload({ b2b: z.boolean(), b2c: z.boolean() }),
  });

/** Un point de retrait, et la remise qu'on y consent. */
const pickupPoint = () =>
  payload({
    /** Le nom du point — le même que `label`, sous la clé que lit tout le journal. */
    subjectLabel: subjectLabel(),
    label: z.string(),
    ville: z.string(),
    codePostal: z.string(),
    /** `null` : aucune remise au retrait. */
    discount: percentOrAmount().nullable(),
    /** À quelle clientèle la remise s'applique. */
    discountAudiences: payload({ b2b: z.boolean(), b2c: z.boolean() }),
  });

/**
 * Une zone de livraison et ses frais, avant le lot B : `postalPrefixes` y est
 * un NOMBRE de préfixes, sous un nom de liste.
 */
const deliveryZoneBeforeLabel = () =>
  payload({ label: z.string(), postalPrefixes: count(), fee: percentOrAmount() });

/**
 * Une zone de livraison et ses frais. Le NOMBRE de préfixes, pas leur liste :
 * deux cents codes postaux ne se relisent pas, leur compte dit si la zone a
 * grossi.
 */
const deliveryZone = () =>
  payload({
    subjectLabel: subjectLabel(),
    label: z.string(),
    postalPrefixCount: count(),
    fee: percentOrAmount(),
  });

/** Une heure limite de commande, avant le lot B : le point par son seul id. */
const cutoffRuleBeforeLabel = () =>
  payload({
    pickupAddressId: ref("pickup_address").nullable(),
    weekday: weekdaySchema.nullable(),
    daysBefore: days(),
    time: clockTime(),
    graceMinutes: minutes(),
  });

/** Une heure limite de commande ; `null` = règle par défaut, ou tous les jours. */
const cutoffRule = () =>
  payload({
    pickupAddress: namedOrBare("pickup_address").nullable(),
    weekday: weekdaySchema.nullable(),
    daysBefore: days(),
    time: clockTime(),
    graceMinutes: minutes(),
  });

const waiverDecisionBeforeLabel = () =>
  payload({ companyId: ref("company"), fulfillmentDate: day(), reason: z.string() });

/** Pour qui, pour quel jour, et pourquoi — le client sous son nom du moment. */
const waiverDecision = () =>
  payload({ company: named("company"), fulfillmentDate: day(), reason: z.string() });

const lateFee = () => payload({ fee: adjustment(), vatRatePercent: percent() });

const containerRule = () =>
  payload({ unitsPerContainer: count(), singular: z.string(), plural: z.string() });

const openings = () => payload({ openToB2b: z.boolean(), openToB2c: z.boolean() });

/**
 * Le sujet d'une commande est la PERSONNE qui l'a passée (`subjectType:
 * "user"`) : son nom est le libellé de la ligne. Absent quand la fiche n'a ni
 * prénom ni nom — l'adresse ne le remplace pas, le journal ne porte aucune
 * coordonnée.
 */
const customerLabel = () => subjectLabel().optional();

const orderPlacedBeforeLabel = () =>
  payload({
    orderId: ref("order"),
    orderNumber: z.string(),
    companyId: ref("company").nullable(),
    clientName: z.string().optional(),
    clientLegalName: z.string().optional(),
    totalCents: cents(),
  });

const orderReadyBeforeLabel = () =>
  payload({
    orderId: ref("order"),
    orderNumber: z.string(),
    readyBy: ref("staff_user"),
    readyAt: instant(),
  });

const orderHandedOverBeforeLabel = () =>
  payload({
    orderId: ref("order"),
    orderNumber: z.string(),
    handedOverBy: ref("staff_user"),
    handedOverAt: instant(),
    via: z.enum(["scan", "manual"]),
  });

const containerFactsBeforeLabel = {
  set: () => payload({ before: containerRule().nullable(), after: containerRule() }),
  removed: () => payload({ before: containerRule() }),
};

const dayFactBeforeLabel = () => payload({ serviceDay: day(), absorbed: count() });

const dayFact = () =>
  payload({ subjectLabel: subjectLabel(), serviceDay: day(), absorbed: count() });

export const ORDERS_PRODUCTION_FACTS = {
  /** Le sujet est le client qui a passé la commande. */
  "order.placed": fact(
    payload({
      subjectLabel: customerLabel(),
      orderId: ref("order"),
      orderNumber: z.string(),
      companyId: ref("company").nullable(),
      /** Figés à la passation, absents quand l'annuaire n'a pas répondu. */
      clientName: z.string().optional(),
      clientLegalName: z.string().optional(),
      totalCents: cents(),
    }),
    [orderPlacedBeforeLabel()],
  ),
  "order.ready": fact(
    payload({
      subjectLabel: customerLabel(),
      orderId: ref("order"),
      orderNumber: z.string(),
      /** La fiche staff qui a scanné le colisage, sous son nom du moment. */
      readyBy: namedOrBare("staff_user"),
      readyAt: instant(),
    }),
    [orderReadyBeforeLabel()],
  ),
  "order.handed_over": fact(
    payload({
      subjectLabel: customerLabel(),
      orderId: ref("order"),
      orderNumber: z.string(),
      /** La fiche staff qui a remis, sous son nom du moment. */
      handedOverBy: namedOrBare("staff_user"),
      handedOverAt: instant(),
      /** QR scanné, ou saisie à la main. */
      via: z.enum(["scan", "manual"]),
    }),
    [orderHandedOverBeforeLabel()],
  ),

  "delivery_zone.created": fact(deliveryZone(), [deliveryZoneBeforeLabel()]),
  "delivery_zone.updated": fact(deliveryZone(), [deliveryZoneBeforeLabel()]),
  /** Le nom de la zone au moment où elle disparaît — le fait de création dit ce qu'elle facturait. */
  "delivery_zone.removed": fact(payload({ subjectLabel: subjectLabel() }), [empty()]),

  "pickup_address.created": fact(pickupPoint(), [pickupPointBeforeLabel()]),
  "pickup_address.updated": fact(pickupPoint(), [pickupPointBeforeLabel()]),
  "pickup_address.removed": fact(payload({ subjectLabel: subjectLabel() }), [empty()]),
  "pickup_address.default_set": fact(payload({ subjectLabel: subjectLabel() }), [empty()]),
  /** Le sujet est le point de retrait : `subjectLabel` et `label` disent son nom. */
  "public_pickup_schedule.updated": fact(
    payload({
      subjectLabel: subjectLabel(),
      label: z.string(),
      ruleCount: count(),
      closureCount: count(),
      configured: z.boolean(),
    }),
    [
      payload({
        label: z.string(),
        ruleCount: count(),
        closureCount: count(),
        configured: z.boolean(),
      }),
    ],
  ),

  "order_cutoff.created": fact(cutoffRule(), [cutoffRuleBeforeLabel()]),
  "order_cutoff.updated": fact(cutoffRule(), [cutoffRuleBeforeLabel()]),
  /** La règle effacée, telle qu'elle décidait — elle n'emportait que son id avant le 2026-09-19. */
  "order_cutoff.removed": fact(cutoffRule(), [empty()]),
  "order_cutoff_waiver.granted": fact(waiverDecision(), [waiverDecisionBeforeLabel()]),
  "order_cutoff_waiver.revoked": fact(waiverDecision(), [waiverDecisionBeforeLabel()]),
  "order_late_fee.set": fact(payload({ before: lateFee().nullable(), after: lateFee() })),
  "order_late_fee.cleared": fact(payload({ before: lateFee() })),
  "delivery_availability.updated": fact(
    payload({ openToB2b: z.boolean(), openToB2c: z.boolean(), previous: openings() }),
  ),

  /**
   * `absorbed` : les commandes que la journée a absorbées en se fermant. Le
   * libellé est la date de service, `AAAA-MM-JJ` — une journée n'a pas d'autre
   * nom, et c'est l'écran qui la dit en français.
   */
  "production_day.closed": fact(dayFact(), [dayFactBeforeLabel()]),
  "production_day.retaken": fact(dayFact(), [dayFactBeforeLabel()]),
  /**
   * Le libellé est le SKU : la production ne lit pas le référentiel, et aucun
   * port de son contexte ne nomme un article hors d'une commande. Le SKU est
   * le nom le plus lisible qu'elle connaisse.
   */
  "production_container.set": fact(
    payload({
      subjectLabel: subjectLabel(),
      before: containerRule().nullable(),
      after: containerRule(),
    }),
    [containerFactsBeforeLabel.set()],
  ),
  "production_container.removed": fact(
    payload({ subjectLabel: subjectLabel(), before: containerRule() }),
    [containerFactsBeforeLabel.removed()],
  ),
} as const satisfies JournalFactFamily;
