import { z } from "zod";

import { CONTACT_BOUNDS } from "./contact.values.js";

/**
 * Contrat de fil des **demandes clients** (`documentation/contenu-ecommerce/demandes-clients.md`) :
 * les schémas des charges, et le reste par réexport depuis `contact.values.ts`
 * (sans zod, pour la boutique).
 *
 * Les schémas ne valident que la FORME — types et longueurs bornées. Ce qui
 * est une règle (libellé français obligatoire, adresse e-mail valide, motif
 * actif pour ce formulaire et ce public, `kind` immuable) est refusé par le domaine.
 */
export {
  CONTACT_AUDIENCES,
  CONTACT_BOUNDS,
  CONTACT_CARD_DEFAULTS,
  DEFAULT_CONTACT_SETTINGS,
  REQUEST_KINDS,
  REQUEST_PHOTO_BOUNDS,
  REQUEST_PRIORITIES,
  type ContactAudience,
  type ContactCardFallback,
  type ContactCardText,
  type ContactLocalizedText,
  type ContactPhoneView,
  type ContactRequestDetailsView,
  type ContactSettingsView,
  type CustomerRequestDetailsView,
  type CustomerRequestPhotoView,
  type CustomerRequestStatus,
  type CustomerRequestView,
  type OrderProblemDetailsView,
  type PublicContactPhoneView,
  type PublicContactSettingsView,
  type PublicRequestReasonView,
  type RequestKind,
  type RequestPriority,
  type RequestReasonView,
} from "./contact.values.js";

const bounded = (max: number) => z.string().max(max);

const localized = (max: number) =>
  z.object({ fr: bounded(max), en: bounded(max), it: bounded(max) }).strict();

const requestKindSchema = z.enum(["contact", "order_problem"]);

/**
 * `POST /admin/request-reasons` et `PUT /admin/request-reasons/:id` — le motif
 * entier. `kind` est repris à la révision : le domaine refuse qu'il change.
 */
export const requestReasonPayloadSchema = z
  .object({
    kind: requestKindSchema,
    label: localized(CONTACT_BOUNDS.reasonLabel),
    recipientEmail: bounded(CONTACT_BOUNDS.recipientEmail),
    position: z.number().int().min(0),
    active: z.boolean(),
    audience: z.enum(["b2b", "b2c", "both"]),
    priority: z.enum(["low", "medium", "urgent"]),
  })
  .strict();
export type RequestReasonPayload = z.infer<typeof requestReasonPayloadSchema>;

/** `GET /admin/request-reasons?kind=` — un onglet par formulaire. */
export const requestKindQuerySchema = requestKindSchema;

const card = z
  .object({
    kicker: localized(CONTACT_BOUNDS.cardKicker),
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

/** `audience=` de `GET /request-reasons` : l'espace d'où l'on écrit. */
export const contactAudienceQuerySchema = z.enum(["b2b", "b2c"]);

/** `status=` de `GET /admin/customer-requests`. */
export const customerRequestStatusSchema = z.enum(["pending", "handled"]);

/** `kind=` FACULTATIF de `GET /admin/customer-requests` : absent = tous les types. */
export const customerRequestKindFilterSchema = requestKindSchema.optional();

/**
 * `POST /contact-messages` (visiteur) et `POST /me/contact-messages` (client
 * connecté) — le message. `reasonId` désigne un motif `contact`.
 *
 * Le PUBLIC n'y est pas : il se déduit au serveur (visiteur → `b2c` ; client
 * connecté → `b2b` pour une société active, sinon `b2c`).
 *
 * `lfd_trap` est le **champ piège** : invisible à l'écran, et nommé pour
 * qu'aucun navigateur ne le remplisse d'office. Un humain le laisse vide ;
 * rempli, la réponse est la MÊME qu'un message reçu, et rien n'est rangé ni
 * envoyé.
 */
export const contactMessagePayloadSchema = z
  .object({
    reasonId: z.string().min(1).max(64),
    name: bounded(CONTACT_BOUNDS.authorName),
    email: bounded(CONTACT_BOUNDS.authorEmail),
    phone: bounded(CONTACT_BOUNDS.authorPhone),
    message: bounded(CONTACT_BOUNDS.message),
    lfd_trap: z.string().max(200),
  })
  .strict();
export type ContactMessagePayload = z.infer<typeof contactMessagePayloadSchema>;

/**
 * `POST /me/orders/:id/problems` — les CHAMPS TEXTE du multipart ; les photos
 * sont les fichiers du champ `photos` (au plus {@link REQUEST_PHOTO_BOUNDS}).
 * Nom, e-mail et téléphone sont pris au compte, jamais au corps. Le mot est
 * facultatif.
 */
export const orderProblemPayloadSchema = z
  .object({
    reasonId: z.string().min(1).max(64),
    message: bounded(CONTACT_BOUNDS.message).default(""),
  })
  .strict();
export type OrderProblemPayload = z.infer<typeof orderProblemPayloadSchema>;
