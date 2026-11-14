import { z } from "zod";

/**
 * **Noter un contact** avec un prospect ou un client : le geste du staff qui
 * fait passer une fiche au niveau « Contactée » du suivi commercial
 * (`documentation/b2b/plan-suivi-commercial.md`, § 3.2 ter).
 *
 * Les modes sont ceux d'un échange réel. Le rendez-vous n'en est pas un : un
 * rendez-vous honoré compte déjà comme contact, lu à sa source, sans double
 * saisie.
 */
export const COMPANY_CONTACT_MODES = [
  "phone",
  "email",
  "visit",
  "visio",
  "trade_show",
  "other",
] as const;

export const companyContactModeSchema = z.enum(COMPANY_CONTACT_MODES);
export type CompanyContactMode = z.infer<typeof companyContactModeSchema>;

/**
 * La FORME de la demande. Les règles (une date qui existe et n'est pas dans le
 * futur, une note bornée) sont tenues par le domaine, qui seul connaît
 * l'instant de la requête.
 */
export const noteCompanyContactPayloadSchema = z.strictObject({
  mode: companyContactModeSchema,
  /** Le jour de l'échange, `AAAA-MM-JJ`, jour civil de Paris. */
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/u, "date attendue au format AAAA-MM-JJ"),
  /** Une note courte, facultative. */
  note: z.string().optional(),
});
export type NoteCompanyContactPayload = z.infer<typeof noteCompanyContactPayloadSchema>;
