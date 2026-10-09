import { z } from "zod";

import { CONTACT_BOUNDS } from "./contact.values.js";

/**
 * Contrat de fil de **« Nous écrire »** (`documentation/order/plan-nous-ecrire.md`) :
 * les schémas des charges, et le reste par réexport depuis `contact.values.ts`
 * (sans zod, pour la boutique).
 *
 * Les schémas ne valident que la FORME — types et longueurs bornées. Ce qui
 * est une règle (libellé français obligatoire, adresse e-mail valide, objet
 * actif pour ce public) est refusé par le domaine.
 */
export {
  CONTACT_BOUNDS,
  CONTACT_MIN_FILL_MS,
  CONTACT_PRIORITIES,
  CONTACT_SUBJECT_AUDIENCES,
  DEFAULT_CONTACT_SETTINGS,
  type ContactCardText,
  type ContactLocalizedText,
  type ContactMessageStatus,
  type ContactMessageView,
  type ContactPhoneView,
  type ContactPriority,
  type ContactSettingsView,
  type ContactSubjectAudience,
  type ContactSubjectView,
  type PublicContactPhoneView,
  type PublicContactSettingsView,
  type PublicContactSubjectView,
} from "./contact.values.js";

const bounded = (max: number) => z.string().max(max);

const localized = (max: number) =>
  z.object({ fr: bounded(max), en: bounded(max), it: bounded(max) }).strict();

/** `POST /admin/contact/subjects` et `PUT /admin/contact/subjects/:id` — l'objet entier. */
export const contactSubjectPayloadSchema = z
  .object({
    label: localized(CONTACT_BOUNDS.subjectLabel),
    recipientEmail: bounded(CONTACT_BOUNDS.recipientEmail),
    position: z.number().int().min(0),
    active: z.boolean(),
    audience: z.enum(["b2b", "b2c", "both"]),
    priority: z.enum(["low", "medium", "urgent"]),
  })
  .strict();
export type ContactSubjectPayload = z.infer<typeof contactSubjectPayloadSchema>;

const card = z
  .object({
    title: localized(CONTACT_BOUNDS.cardTitle),
    body: localized(CONTACT_BOUNDS.cardBody),
  })
  .strict();

/** `PUT /admin/contact/settings` — les deux cartes ; les numéros ont leurs routes. */
export const contactSettingsPayloadSchema = z
  .object({
    cards: z.object({ b2b: card, b2c: card }).strict(),
  })
  .strict();
export type ContactSettingsPayload = z.infer<typeof contactSettingsPayloadSchema>;

/** `POST /admin/contact/phones` et `PUT /admin/contact/phones/:id` — le numéro entier. */
export const contactPhonePayloadSchema = z
  .object({
    label: localized(CONTACT_BOUNDS.phoneLabel),
    number: bounded(CONTACT_BOUNDS.settingsPhone),
    audience: z.enum(["b2b", "b2c", "both"]),
    position: z.number().int().min(0),
    active: z.boolean(),
  })
  .strict();
export type ContactPhonePayload = z.infer<typeof contactPhonePayloadSchema>;

/** `GET /contact-subjects?audience=` et `GET /admin/contact/messages?status=`. */
export const contactAudienceQuerySchema = z.enum(["b2b", "b2c"]);
export const contactMessageStatusSchema = z.enum(["pending", "handled"]);

/**
 * `POST /contact-messages` (visiteur) et `POST /me/contact-messages` (client
 * connecté) — le message.
 *
 * `website` est le **champ piège** : invisible à l'écran, un humain le laisse
 * vide. `elapsedMs` est le temps écoulé depuis l'ouverture du dialogue. Un
 * piège rempli ou un délai trop court rendent la MÊME réponse qu'un message
 * reçu — rien n'est rangé ni envoyé, et le robot n'apprend rien.
 */
export const contactMessagePayloadSchema = z
  .object({
    subjectId: z.string().min(1).max(64),
    audience: contactAudienceQuerySchema,
    name: bounded(CONTACT_BOUNDS.authorName),
    email: bounded(CONTACT_BOUNDS.authorEmail),
    phone: bounded(CONTACT_BOUNDS.authorPhone),
    message: bounded(CONTACT_BOUNDS.message),
    website: z.string().max(200),
    elapsedMs: z.number().int().min(0),
  })
  .strict();
export type ContactMessagePayload = z.infer<typeof contactMessagePayloadSchema>;
