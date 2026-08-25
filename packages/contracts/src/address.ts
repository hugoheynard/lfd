import { z } from "zod";

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
  signatureRequired: z.boolean().default(false),
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

/** Charge de création/édition d'une **adresse de livraison** (postal + consignes). */
export const deliveryAddressPayloadSchema = postalFieldsSchema.extend({
  isDefault: z.boolean().default(false),
  specs: deliverySpecsSchema,
});
export type DeliveryAddressPayload = z.infer<typeof deliveryAddressPayloadSchema>;

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
