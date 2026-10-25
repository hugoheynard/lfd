import { z } from "zod";

import { weekdaySchema } from "../address.js";
import {
  CUSTOMER_CANCELLATION_REASON_CODES,
  CUSTOMER_CANCELLATION_STAGES,
} from "../customer-cancellation.values.js";
import { ORDER_REVISION_CHANGES } from "../order-revision.values.js";
import { WINDOW_MODES } from "../delivery-availability.values.js";
import { DELIVERY_BIN_FACTS } from "./delivery-bins.js";
import { SITE_TABLE_FACTS } from "./site-tables.js";
import { DELIVERY_LOADING_FACTS } from "./delivery-loading.js";
import { DELIVERY_PURCHASE_LIBRARY_FACTS } from "./delivery-purchase-library.js";
import { DELIVERY_ROUND_FACTS } from "./delivery-rounds.js";
import { DELIVERY_TRANSFER_FACTS } from "./delivery-transfers.js";
import { DELIVERY_ROUTING_FACTS } from "./delivery-routing.js";
import { HANDOVER_PROOF_FACTS } from "./handover-proofs.js";
import { ORDER_CHANGE_REQUEST_FACTS } from "./order-change-requests.js";
import { ORDER_REFUND_FACTS } from "./order-refunds.js";
import { ORDER_SHORTFALL_FACTS } from "./order-shortfalls.js";
import { AFTER_CLOSE_WITHDRAWAL_FACTS } from "./after-close-withdrawals.js";
import { AFTER_CLOSE_REVISION_FACTS } from "./after-close-revisions.js";
import { PACKING_CONTAINER_FACTS } from "./packing-containers.js";
import { PACKING_RESERVE_FACTS } from "./packing-reserve.js";
import { PRODUCTION_SETTINGS_FACTS } from "./production-settings.js";
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
 * (`order_late_fee.*`, `order_delivery_vat.*`, `delivery_availability.updated`,
 * `order_opening.updated`, `order_cutoff_settings.updated`), dont le sujet n'a pas
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
    /** `null` depuis le 2026-10-14 : un véhicule peut entrer sans plaque. */
    plate: z.string().min(1).nullable(),
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
  /** Les passages de roue (G4) — absents des faits écrits avant le 2026-09-30. */
  wheelArches: payload({
    lengthCm: z.number().int(),
    protrusionCm: z.number().int(),
    fromBackCm: z.number().int(),
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
  /** Les zones autorisées (identifiants), vide = partout — absentes avant le 2026-10-06. */
  allowedZoneIds: z.array(z.string()).optional(),
});

/** Un geste sur un véhicule : son nom en libellé, et sa plaque. */
const vehicleFact = () =>
  payload({
    subjectLabel: subjectLabel(),
    plate: z.string().min(1).nullable(),
    ...vehicleLoadSpace(),
  });

/** Un point de retrait, et la remise qu'on y consent — avant le lot B. */
const pickupPointBeforeLabel = () =>
  payload({
    label: z.string(),
    ville: z.string(),
    codePostal: z.string(),
    discount: percentOrAmount().nullable(),
    discountAudiences: payload({ b2b: z.boolean(), b2c: z.boolean() }),
  });

/** Un point de retrait et sa remise commune, avant les remises par clientèle (2026-10-22). */
const pickupPointBeforeAudienceDiscounts = () =>
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
 * La remise d'une clientèle, telle que le journal la relit : la réduction, le
 * mode de portée et le NOMBRE de règles — leurs identifiants sont opaques, ils
 * ne se relisent pas.
 */
const audienceDiscount = () =>
  payload({
    discount: percentOrAmount(),
    scope: z.enum(["all_except", "only"]),
    categoryRules: count(),
    productRules: count(),
  });

/**
 * Un point de retrait, et la remise qu'on y consent à chaque clientèle (plan
 * `plan-remise-retrait-par-clientele-et-exclusions.md`, 2026-10-22).
 */
const pickupPoint = () =>
  payload({
    /** Le nom du point — le même que `label`, sous la clé que lit tout le journal. */
    subjectLabel: subjectLabel(),
    label: z.string(),
    ville: z.string(),
    codePostal: z.string(),
    /** `null` : la clientèle ne reçoit aucune remise au retrait. */
    discounts: payload({ b2b: audienceDiscount().nullable(), b2c: audienceDiscount().nullable() }),
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

/** Un mode de TVA du port, tel que la colonne le porte (`DELIVERY_VAT_MODES`). */
const deliveryVatMode = () => z.enum(["standard", "follows_goods"]);

const containerRule = () =>
  payload({ unitsPerContainer: count(), singular: z.string(), plural: z.string() });

/**
 * `windowMode` facultatif : les faits écrits avant le 2026-10-03 (CA-D2) ne le
 * portent pas, et un fait passé ne se réécrit pas.
 */
const windowModeOfFact = () => z.enum(WINDOW_MODES).optional();
/**
 * Une marge de production, en minutes (plan production par vagues, V0) :
 * `null` = non réglée. Facultative : les faits écrits avant le 2026-10-04 ne
 * la portent pas.
 */
const marginOfFact = () => z.number().int().nonnegative().nullable().optional();
const openings = () =>
  payload({
    openToB2b: z.boolean(),
    openToB2c: z.boolean(),
    windowMode: windowModeOfFact(),
    deliveryMarginMinutes: marginOfFact(),
    pickupMarginMinutes: marginOfFact(),
  });

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
    via: z.enum(["scan", "manual", "deposit"]),
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
   * de carte (plan `documentation/commandes/reglement/architecture-abandon-du-reglement.md`, D1).
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
  /**
   * L'équipe a **annulé** la commande (doc
   * `documentation/commandes/annulation/annulation-par-le-staff.md`, C3.5, 2026-10-12).
   * Le sujet est le client ; `cancelledBy` la fiche staff qui a annulé, sous
   * son nom du moment ; `reason` le motif saisi (jamais montré au client) ;
   * `regime` ce qui était dû — `free` (total nul), `due` (carte non payée,
   * fermée chez Stripe) ou `account` (au compte, ni facturée ni prélevée,
   * lot C5 — valeur écrite en base : elle ne se renomme que par migration) ; `voucher` ce que l'annulation a fait du bon de
   * fidélité (lot C3b) — rendu, refondu avec son reliquat, ou échu —, `null`
   * sans bon. Montants en centimes HT, l'unité du bon ; `expiresAt` sa date
   * limite d'origine. Remplace le booléen `voucherReturned` de C3, jamais servi
   * en production. Lot C4 : `regime` gagne `paid` (payée par carte — valeur
   * irréversible), et `refund` dit ce que l'annulation a promis de rendre sur
   * la carte (centimes TTC), `null` hors `paid` ou reste nul ; absent des faits
   * d'avant C4.
   *
   * Lot C6 (C6.6) : le CLIENT peut annuler. `cancelledBy` est alors `null`, et
   * `cancelledByKind` (`customer` | `guest`) et `cancelledByCustomer` (le client,
   * sous son nom du moment) disent qui ; `reason` peut être `null` (motif
   * facultatif), `reasonCode` est le motif choisi dans la liste, `policy` le
   * délai appliqué à un particulier. Les quatre clés sont ABSENTES d'une
   * annulation staff, d'avant comme d'après C6.
   *
   * Lot C1 des sous-comptes (`plan-commandes-des-sites.md`, §7.9,
   * 2026-10-21) : `cancelledFromPrincipal` — le compte principal (son
   * enseigne du moment) dont le client qui a annulé la commande d'un SITE est
   * membre, sans l'être du site. ABSENT sinon, et de tout fait d'avant.
   *
   * Plan A1 (lot A1.3, 2026-10-25) : `afterInscription` — la commande était
   * déjà inscrite au compte à produire, et les ateliers l'ont retirée ;
   * `stageApplied` — jusqu'où l'annulation pouvait aller (`production_plan`
   * ou `ready`, la valeur du réglage appliquée à cette commande). ABSENTS des
   * faits d'avant, qui se lisent `false` / `production_plan`.
   */
  "order.cancelled": fact(
    payload({
      subjectLabel: customerLabel(),
      orderId: ref("order"),
      orderNumber: z.string(),
      cancelledBy: namedOrBare("staff_user").nullable(),
      reason: z.string().nullable(),
      cancelledByKind: z.enum(["customer", "guest"]).optional(),
      cancelledByCustomer: namedOrBare("user").optional(),
      cancelledFromPrincipal: named("company").optional(),
      reasonCode: z.enum(CUSTOMER_CANCELLATION_REASON_CODES).nullable().optional(),
      policy: payload({ hoursBefore: count() }).nullable().optional(),
      regime: z.enum(["free", "due", "account", "paid"]),
      voucher: z
        .object({
          outcome: z.enum(["returned", "merged", "lapsed"]),
          voucherValueCents: cents(),
          remainderValueCents: cents().nullable(),
          expiresAt: instant(),
        })
        .nullable(),
      refund: z.object({ announcedCents: cents() }).nullable().optional(),
      afterInscription: z.boolean().optional(),
      stageApplied: z.enum(CUSTOMER_CANCELLATION_STAGES).optional(),
    }),
  ),
  /**
   * La commande a été **modifiée** avant son inscription au fournil (plan
   * `documentation/commandes/modification/plan-modifier-une-commande.md`, M1, 2026-10-23).
   * Le sujet est le client ; `revision` la révision devenue courante (`1` à la
   * première modification) ; `revisedBy` la fiche staff qui a modifié, sous
   * son nom du moment, ou `null` quand c'est le client — alors cité en
   * `revisedByCustomer` (ABSENT d'une modification par l'équipe) ; `changes`
   * ce qui a changé ; les deux totaux TTC, en centimes, disent l'écart. La
   * composition remplacée, elle, est dans l'historique de la commande.
   */
  "order.revised": fact(
    payload({
      subjectLabel: customerLabel(),
      orderId: ref("order"),
      orderNumber: z.string(),
      revision: count(),
      revisedBy: namedOrBare("staff_user").nullable(),
      revisedByCustomer: namedOrBare("user").optional(),
      changes: z.array(z.enum(ORDER_REVISION_CHANGES)),
      totalBeforeCents: cents(),
      totalAfterCents: cents(),
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
      /** QR scanné, saisie à la main, ou dépôt du livreur (AP-D8 : lu avant d'être écrit). */
      via: z.enum(["scan", "manual", "deposit"]),
    }),
    [orderHandedOverBeforeLabel()],
  ),

  "delivery_zone.created": fact(deliveryZone(), [deliveryZoneBeforeLabel()]),
  "delivery_zone.updated": fact(deliveryZone(), [deliveryZoneBeforeLabel()]),
  /** Le nom de la zone au moment où elle disparaît — le fait de création dit ce qu'elle facturait. */
  "delivery_zone.removed": fact(payload({ subjectLabel: subjectLabel() }), [empty()]),

  "pickup_address.created": fact(pickupPoint(), [
    pickupPointBeforeAudienceDiscounts(),
    pickupPointBeforeLabel(),
  ]),
  "pickup_address.updated": fact(pickupPoint(), [
    pickupPointBeforeAudienceDiscounts(),
    pickupPointBeforeLabel(),
  ]),
  "pickup_address.removed": fact(payload({ subjectLabel: subjectLabel() }), [empty()]),
  "pickup_address.default_set": fact(payload({ subjectLabel: subjectLabel() }), [empty()]),
  /**
   * Le site archivé (lot S1 des sites, 2026-10-13) : il remplace la
   * suppression, qui n'a plus lieu. `removed` reste lisible pour l'historique.
   */
  "pickup_address.archived": fact(payload({ subjectLabel: subjectLabel() })),
  /** Les rôles du site, enregistrés en bloc : chacun change ce que la logistique fait. */
  "pickup_address.roles_set": fact(
    payload({
      subjectLabel: subjectLabel(),
      pickup: z.boolean(),
      supply: z.enum(["on_site", "transfer"]),
      deliveryDeparture: z.boolean(),
      transferMode: z.enum(["integrated", "dedicated"]),
      counterSetupMinutes: count(),
      /**
       * Le point GPS, saisi avec les rôles depuis le 2026-10-13 (Hugo).
       * Absent des faits écrits avant ce jour.
       */
      gps: z.object({ lat: z.number(), lng: z.number() }).nullable().optional(),
      /**
       * Les clientèles du retrait (Hugo, 2026-10-15). Absentes des faits
       * écrits avant ce jour : le retrait y était ouvert aux deux.
       */
      pickupForB2b: z.boolean().optional(),
      pickupForB2c: z.boolean().optional(),
      /** La salle (Hugo, 2026-10-17). Absente des faits écrits avant ce jour. */
      eatIn: z.boolean().optional(),
    }),
  ),
  /**
   * Les couleurs de la logistique, `#rrggbb` ou `null` = aucune. `removed`
   * nomme celles qui viennent d'être RETIRÉES (Hugo, 2026-10-13 : on peut
   * revenir à « pas de couleur ») ; absent des faits antérieurs.
   */
  "pickup_address.colors_set": fact(
    payload({
      subjectLabel: subjectLabel(),
      pickupColorB2b: z.string().nullable(),
      pickupColorB2c: z.string().nullable(),
      deliveryColorB2b: z.string().nullable(),
      deliveryColorB2c: z.string().nullable(),
      /** La teinte du réassort (Hugo, 2026-10-22) ; absente des faits antérieurs. */
      resupplyColor: z.string().nullable().optional(),
      removed: z
        .array(
          z.enum([
            "pickupColorB2b",
            "pickupColorB2c",
            "deliveryColorB2b",
            "deliveryColorB2c",
            "resupplyColor",
          ]),
        )
        .optional(),
    }),
  ),
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
  /**
   * **Le jour même** : l'état posé et celui qu'il remplace. Jusqu'au
   * 2026-10-21, la charge portait aussi l'interrupteur de l'heure limite
   * générale (`enabled`, lot O3, 2026-10-14) ; il est retiré
   * (`limites-de-commande/plan-une-seule-heure.md` §5), et les lignes écrites
   * avant gardent leur forme — l'historique ci-dessous.
   */
  "order_cutoff_settings.updated": fact(
    payload({
      sameDayAllowed: z.boolean(),
      resupplyCutoffTime: z.string(),
      previous: payload({ sameDayAllowed: z.boolean(), resupplyCutoffTime: z.string() }),
    }),
    [
      // Le 2026-10-21, de la limite du réapprovisionnement (oui/non) à son
      // heure (lot R3a du réassort).
      payload({
        sameDayAllowed: z.boolean(),
        resupplySubjectToCutoff: z.boolean(),
        previous: payload({ sameDayAllowed: z.boolean(), resupplySubjectToCutoff: z.boolean() }),
      }),
      // Du 2026-10-21 (interrupteur retiré) à l'arrivée de la limite du
      // réapprovisionnement, le même jour.
      payload({
        sameDayAllowed: z.boolean(),
        previous: payload({ sameDayAllowed: z.boolean() }),
      }),
      payload({
        enabled: z.boolean(),
        sameDayAllowed: z.boolean(),
        previous: payload({ enabled: z.boolean(), sameDayAllowed: z.boolean() }),
      }),
    ],
  ),
  "order_cutoff_waiver.granted": fact(waiverDecision(), [waiverDecisionBeforeLabel()]),
  "order_cutoff_waiver.revoked": fact(waiverDecision(), [waiverDecisionBeforeLabel()]),
  "order_late_fee.set": fact(payload({ before: lateFee().nullable(), after: lateFee() })),
  "order_late_fee.cleared": fact(payload({ before: lateFee() })),
  /**
   * La TVA de la livraison (plan `architecture-tva-des-frais-de-port.md`, V2). `before`
   * est le mode qui S'APPLIQUAIT — `standard` sans réglage posé : le lecteur
   * fait ce repli, et c'est ce que la passation facturait.
   */
  "order_delivery_vat.mode_set": fact(
    payload({ before: deliveryVatMode(), after: deliveryVatMode() }),
  ),
  "delivery_availability.updated": fact(
    payload({
      openToB2b: z.boolean(),
      openToB2c: z.boolean(),
      windowMode: windowModeOfFact(),
      deliveryMarginMinutes: marginOfFact(),
      pickupMarginMinutes: marginOfFact(),
      previous: openings(),
    }),
  ),
  /**
   * **L'ouverture de la boutique à la commande** (2026-10-09) : l'état posé de
   * chaque clientèle et celui qu'il remplace — un geste ne bascule qu'une case,
   * et « fermée aux particuliers » ne se relit qu'avec l'avant.
   */
  "order_opening.updated": fact(
    payload({
      ordersOpenToB2b: z.boolean(),
      ordersOpenToB2c: z.boolean(),
      previous: payload({ ordersOpenToB2b: z.boolean(), ordersOpenToB2c: z.boolean() }),
    }),
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
  /** **Le transfert interne** (lot T1) — dans son propre fichier, même famille. */
  ...DELIVERY_TRANSFER_FACTS,
  /** **Le chargement** (lot 4) — dans son propre fichier, même famille. */
  ...DELIVERY_LOADING_FACTS,
  /** **Le calculateur de tournée** (lot 7) — dans son propre fichier, même famille. */
  ...DELIVERY_ROUTING_FACTS,
  /** **Les scénarios du simulateur** (lot 9) — dans son propre fichier, même famille. */
  ...DELIVERY_SIMULATION_FACTS,
  ...DELIVERY_BIN_FACTS,
  ...SITE_TABLE_FACTS,
  /** **La bibliothèque d'achat** (lot B1) — dans son propre fichier, même famille. */
  ...DELIVERY_PURCHASE_LIBRARY_FACTS,
  /** **Les pièces de remise effacées** (purge câblée, non planifiée) — même famille. */
  ...HANDOVER_PROOF_FACTS,
  /** **Les remboursements Stripe constatés** (lot R1) — même famille. */
  ...ORDER_REFUND_FACTS,
  ...ORDER_SHORTFALL_FACTS,
  /** **Retirée après l'arrêt du plan** (plan A1, lot A1.3) — même famille. */
  ...AFTER_CLOSE_WITHDRAWAL_FACTS,
  /** **Quantités changées après l'arrêt du plan** (plan A2) — même famille. */
  ...AFTER_CLOSE_REVISION_FACTS,
  /** **Les demandes de modification** après l'heure limite (plan de modification, M4). */
  ...ORDER_CHANGE_REQUEST_FACTS,
  ...PACKING_CONTAINER_FACTS,
  /** **Une sortie de réserve vers une boutique** (plan A1, lot A1.4). */
  ...PACKING_RESERVE_FACTS,
  /** **Les réglages du fournil** (arrêt du plan, jours fermés) — même famille. */
  ...PRODUCTION_SETTINGS_FACTS,

  /**
   * `absorbed` : les commandes que la journée a absorbées en se fermant. Le
   * libellé est la date de service, `AAAA-MM-JJ` — une journée n'a pas d'autre
   * nom, et c'est l'écran qui la dit en français.
   */
  /**
   * `automatic` : posé (à `true`) seulement quand le tour de l'arrêt
   * automatique a arrêté le plan (plan `production/arret-du-plan.md`, S7,
   * lot A2). L'auteur est alors le système, sans nom.
   */
  "production_day.closed": fact(dayFact().extend({ automatic: z.literal(true).optional() }), [
    dayFactBeforeLabel(),
  ]),
  "production_day.retaken": fact(dayFact(), [dayFactBeforeLabel()]),
  /** La réouverture (2026-10-14) : `absorbed` = commandes retirées du plan. */
  "production_day.reopened": fact(dayFact()),
  /**
   * Un réassort « au plus tôt » lancé par le fournil (R4a,
   * `reassort-boutiques/plan-au-plus-tot.md`) : son nom et son point, figés
   * au lancement. `openedPlan` : la journée n'était pas arrêtée, et ce
   * lancement l'a ouverte arrêtée avec ce seul réassort (Q5).
   */
  "production_day.resupply_launched": fact(
    payload({
      subjectLabel: subjectLabel(),
      serviceDay: day(),
      resupplyId: z.string().min(1),
      resupplyName: z.string().nullable(),
      siteLabel: z.string().nullable(),
      openedPlan: z.boolean(),
    }),
  ),
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
