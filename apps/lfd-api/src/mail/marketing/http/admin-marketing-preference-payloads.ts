import { MAIL_PREFERENCE_STATUSES, MAIL_SEND_SPACES } from "@lfd/contracts";
import { z } from "zod";

/** La page par défaut, et la plus grande admise — celles du suivi des envois. */
export const MAIL_PREFERENCE_PAGE_SIZE = 50;
export const MAIL_PREFERENCE_PAGE_MAX = 100;

/**
 * La FORME des critères de `GET /admin/mail/preferences`. Aucune adresse
 * n'y est admise : une adresse ne voyage jamais dans une URL.
 */
export const mailPreferencesQuerySchema = z.strictObject({
  space: z.enum(MAIL_SEND_SPACES).optional(),
  status: z.enum(MAIL_PREFERENCE_STATUSES).optional(),
  cursor: z.string().min(1).max(200).optional(),
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(MAIL_PREFERENCE_PAGE_MAX)
    .default(MAIL_PREFERENCE_PAGE_SIZE),
});

export type MailPreferencesQueryParams = z.infer<typeof mailPreferencesQuerySchema>;

/**
 * Le CORPS de `POST /admin/mail/preferences/unsubscriptions` : l'espace et
 * l'adresse que le client a donnée. Sa règle (un @, 320 caractères) est celle
 * du domaine.
 */
export const staffUnsubscribePayloadSchema = z.strictObject({
  space: z.enum(MAIL_SEND_SPACES),
  address: z.string(),
});

export type StaffUnsubscribePayload = z.infer<typeof staffUnsubscribePayloadSchema>;

/**
 * Le CORPS de `POST /admin/mail/preferences/searches` : l'adresse ne voyage
 * jamais dans une URL. Sa règle (un @, 320 caractères) est celle du domaine.
 */
export const preferenceSearchPayloadSchema = z.strictObject({ address: z.string() });

export type PreferenceSearchPayload = z.infer<typeof preferenceSearchPayloadSchema>;
