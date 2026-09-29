import { z } from "zod";

import { weekdaySchema } from "../address.js";
import { DELIVERY_BIN_FACTS } from "./delivery-bins.js";
import { DELIVERY_LOADING_FACTS } from "./delivery-loading.js";
import { DELIVERY_ROUND_FACTS } from "./delivery-rounds.js";
import { DELIVERY_ROUTING_FACTS } from "./delivery-routing.js";
import { DELIVERY_SIMULATION_FACTS } from "./delivery-simulation.js";
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

/** Une réduction ou un frais : en points de base, ou en centimes HT (`cartAdjustmentSchema`). */
const percentOrAmount = () =>
  z.union([payload({ bp: basisPoints() }), payload({ cents: cents() })]);

/** Le même, avec son mode explicite (`CartAdjustment`) : un montant fixe est en centimes HT. */
const adjustment = () =>
  z.discriminatedUnion("mode", [
    payload({ mode: z.literal("percent"), bp: basisPoints() }),
    payload({ mode: z.literal("amount"), cents: cents() }),
  ]);

/** Le nom et la plaque d'un véhicule de la flotte, tels qu'écrits. */
const vehicleIdentity = () =>
  payload({
    name: z.string().min(1),
    plate: z.string().min(1),
    ...vehicleLoadSpace(),
  });

/**
 * Le chargement d'un véhicule (lot 2 bis) : dimensions utiles en cm et caisse
 * réfrigérée, `null` si inconnues ou sec. OPTIONNELS : les faits écrits avant
 * le 2026-09-29 ne les portent pas.
 */
const vehicleLoadSpace = () => ({
  cargo: payload({
    lengthCm: z.number().int(),
    widthCm: z.number().int(),
    heightCm: z.number().int(),
  })
    .nullable()
    .optional(),
  refrigeration: payload({
    volumeLiters: z.number().int(),
    minTempC: z.number().int(),
    maxTempC: z.number().int(),
  })
    .nullable()
    .optional(),
  /** L'énergie (L2b-C6) — texte libre ici : le journal garde ce qui a été écrit. */
  energy: z.string().min(1).nullable().optional(),
});

/** Un geste sur un véhicule : son nom en libellé, et sa plaque. */
const vehicleFact = () =>
  payload({ subjectLabel: subjectLabel(), plate: z.string().min(1), ...vehicleLoadSpace() });

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

/**
 * Ce qu'un contrôle qualité juge : une ligne du compte (son SKU et la quantité
 * vue, D5), ou une commande colisée, citée avec sa référence du moment.
 */
const qualityTarget = () =>
  z.discriminatedUnion("kind", [
    payload({ kind: z.literal("line"), sku: z.string().min(1), quantitySeen: count() }),
    payload({ kind: z.literal("order"), order: named("order") }),
  ]);

/**
 * Le socle des trois faits du contrôle qualité : le libellé est le SKU d'une
 * ligne ou la référence d'une commande. ⚠️ Ni la note ni les photos n'y
 * entrent : elles ne se lisent qu'en `b2b_supervision:write` (plan
 * `documentation/production/plan-controle-qualite.md`, D3), et le journal a
 * d'autres lecteurs.
 */
const qualityFact = <S extends Record<string, z.ZodType>>(extra: S) =>
  payload({ subjectLabel: subjectLabel(), serviceDay: day(), target: qualityTarget(), ...extra });

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
  /**
   * Le client a **abandonné le règlement** de sa commande en quittant l'écran
   * de carte (plan `documentation/order/plan-abandon-du-reglement.md`, D1).
   * Le sujet est ce client, seul à pouvoir le faire (Q2). `cancelled` : la
   * commande d'un particulier est annulée ; `failed` : celle d'un pro garde
   * son statut, son seul règlement est tombé (D4).
   */
  "order.abandoned": fact(
    payload({
      subjectLabel: customerLabel(),
      orderId: ref("order"),
      orderNumber: z.string(),
      outcome: z.enum(["cancelled", "failed"]),
    }),
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
   * **La flotte** (2026-09-29, `plan-preparation-de-tournee.md`, lot 2). Le
   * libellé est le nom du véhicule au moment du geste ; la plaque est sa forme
   * normalisée. Un véhicule retiré sans trace de qui l'a retiré est une
   * question à laquelle personne ne pourra répondre le jour d'une tournée
   * manquée.
   */
  "delivery_vehicle.added": fact(vehicleFact()),
  "delivery_vehicle.corrected": fact(
    payload({ subjectLabel: subjectLabel(), before: vehicleIdentity(), after: vehicleIdentity() }),
  ),
  "delivery_vehicle.retired": fact(vehicleFact()),
  "delivery_vehicle.reactivated": fact(vehicleFact()),
  /**
   * **Le point de départ des tournées**, choisi parmi les points de retrait.
   * `previous` : le choix remplacé — nommé s'il est encore un point de retrait,
   * nu sinon (un point supprimé depuis n'a plus de nom à donner) ; `null` si
   * personne n'avait choisi.
   */
  "delivery_departure.chosen": fact(
    payload({
      subjectLabel: subjectLabel(),
      point: named("pickup_address"),
      previous: namedOrBare("pickup_address").nullable(),
    }),
  ),
  /** **La composition des tournées** (lot 3) — dans son propre fichier, même famille. */
  ...DELIVERY_ROUND_FACTS,
  /** **Le chargement** (lot 4) — dans son propre fichier, même famille. */
  ...DELIVERY_LOADING_FACTS,
  /** **Le calculateur de tournée** (lot 7) — dans son propre fichier, même famille. */
  ...DELIVERY_ROUTING_FACTS,
  /** **Les scénarios du simulateur** (lot 9) — dans son propre fichier, même famille. */
  ...DELIVERY_SIMULATION_FACTS,
  ...DELIVERY_BIN_FACTS,

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
  /**
   * Un verdict rendu par le superviseur (D9) — l'auteur est l'acteur de la
   * ligne. `photoCount` : combien de photos le documentent.
   */
  "production_quality.checked": fact(
    qualityFact({ verdict: z.enum(["ok", "warning", "blocking"]), photoCount: count() }),
  ),
  /**
   * Le verdict courant de la cible devient bloquant : la retenue au retrait
   * commence. `heldOrders` : les commandes retenues À CET INSTANT, sous leur
   * référence — pour une ligne, celles du plan qui portent le produit (D6) ; le
   * plan bouge au retirage, le journal garde ce qu'il était.
   */
  "production_quality.hold_raised": fact(qualityFact({ heldOrders: z.array(named("order")) })),
  /** Un nouveau verdict (OK ou réserve) lève le blocage de la cible. */
  "production_quality.hold_lifted": fact(qualityFact({ verdict: z.enum(["ok", "warning"]) })),
  "production_container.removed": fact(
    payload({ subjectLabel: subjectLabel(), before: containerRule() }),
    [containerFactsBeforeLabel.removed()],
  ),
} as const satisfies JournalFactFamily;
