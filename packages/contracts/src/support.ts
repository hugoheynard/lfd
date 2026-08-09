import { z } from "zod";

import { appointmentPurposeSchema, purposeNeedsMessage } from "./appointment.js";
import type { AppointmentPurpose } from "./appointment.js";

/**
 * Contrat de fil d'une **demande de support à l'activation** : le client demande
 * à être contacté par l'équipe commerciale, par téléphone (avec un créneau) ou
 * par e-mail.
 */

/** Canal de contact souhaité. */
export const supportChannelSchema = z.enum(["phone", "email"]);
export type SupportChannel = z.infer<typeof supportChannelSchema>;

/** Demi-journée d'un créneau de rappel. */
export const supportSlotSchema = z.enum(["morning", "afternoon"]);
export type SupportSlot = z.infer<typeof supportSlotSchema>;

/** Longueurs maximales — bornées à la frontière pour ne pas stocker n'importe quoi. */
const PHONE_MAX = 30;
const MESSAGE_MAX = 2000;

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/u;

/**
 * Vraie date du calendrier (rejette `2026-13-40`, `2026-02-30`…). Le regex ne
 * garantit que la forme ; sans ce contrôle, une date impossible atteindrait
 * `new Date(...)` côté serveur et exploserait en 500 au lieu d'un 400 lisible.
 */
/** Décompose `AAAA-MM-JJ` (déjà validé par le regex) en année/mois/jour numériques. */
function partsOf(value: string): { year: number; month: number; day: number } {
  const parts = value.split("-");
  return { year: Number(parts[0]), month: Number(parts[1]), day: Number(parts[2]) };
}

function isRealCalendarDate(value: string): boolean {
  const { year, month, day } = partsOf(value);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  );
}

/** La date est-elle aujourd'hui (UTC) ou plus tard ? Un rappel dans le passé n'a pas de sens. */
function isTodayOrLater(value: string): boolean {
  const { year, month, day } = partsOf(value);
  const date = Date.UTC(year, month - 1, day);
  const now = new Date();
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return date >= today;
}

/**
 * Demande de support. Pour un rappel (`phone`) : un numéro **non vide** et la
 * disponibilité — « au plus vite » (`asap`) ou un créneau **daté et à venir**
 * (`scheduledDate` + `slot`). Pour un e-mail (`email`) : rien de plus, on répond
 * à l'adresse du compte (ni numéro ni créneau). Un message libre borné
 * accompagne les deux.
 *
 * Les invariants croisés (canal ⇒ champs cohérents) sont exprimés ici, à la
 * frontière : une demande incohérente est un **400** lisible, jamais un 500.
 */
export const activationSupportPayloadSchema = z
  .object({
    channel: supportChannelSchema,
    /**
     * Le **motif**, partagé avec la prise de rendez-vous : la question « de quoi
     * s'agit-il ? » est la même dans les trois chemins. Sur un contact par
     * e-mail, c'est lui qui en fera l'**objet**.
     */
    purpose: appointmentPurposeSchema,
    phoneNumber: z.string().trim().max(PHONE_MAX, "numéro de téléphone trop long").default(""),
    asap: z.boolean().default(true),
    scheduledDate: z
      .string()
      .regex(DATE_PATTERN, "date attendue au format AAAA-MM-JJ")
      .nullable()
      .default(null),
    slot: supportSlotSchema.nullable().default(null),
    message: z.string().max(MESSAGE_MAX, "message trop long (2000 caractères max)").default(""),
  })
  .superRefine((value, ctx) => {
    // « Autre demande » sans un mot d'explication n'est pas un motif.
    if (purposeNeedsMessage(value.purpose, value.message)) {
      ctx.addIssue({ code: "custom", path: ["message"], message: "précisez votre demande" });
    }

    // Un e-mail ne porte ni numéro ni créneau : on répond à l'adresse du compte.
    if (value.channel === "email") {
      if (value.scheduledDate !== null || value.slot !== null) {
        ctx.addIssue({
          code: "custom",
          path: ["scheduledDate"],
          message: "un contact par e-mail ne porte pas de créneau de rappel",
        });
      }
      return;
    }

    // channel === "phone" : un rappel exige un numéro.
    if (value.phoneNumber === "") {
      ctx.addIssue({
        code: "custom",
        path: ["phoneNumber"],
        message: "un rappel nécessite un numéro de téléphone",
      });
    }

    // « Au plus vite » : pas de créneau daté.
    if (value.asap) {
      if (value.scheduledDate !== null || value.slot !== null) {
        ctx.addIssue({
          code: "custom",
          path: ["scheduledDate"],
          message: "« au plus vite » ne porte pas de créneau daté",
        });
      }
      return;
    }

    // Rappel programmé : date ET créneau requis, date réelle et à venir.
    if (value.scheduledDate === null || value.slot === null) {
      ctx.addIssue({
        code: "custom",
        path: ["scheduledDate"],
        message: "un rappel programmé demande une date et un créneau",
      });
      return;
    }
    if (!isRealCalendarDate(value.scheduledDate)) {
      ctx.addIssue({ code: "custom", path: ["scheduledDate"], message: "date invalide" });
      return;
    }
    if (!isTodayOrLater(value.scheduledDate)) {
      ctx.addIssue({
        code: "custom",
        path: ["scheduledDate"],
        message: "la date de rappel doit être aujourd'hui ou plus tard",
      });
    }
  });
export type ActivationSupportPayload = z.infer<typeof activationSupportPayloadSchema>;

/**
 * Une demande de contact **telle que la voit le staff**. Elle porte enfin ce que
 * le client avait rempli : son canal, son numéro, sa disponibilité et son
 * message — jusqu'ici la surface admin n'exposait qu'un booléen
 * `hasOpenSupportRequest`, et le formulaire n'était lu par personne.
 */
export interface SupportRequestView {
  readonly id: string;
  readonly companyId: string;
  readonly requestedByUserId: string;
  readonly channel: SupportChannel;
  /** De quoi il s'agit — l'objet de l'échange, commun aux trois chemins. */
  readonly purpose: AppointmentPurpose;
  readonly phoneNumber: string;
  readonly asap: boolean;
  /** Jour souhaité (`AAAA-MM-JJ`) pour les demandes antérieures aux rendez-vous. */
  readonly scheduledDate: string | null;
  readonly slot: SupportSlot | null;
  readonly message: string;
  /** Instant du traitement (ISO) — `null` tant que la demande est **ouverte**. */
  readonly handledAt: string | null;
  readonly createdAt: string;
}
