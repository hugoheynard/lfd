/**
 * Contrats de la **prise de rendez-vous** : la disponibilité déclarée par le
 * commercial (règles hebdomadaires + exceptions + politique), les **créneaux**
 * qui en sont dérivés, et le **rendez-vous** lui-même.
 *
 * Doc d'architecture : `documentation/architecture-prise-de-rendez-vous.md`.
 *
 * Deux invariants de contrat portés ici, à la frontière :
 * - les **heures de règle** sont exprimées en **heure locale d'Europe/Paris**
 *   (`HH:MM`) — c'est ce que le commercial saisit et pense ; la conversion en
 *   instant se fait au calcul, donc le changement d'heure ne décale rien ;
 * - les **instants** (`startAt`, `endAt`) sont des ISO **UTC**, toujours.
 */
import { z } from "zod";

/** Heure locale d'une borne de règle : `HH:MM` sur 24 h. */
const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/u;
/** Jour du calendrier : `AAAA-MM-JJ`. */
const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/u;

const REASON_MAX = 200;
const MESSAGE_MAX = 2000;
const NAME_MAX = 120;
const PHONE_MAX = 30;

/** Bornes de la politique — au-delà, c'est une faute de saisie, pas un réglage. */
const SLOT_MINUTES_MIN = 5;
const SLOT_MINUTES_MAX = 240;
const LEAD_TIME_HOURS_MAX = 720; // 30 jours
const HORIZON_DAYS_MIN = 1;
const HORIZON_DAYS_MAX = 365;

const timeSchema = z.string().regex(TIME_PATTERN, "heure attendue au format HH:MM");
const daySchema = z.string().regex(DAY_PATTERN, "date attendue au format AAAA-MM-JJ");

// ── Disponibilité ──────────────────────────────────────────────────────────────

/**
 * **Règle hebdomadaire** de disponibilité : « le mardi, de 09:00 à 12:00 ».
 * `weekday` suit `Date.getDay()` — 0 = dimanche … 6 = samedi.
 *
 * Une règle n'est **pas** une liste de créneaux : les créneaux en sont dérivés au
 * calcul (cf. `slotsFor`). Changer un horaire est donc un `UPDATE` sur une ligne,
 * jamais une régénération.
 */
export const availabilityRulePayloadSchema = z
  .object({
    weekday: z.number().int().min(0).max(6),
    startTime: timeSchema,
    endTime: timeSchema,
  })
  .refine((r) => r.startTime < r.endTime, {
    path: ["endTime"],
    message: "la fin doit suivre le début",
  });
export type AvailabilityRulePayload = z.infer<typeof availabilityRulePayloadSchema>;

/** Une règle telle que rendue par l'API (elle porte son identifiant). */
export interface AvailabilityRuleView extends AvailabilityRulePayload {
  readonly id: string;
}

/**
 * Nature d'une **exception** à la grille hebdomadaire :
 * - `closed` — fermeture (congés, jour férié) ; sans bornes, elle ferme la journée ;
 * - `open` — ouverture ponctuelle hors grille (un samedi de salon), bornes exigées.
 */
export const exceptionKindSchema = z.enum(["closed", "open"]);
export type ExceptionKind = z.infer<typeof exceptionKindSchema>;

/**
 * Exception datée. Une fermeture partielle (`closed` avec bornes) retire ces
 * heures-là de la journée ; une fermeture sans bornes retire toute la journée.
 */
export const availabilityExceptionPayloadSchema = z
  .object({
    day: daySchema,
    kind: exceptionKindSchema,
    startTime: timeSchema.nullable().default(null),
    endTime: timeSchema.nullable().default(null),
    reason: z.string().trim().max(REASON_MAX, "motif trop long").default(""),
  })
  .superRefine((value, ctx) => {
    const { startTime, endTime } = value;
    // Une ouverture ponctuelle sans bornes n'ouvrirait rien de déterminable.
    if (value.kind === "open" && (startTime === null || endTime === null)) {
      ctx.addIssue({
        code: "custom",
        path: ["startTime"],
        message: "une ouverture ponctuelle exige une heure de début et de fin",
      });
      return;
    }
    if (startTime === null && endTime !== null) {
      ctx.addIssue({ code: "custom", path: ["startTime"], message: "début manquant" });
      return;
    }
    if (startTime !== null && endTime === null) {
      ctx.addIssue({ code: "custom", path: ["endTime"], message: "fin manquante" });
      return;
    }
    if (startTime !== null && endTime !== null && startTime >= endTime) {
      ctx.addIssue({ code: "custom", path: ["endTime"], message: "la fin doit suivre le début" });
    }
  });
export type AvailabilityExceptionPayload = z.infer<typeof availabilityExceptionPayloadSchema>;

/** Une exception telle que rendue par l'API. */
export interface AvailabilityExceptionView extends AvailabilityExceptionPayload {
  readonly id: string;
}

/**
 * Écriture des **seules exceptions**. Comme la politique, elles s'enregistrent
 * sans rouvrir la grille : l'écran qui les édite n'a pas à renvoyer des règles
 * qu'il a chargées il y a dix minutes, et ne peut donc pas les écraser.
 *
 * La liste part **entière**, et non exception par exception : elle se lit et
 * s'édite comme un tout, et un `PUT` idempotent évite d'inventer un CRUD à trois
 * verbes pour une poignée de lignes datées.
 */
export const availabilityExceptionsPayloadSchema = z.object({
  exceptions: z.array(availabilityExceptionPayloadSchema).default([]),
});
export type AvailabilityExceptionsPayload = z.infer<typeof availabilityExceptionsPayloadSchema>;

/** Canal d'un rendez-vous : au téléphone, en visio, ou sur place. */
export const appointmentChannelSchema = z.enum(["phone", "visio", "onsite"]);
export type AppointmentChannel = z.infer<typeof appointmentChannelSchema>;

/**
 * **Politique de réservation** — les bornes que le commercial pose autour de sa
 * grille : durée d'un rendez-vous, délai de prévenance (on ne réserve pas dans
 * les `leadTimeHours` qui viennent), horizon (on ne réserve pas au-delà de
 * `horizonDays`), et les canaux proposés au client.
 */
export const bookingPolicySchema = z.object({
  slotMinutes: z.number().int().min(SLOT_MINUTES_MIN).max(SLOT_MINUTES_MAX).default(30),
  leadTimeHours: z.number().int().min(0).max(LEAD_TIME_HOURS_MAX).default(24),
  horizonDays: z.number().int().min(HORIZON_DAYS_MIN).max(HORIZON_DAYS_MAX).default(30),
  channels: z
    .array(appointmentChannelSchema)
    .min(1, "au moins un canal doit rester proposé")
    .default(["phone"]),
});
export type BookingPolicy = z.infer<typeof bookingPolicySchema>;

/** La configuration complète, telle qu'écrite par le commercial en une fois. */
export const availabilityConfigPayloadSchema = z.object({
  rules: z.array(availabilityRulePayloadSchema).default([]),
  exceptions: z.array(availabilityExceptionPayloadSchema).default([]),
  policy: bookingPolicySchema,
});
export type AvailabilityConfigPayload = z.infer<typeof availabilityConfigPayloadSchema>;

/** La configuration telle que rendue par l'API (règles et exceptions identifiées). */
export interface AvailabilityConfigView {
  readonly rules: readonly AvailabilityRuleView[];
  readonly exceptions: readonly AvailabilityExceptionView[];
  readonly policy: BookingPolicy;
}

// ── Créneaux ───────────────────────────────────────────────────────────────────

/**
 * Un **créneau réservable**, dérivé des règles. `startAt` / `endAt` sont des
 * instants **UTC** (la vérité) ; `day` et `time` sont la **lecture locale**
 * (Europe/Paris) calculée **côté serveur** — pour que le client et le SSR
 * affichent la même heure sans refaire la conversion, et sans dépendre du fuseau
 * du navigateur.
 */
export interface Slot {
  readonly startAt: string;
  readonly endAt: string;
  readonly day: string;
  readonly time: string;
}

/** Les créneaux d'une fenêtre, plus les canaux que le client peut choisir. */
export interface SlotsView {
  readonly slots: readonly Slot[];
  readonly channels: readonly AppointmentChannel[];
  /** Durée d'un rendez-vous, en minutes — pour l'affichage (« 30 min »). */
  readonly slotMinutes: number;
}

// ── Rendez-vous ────────────────────────────────────────────────────────────────

/**
 * État d'un rendez-vous. `honored` / `no_show` / `cancelled` sont **terminaux** :
 * reprogrammer, c'est annuler puis créer (avec `rescheduledFromId` pour la trace).
 */
export const appointmentStatusSchema = z.enum([
  "requested",
  "confirmed",
  "honored",
  "no_show",
  "cancelled",
]);
export type AppointmentStatus = z.infer<typeof appointmentStatusSchema>;

/**
 * Sujet du rendez-vous. Volontairement **discriminé et non muré par la société** :
 * un prospect froid (`lead`) ou une personne sans société déclarée (`user`) doit
 * pouvoir être reçu — c'est justement la population qu'on cherche à capter.
 */
export const appointmentSubjectTypeSchema = z.enum(["company", "lead", "user"]);
export type AppointmentSubjectType = z.infer<typeof appointmentSubjectTypeSchema>;

/** Transitions **déclenchables** : `requested` n'en est pas une (c'est l'entrée). */
export const appointmentTransitionSchema = z.enum(["confirmed", "honored", "no_show", "cancelled"]);
export type AppointmentTransition = z.infer<typeof appointmentTransitionSchema>;

/** Réservation **client** : il choisit un créneau, un canal, et se décrit. */
export const bookAppointmentPayloadSchema = z.object({
  startAt: z.string().datetime({ message: "instant ISO attendu" }),
  channel: appointmentChannelSchema,
  /** Société concernée si le client en a une ; sinon le rendez-vous porte sur lui. */
  companyId: z.string().trim().min(1).nullable().default(null),
  contactName: z.string().trim().max(NAME_MAX).default(""),
  contactPhone: z.string().trim().max(PHONE_MAX).default(""),
  message: z.string().max(MESSAGE_MAX, "message trop long (2000 caractères max)").default(""),
});
export type BookAppointmentPayload = z.infer<typeof bookAppointmentPayloadSchema>;

/**
 * Pose d'un rendez-vous **par le staff** : il vient d'avoir le prospect au
 * téléphone. Il choisit le sujet lui-même (y compris un lead cold) et n'est pas
 * soumis au délai de prévenance — c'est son agenda.
 */
export const staffBookAppointmentPayloadSchema = z.object({
  startAt: z.string().datetime({ message: "instant ISO attendu" }),
  channel: appointmentChannelSchema,
  subjectType: appointmentSubjectTypeSchema,
  subjectId: z.string().trim().min(1, "sujet obligatoire"),
  contactName: z.string().trim().max(NAME_MAX).default(""),
  contactEmail: z.string().trim().max(NAME_MAX).default(""),
  contactPhone: z.string().trim().max(PHONE_MAX).default(""),
  message: z.string().max(MESSAGE_MAX, "message trop long (2000 caractères max)").default(""),
});
export type StaffBookAppointmentPayload = z.infer<typeof staffBookAppointmentPayloadSchema>;

/** Changement d'état par le staff. Une annulation exige un motif. */
export const appointmentTransitionPayloadSchema = z
  .object({
    status: appointmentTransitionSchema,
    reason: z.string().trim().max(REASON_MAX, "motif trop long").default(""),
  })
  .superRefine((value, ctx) => {
    if (value.status === "cancelled" && value.reason === "") {
      ctx.addIssue({
        code: "custom",
        path: ["reason"],
        message: "une annulation exige un motif",
      });
    }
  });
export type AppointmentTransitionPayload = z.infer<typeof appointmentTransitionPayloadSchema>;

/** Un rendez-vous rendu par l'API — instants UTC, lecture locale pré-calculée. */
export interface AppointmentView {
  readonly id: string;
  readonly startAt: string;
  readonly endAt: string;
  /** Jour local (Europe/Paris) du rendez-vous — même raison que sur {@link Slot}. */
  readonly day: string;
  /** Heure locale (Europe/Paris) de début. */
  readonly time: string;
  /**
   * Heure locale de **fin**. Portée par la vue plutôt que dérivée côté front :
   * la durée n'y est pas connue, et refaire la conversion de fuseau dans le
   * navigateur est exactement ce que la lecture pré-calculée évite.
   */
  readonly endTime: string;
  readonly status: AppointmentStatus;
  readonly channel: AppointmentChannel;
  readonly subjectType: AppointmentSubjectType;
  readonly subjectId: string;
  readonly contactName: string;
  readonly contactEmail: string;
  readonly contactPhone: string;
  readonly message: string;
  /** Motif d'annulation, vide tant que le rendez-vous n'est pas annulé. */
  readonly cancelReason: string;
  /** Rendez-vous d'origine si celui-ci le reprogramme ; `null` sinon. */
  readonly rescheduledFromId: string | null;
  readonly createdAt: string;
}

/** Ce que rend la création d'un rendez-vous. */
export interface CreatedAppointmentResponse {
  readonly id: string;
}
