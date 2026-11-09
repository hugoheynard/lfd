import { z } from "zod";

import {
  MARKETING_CONSENT_SPACES,
  PUBLISHED_MARKETING_TEXT_VERSIONS,
} from "./marketing-consent.values.js";
import { contentLocales } from "./platform-content.defaults.js";

/**
 * **Les contrats du consentement marketing** (plan
 * `documentation/mail/la-desinscription-et-l-accord.md`, lots C2, C3, C5).
 * Les valeurs sans zod vivent dans `marketing-consent.values.ts`.
 */

/** Une adresse en pratique (RFC 5321), comme `EmailAddress` la borne. */
const EMAIL_MAX_LENGTH = 254;
/** Le champ piège : un robot y écrit n'importe quoi ; au-delà, c'est du bruit. */
const HONEYPOT_MAX_LENGTH = 500;

/** La langue de la case cochée — et celle de l'e-mail de confirmation. */
const consentLocaleSchema = z.enum(contentLocales, "langue de la case inconnue");

/**
 * **La réponse à la case de la société** (`lfc`), portée par le geste
 * d'inscription et par la passation de commande (C2).
 *
 * FACULTATIVE : un corps sans elle, ou `accepted: false`, n'écrit rien — une
 * case vide n'est pas un refus, la question revient (décisions de Hugo).
 * `accepted: true` demande l'accord ; une adresse désinscrite n'est jamais
 * réinscrite par cette case, et le serveur ne dit pas laquelle (règle 17).
 *
 * Elle n'entre PAS dans l'empreinte d'idempotence d'une commande : au rejeu,
 * la première réponse fait foi (règle 21).
 */
export const societyConsentAnswerSchema = z.object({
  accepted: z.boolean(),
  textVersion: z.enum(PUBLISHED_MARKETING_TEXT_VERSIONS.society, "version de texte inconnue"),
  locale: consentLocaleSchema,
});
export type SocietyConsentAnswer = z.infer<typeof societyConsentAnswerSchema>;

/** Une société de la boutique, désignée par son code d'espace. */
export const marketingConsentSpaceSchema = z.enum(MARKETING_CONSENT_SPACES, "société inconnue");

/**
 * `POST /me/marketing/subscriptions` — « Mes préférences » : s'inscrire, ou se
 * RÉINSCRIRE après une désinscription (le seul geste qui le permet). Une
 * adresse de compte non vérifiée passe par la double confirmation.
 */
export const subscribeMarketingPayloadSchema = z.object({
  space: marketingConsentSpaceSchema,
  textVersion: z.enum(PUBLISHED_MARKETING_TEXT_VERSIONS.society, "version de texte inconnue"),
  locale: consentLocaleSchema,
});
export type SubscribeMarketingPayload = z.infer<typeof subscribeMarketingPayloadSchema>;

/** `POST /me/marketing/unsubscriptions` — « Mes préférences » : se désinscrire. */
export const unsubscribeMarketingPayloadSchema = z.object({
  space: marketingConsentSpaceSchema,
});
export type UnsubscribeMarketingPayload = z.infer<typeof unsubscribeMarketingPayloadSchema>;

/**
 * `POST /me/marketing/partners` — la case « partenaires » (règles 14 et 19).
 * Bâtie, éteinte : refusée (409) tant que `partnersOffered` est faux.
 */
export const partnersConsentPayloadSchema = z.object({
  textVersion: z.enum(PUBLISHED_MARKETING_TEXT_VERSIONS.partners, "version de texte inconnue"),
  locale: consentLocaleSchema,
});
export type PartnersConsentPayload = z.infer<typeof partnersConsentPayloadSchema>;

/**
 * `POST /mail/newsletter` — le champ du pied de page de la boutique (C5),
 * public et sans compte. L'adresse est dans le CORPS, jamais dans l'URL.
 *
 * La réponse est TOUJOURS `202` sans corps, quelle que soit l'adresse :
 * « si cette adresse peut recevoir nos nouvelles, un e-mail de confirmation
 * vient de partir ». `website` est le champ piège, invisible à l'écran : la
 * boutique l'envoie vide (ou ne l'envoie pas) ; rempli, rien n'est écrit.
 */
export const newsletterSignupPayloadSchema = z.object({
  email: z
    .string()
    .trim()
    .min(1, "e-mail requis")
    .max(EMAIL_MAX_LENGTH, `e-mail : au plus ${String(EMAIL_MAX_LENGTH)} caractères`)
    .email("e-mail invalide"),
  textVersion: z.enum(PUBLISHED_MARKETING_TEXT_VERSIONS.newsletter, "version de texte inconnue"),
  locale: consentLocaleSchema,
  website: z.string().max(HONEYPOT_MAX_LENGTH).optional(),
});
export type NewsletterSignupPayload = z.infer<typeof newsletterSignupPayloadSchema>;
