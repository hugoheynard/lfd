import {
  MAIL_SEND_DELIVERIES,
  MAIL_SEND_SCOPES,
  MAIL_SEND_SPACES,
  MAIL_SEND_STATES,
} from "@lfd/contracts";
import { z } from "zod";

/** La page par défaut, et la plus grande admise. */
export const MAIL_SEND_PAGE_SIZE = 50;
export const MAIL_SEND_PAGE_MAX = 100;

/**
 * La FORME des critères de `GET /admin/mail/sends`. Aucune adresse n'y est
 * admise : une adresse ne voyage jamais dans une URL (décision 8).
 */
export const mailSendsQuerySchema = z.strictObject({
  space: z.enum(MAIL_SEND_SPACES).optional(),
  template: z.string().min(1).max(80).optional(),
  state: z.enum(MAIL_SEND_STATES).optional(),
  delivery: z.enum(MAIL_SEND_DELIVERIES).optional(),
  from: z.iso.datetime().optional(),
  to: z.iso.datetime().optional(),
  scope: z.enum(MAIL_SEND_SCOPES).default("regular"),
  cursor: z.string().min(1).max(200).optional(),
  limit: z.coerce.number().int().min(1).max(MAIL_SEND_PAGE_MAX).default(MAIL_SEND_PAGE_SIZE),
});

export type MailSendsQueryParams = z.infer<typeof mailSendsQuerySchema>;

/**
 * Le CORPS de `POST /admin/mail/sends/searches` : l'adresse ne voyage jamais
 * dans une URL. Sa règle (un @, 320 caractères) est celle du domaine.
 */
export const mailSearchPayloadSchema = z.strictObject({ address: z.string() });

export type MailSearchPayload = z.infer<typeof mailSearchPayloadSchema>;
