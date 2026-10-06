import { z } from "zod";

import { WINDOW_MODES } from "./delivery-availability.values.js";

/**
 * Contrat de fil des **adresses** d'une entreprise B2B.
 *
 * Ces schémas sont la **source de vérité de la forme** échangée entre le backend
 * et les frontends : le backend les consomme pour valider à sa frontière (et
 * garantit le comportement en les faisant respecter), les frontends en dérivent
 * leurs types et peuvent valider les réponses. Aucune app ne possède ce contrat —
 * il vit dans ce package feuille, dépendu des deux côtés, comme `@lfd/storage`.
 *
 * On ne partage QUE le fil : ni les entités Prisma, ni les view-models d'affichage.
 */

/** Un jour de la semaine — clé stable, indépendante de la langue d'affichage. */
export const weekdaySchema = z.enum(["mon", "tue", "wed", "thu", "fri", "sat", "sun"]);
export type Weekday = z.infer<typeof weekdaySchema>;

const TIME_HHMM = /^([01]\d|2[0-3]):[0-5]\d$/u;

/**
 * Un créneau horaire préféré `début`→`fin` au format `HH:mm`. Le refine impose
 * l'invariant métier (`début < fin`) au niveau du contrat : c'est le backend qui
 * garantit, en refusant à sa frontière un créneau à l'envers.
 *
 * Il garde son début : une échéance préférée ne s'y range pas, elle a sa liste
 * ({@link preferredDeadlinesSchema}, `DeliverySpecs.deadlines`) — une adresse en
 * reçoit parfois plusieurs par jour (Hugo, 2026-10-03), un créneau n'en porte
 * qu'une.
 */
export const deliverySlotSchema = z
  .object({
    start: z.string().regex(TIME_HHMM, "heure attendue au format HH:mm"),
    end: z.string().regex(TIME_HHMM, "heure attendue au format HH:mm"),
  })
  .refine((slot) => slot.start < slot.end, {
    message: "la fin du créneau doit suivre le début",
    path: ["end"],
  });
export type DeliverySlot = z.infer<typeof deliverySlotSchema>;

/**
 * Une **fenêtre horaire d'acheminement** : `HH:mm`→`HH:mm`, la borne basse
 * facultative.
 *
 * Un seul objet pour deux lectures que le métier fait indifféremment — « entre
 * 6h et 8h » est une fenêtre, « avant 8h » est la même fenêtre sans borne basse.
 * En faire deux concepts aurait obligé chaque écran, chaque validation et chaque
 * impression à traiter les deux cas.
 *
 * Retrait et livraison la partagent : ce que le client demande a la même forme
 * des deux côtés, seule la façon de la contraindre diffère.
 */
export const fulfillmentWindowSchema = z
  .object({
    /** `null` = aucune borne basse — « avant `end` ». */
    start: z.string().regex(TIME_HHMM, "heure attendue au format HH:mm").nullable().default(null),
    end: z.string().regex(TIME_HHMM, "heure attendue au format HH:mm"),
  })
  .refine((window) => window.start === null || window.start < window.end, {
    message: "la fin de la fenêtre doit suivre le début",
    path: ["end"],
  });
export type FulfillmentWindow = z.infer<typeof fulfillmentWindowSchema>;

/**
 * **Créneau ou échéance** (CA-D2). Les valeurs, le type et la résolution vivent
 * sans zod dans `delivery-availability.values.ts` : la boutique les lit au
 * démarrage.
 */
export const windowModeSchema = z.enum(WINDOW_MODES);

/** Vrai quand `inner` tient entièrement dans `outer`. Une borne basse absente vaut « dès l'ouverture ». */
export function windowContains(outer: FulfillmentWindow, inner: FulfillmentWindow): boolean {
  const outerStart = outer.start ?? "00:00";
  const innerStart = inner.start ?? outerStart;
  return innerStart >= outerStart && inner.end <= outer.end;
}

/** Un créneau (ou aucun, `null`) pour chacun des sept jours. */
export const slotByDaySchema = z.object({
  mon: deliverySlotSchema.nullable(),
  tue: deliverySlotSchema.nullable(),
  wed: deliverySlotSchema.nullable(),
  thu: deliverySlotSchema.nullable(),
  fri: deliverySlotSchema.nullable(),
  sat: deliverySlotSchema.nullable(),
  sun: deliverySlotSchema.nullable(),
});
export type SlotByDay = z.infer<typeof slotByDaySchema>;

/**
 * Créneaux préférés. Union discriminée : `everyday` = un créneau global tous les
 * jours (ou aucun) ; `perDay` = un créneau optionnel par jour ouvré.
 */
export const deliverySlotsSchema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("everyday"), slot: deliverySlotSchema.nullable() }),
  z.object({ mode: z.literal("perDay"), byDay: slotByDaySchema }),
]);
export type DeliverySlots = z.infer<typeof deliverySlotsSchema>;

/**
 * Une liste d'**échéances préférées** (`HH:mm`) : une ou plusieurs, sans
 * doublon, de la plus tôt à la plus tard. Plusieurs parce qu'une adresse peut
 * recevoir plusieurs commandes par jour — 06:00 pour le pain, 11:00 pour le
 * déjeuner (Hugo, 2026-10-03). Chaque commande, elle, n'en porte qu'une.
 */
export const deadlineListSchema = z
  .array(z.string().regex(TIME_HHMM, "heure attendue au format HH:mm"))
  .min(1, "au moins une échéance")
  .refine((times) => times.every((time, i) => i === 0 || (times[i - 1] ?? "") < time), {
    message: "échéances sans doublon, de la plus tôt à la plus tard",
  });

/** Une liste d'échéances (ou aucune, `null`) pour chacun des sept jours. */
export const deadlinesByDaySchema = z.object({
  mon: deadlineListSchema.nullable(),
  tue: deadlineListSchema.nullable(),
  wed: deadlineListSchema.nullable(),
  thu: deadlineListSchema.nullable(),
  fri: deadlineListSchema.nullable(),
  sat: deadlineListSchema.nullable(),
  sun: deadlineListSchema.nullable(),
});

/**
 * Échéances préférées d'une adresse en mode échéance — même grain que
 * `deliverySlotsSchema` : les mêmes tous les jours, ou une liste par jour.
 */
export const preferredDeadlinesSchema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("everyday"), times: deadlineListSchema }),
  z.object({ mode: z.literal("perDay"), byDay: deadlinesByDaySchema }),
]);
export type PreferredDeadlines = z.infer<typeof preferredDeadlinesSchema>;

/** Les échéances préférées d'un jour donné ; aucune = liste vide. */
export function deadlinesFor(
  deadlines: PreferredDeadlines | null | undefined,
  day: Weekday | null,
): readonly string[] {
  if (deadlines === null || deadlines === undefined) {
    return [];
  }
  if (deadlines.mode === "everyday") {
    return deadlines.times;
  }
  return day === null ? [] : (deadlines.byDay[day] ?? []);
}

/** Des créneaux préférés, du plus tôt au plus tard ; `[]` = aucun. */
const slotListSchema = z.array(deliverySlotSchema);

/** Une liste de créneaux (ou aucune, `null`) pour chacun des sept jours. */
export const slotListByDaySchema = z.object({
  mon: slotListSchema.nullable(),
  tue: slotListSchema.nullable(),
  wed: slotListSchema.nullable(),
  thu: slotListSchema.nullable(),
  fri: slotListSchema.nullable(),
  sat: slotListSchema.nullable(),
  sun: slotListSchema.nullable(),
});

/**
 * **Plusieurs créneaux préférés** par adresse (CA3b, plan composition
 * automatique §14.1) — même grain que {@link preferredDeadlinesSchema}. Une
 * adresse commande parfois le matin ET pour une soirée ; une commande, elle,
 * n'en porte toujours qu'un.
 *
 * Un champ AJOUTÉ à côté de `slots`, et non une nouvelle forme de `slots` : un
 * onglet resté sur l'ancien front renvoie `slots` sans connaître ce champ, et
 * ne doit rien effacer. L'ordre et l'absence de chevauchement ne sont refusés
 * qu'à l'écriture (la charge), pas ici : les lectures réutilisent ce schéma.
 */
export const preferredSlotsSchema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("everyday"), slots: slotListSchema }),
  z.object({ mode: z.literal("perDay"), byDay: slotListByDaySchema }),
]);
export type PreferredSlots = z.infer<typeof preferredSlotsSchema>;

/** Vrai quand chaque créneau commence après la fin du précédent (bord à bord admis). */
function inOrderWithoutOverlap(slots: readonly DeliverySlot[]): boolean {
  return slots.every((slot, i) => i === 0 || (slots[i - 1]?.end ?? "") <= slot.start);
}

/** Les listes de créneaux d'une charge, chacune avec son chemin pour le refus. */
function slotListsOf(
  list: PreferredSlots,
): readonly (readonly [readonly DeliverySlot[], readonly string[]])[] {
  if (list.mode === "everyday") {
    return [[list.slots, ["slots"]]];
  }
  return weekdaySchema.options.map((day) => [list.byDay[day] ?? [], ["byDay", day]] as const);
}

/** Contact sur place à la livraison — la personne que le livreur appelle. */
export const deliveryContactSchema = z.object({
  prenom: z.string().trim().min(1, "prénom requis"),
  nom: z.string().trim().min(1, "nom requis"),
  telephone: z.string().trim().min(1, "téléphone requis"),
});
export type DeliveryContact = z.infer<typeof deliveryContactSchema>;

/** Point GPS pour les lieux mal géocodés — degrés décimaux, dans les bornes. */
export const gpsPointSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});
export type GpsPoint = z.infer<typeof gpsPointSchema>;

/**
 * Consignes de livraison — ce qu'une adresse de livraison ajoute à une adresse
 * postale. C'est exactement l'objet stocké dans la colonne JSON `delivery_specs`.
 */
export const deliverySpecsSchema = z.object({
  note: z.string().default(""),
  slots: deliverySlotsSchema,
  deliveryContact: deliveryContactSchema.nullable(),
  gps: gpsPointSchema.nullable(),
  /**
   * Ce site **exige-t-il une signature** à la remise ? Réglage de l'adresse, donc
   * **préremplissage** d'une commande — pas une contrainte : une commande peut
   * s'en écarter, et l'écart se voit (cf. la provenance sur la commande).
   */
  /**
   * Dérogation de CETTE adresse au socle de la société. `null` = elle hérite.
   *
   * Trois états et non deux : « on ne signe pas ici » et « on fait comme
   * d'habitude » sont deux réponses différentes, et les confondre fige la
   * seconde le jour où l'habitude change.
   */
  signatureRequired: z.boolean().nullable().default(null),
  /**
   * **Temps de livraison sur place** de CETTE adresse, en minutes — décharger,
   * porter, faire signer (plan de tournée, L7b-C4). Absent ou `null` : le
   * réglage global du calcul de tournée. Facultatif, et sans borne ici : les
   * lectures réutilisent ce schéma, et la borne (1 à 120) est une règle du
   * carnet, qui la refuse à l'écriture en la nommant.
   */
  stopMinutes: z.number().int().nullable().optional(),
  /**
   * **Créneau ou échéance** pour CETTE adresse (CA-D2). Absent ou `null` :
   * elle hérite du réglage global de livraison. Facultatif : les adresses
   * rangées avant le 2026-10-03 n'en portent pas, et héritent.
   */
  windowMode: windowModeSchema.nullable().optional(),
  /**
   * Les **échéances préférées** de CETTE adresse, lues en mode échéance. Absent
   * ou `null` : aucune. Le créneau `slots` reste celui du mode créneau.
   */
  deadlines: preferredDeadlinesSchema.nullable().optional(),
  /**
   * Les **créneaux préférés** de CETTE adresse (CA3b), plusieurs par jour.
   * Absent ou `null` : on lit l'ancien `slots` ({@link slotsFor}), que le
   * serveur dérive de cette liste à chaque écriture — le premier créneau de
   * chaque jour — pour qu'un onglet sur l'ancien front lise encore juste.
   */
  slotList: preferredSlotsSchema.nullable().optional(),
});
export type DeliverySpecs = z.infer<typeof deliverySpecsSchema>;

/** Champs postaux communs (facturation et livraison). */
const postalFieldsSchema = z.object({
  label: z.string().default(""),
  ligne1: z.string().trim().min(1, "adresse requise"),
  ligne2: z.string().default(""),
  codePostal: z.string().trim().min(1, "code postal requis"),
  ville: z.string().trim().min(1, "ville requise"),
  pays: z.string().trim().min(1, "pays requis"),
});

/** Charge d'écriture de l'**adresse de facturation** (unique, sans consignes). */
export const billingAddressPayloadSchema = postalFieldsSchema;
export type BillingAddressPayload = z.infer<typeof billingAddressPayloadSchema>;

/** Les champs d'une adresse de livraison, sans les refus croisés. */
function deliveryAddressFieldsSchema() {
  return postalFieldsSchema.extend({
    isDefault: z.boolean().default(false),
    specs: deliverySpecsSchema,
  });
}

/** Le refus croisé de la charge : une signature suppose quelqu'un pour signer. */
function refuseSignatureWithoutContact(
  payload: { readonly specs: DeliverySpecs },
  ctx: z.RefinementCtx,
): void {
  if (payload.specs.deliveryContact === null && payload.specs.signatureRequired === true) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["specs", "signatureRequired"],
      message:
        "une signature ne peut pas être exigée sans contact sur place : renseignez un contact, ou n'exigez pas de signature",
    });
  }
}

/** Le refus de forme de la charge : des créneaux triés, sans chevauchement (§14.1). */
function refuseUnorderedSlots(
  payload: { readonly specs: DeliverySpecs },
  ctx: z.RefinementCtx,
): void {
  const list = payload.specs.slotList;
  if (list === null || list === undefined) {
    return;
  }
  for (const [slots, path] of slotListsOf(list)) {
    if (!inOrderWithoutOverlap(slots)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["specs", "slotList", ...path],
        message:
          "créneaux à ranger du plus tôt au plus tard, sans chevauchement : un créneau commence après la fin du précédent",
      });
    }
  }
}

/** Les refus croisés d'une charge d'adresse de livraison. */
function refuseDeliveryPayload(
  payload: { readonly specs: DeliverySpecs },
  ctx: z.RefinementCtx,
): void {
  refuseSignatureWithoutContact(payload, ctx);
  refuseUnorderedSlots(payload, ctx);
}

/**
 * Charge de création/édition d'une **adresse de livraison** (postal + consignes).
 *
 * 🔴 **Pas de signature exigée sans contact sur place** (Hugo, 2026-09-14) : une
 * signature suppose quelqu'un pour signer. Le refus vit sur la CHARGE et non sur
 * `deliverySpecsSchema`, que les lectures réutilisent (`deliverySpecsSchema.parse`
 * dans les lecteurs d'adresses, vérifié ce jour-là) : une adresse déjà enregistrée
 * ainsi doit rester lisible, et se corrige à sa prochaine écriture.
 *
 * ⚠️ Le cas HÉRITÉ — `signatureRequired: null` sur une société qui exige la
 * signature — n'est pas refusé ici : le contrat ne connaît pas le socle de la
 * société. Le formulaire partagé le rend inexprimable (`withNoContact`).
 */
export const deliveryAddressPayloadSchema =
  deliveryAddressFieldsSchema().superRefine(refuseDeliveryPayload);
export type DeliveryAddressPayload = z.infer<typeof deliveryAddressPayloadSchema>;

/**
 * La charge d'édition d'une adresse de livraison **par le client**
 * (`PATCH companies/:companyId/delivery-addresses/:addressId`) : la charge
 * commune, plus « dépôt autorisé » (`documentation/livraisons/a-la-porte.md`,
 * AP-Q1, AP-D5).
 *
 * 🔴 **Facultatif, et absent veut dire INCHANGÉ** — jamais `false`. Un front en
 * ligne qui ne connaît pas le champ ne l'envoie pas ; le lire comme un refus
 * retirerait en silence ce que le client a autorisé. C'est aussi pourquoi il
 * n'est pas une clé de `specs`, que l'écran réécrit d'un bloc.
 *
 * Le staff ne passe pas par ici : sa route d'édition d'adresse (sous
 * `b2b_companies`) ne le touche pas, et il a la sienne
 * ({@link deliveryDepositPayloadSchema}, sous `delivery_procedures`).
 */
export const memberDeliveryAddressPayloadSchema = deliveryAddressFieldsSchema()
  .extend({ depositAllowed: z.boolean().optional() })
  .superRefine(refuseDeliveryPayload);
export type MemberDeliveryAddressPayload = z.infer<typeof memberDeliveryAddressPayloadSchema>;

/**
 * « Dépôt autorisé » réglé par le staff
 * (`PUT admin/companies/:companyId/delivery-addresses/:addressId/deposit`,
 * sous `delivery_procedures`) — AP-D5.
 */
export const deliveryDepositPayloadSchema = z.object({ depositAllowed: z.boolean() });
export type DeliveryDepositPayload = z.infer<typeof deliveryDepositPayloadSchema>;

// ─── Vues de LECTURE (réponses) ──────────────────────────────────────────────
// Interfaces et non schémas : une réponse n'est pas re-validée à l'émission ; le
// front peut la parser s'il le souhaite via les schémas ci-dessus.

/** Une adresse de facturation telle que renvoyée par l'API. */
export interface BillingAddressView {
  readonly id: string;
  readonly label: string;
  readonly ligne1: string;
  readonly ligne2: string;
  readonly codePostal: string;
  readonly ville: string;
  readonly pays: string;
}

/** Une adresse de livraison telle que renvoyée par l'API. */
export interface DeliveryAddressView extends BillingAddressView {
  readonly isDefault: boolean;
  readonly specs: DeliverySpecs;
  /** Le nombre d'étapes de sa procédure de livraison — `0` sans procédure. */
  readonly procedureStepCount: number;
  /**
   * Le client autorise-t-il le livreur à **déposer** sans personne pour
   * réceptionner (AP-Q1) ? `false` par défaut. Distinct de « signature
   * exigée » : remettre sans signer n'est pas laisser sans personne. Une
   * signature exigée l'emporte toujours (AP-Q6).
   */
  readonly depositAllowed: boolean;
}

/** Les adresses d'une entreprise : une facturation (ou aucune) + N livraisons. */
export interface CompanyAddressesView {
  readonly billing: BillingAddressView | null;
  /** Livraisons non archivées, **la défaut en tête**. */
  readonly deliveries: readonly DeliveryAddressView[];
}

/** Réponse de création d'une adresse de livraison : son identifiant. */
export interface CreatedAddressResponse {
  readonly id: string;
}
