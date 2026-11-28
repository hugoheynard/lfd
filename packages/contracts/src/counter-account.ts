import { z } from "zod";

/**
 * **Ouvrir un compte pro au comptoir** — `POST /admin/counter/accounts`
 * (`documentation/comptes-client/plan-comptes-du-comptoir.md`, § 3), sous
 * `b2b_counter_accounts:write`, une fois par intention (`Idempotency-Key`).
 *
 * La forme seulement : le nom d'usage non vide, l'adresse valide et le
 * téléphone obligatoire sont tenus par le domaine. `identitySeen` est la case
 * « J'ai vu une preuve d'identité », non bloquante, attestée au nom de
 * l'agent connecté. Rien de la pièce n'est transmis.
 *
 * Réponse `201` : `CreatedIdResponse` — l'id de la société ouverte.
 */
export const openCounterAccountPayloadSchema = z.strictObject({
  enseigne: z.string().max(160),
  contact: z.strictObject({
    firstName: z.string().max(200),
    lastName: z.string().max(200),
    fonction: z.string().max(160).default(""),
    email: z.string().max(320),
    phone: z.string().max(60),
  }),
  identitySeen: z.boolean(),
});
export type OpenCounterAccountPayload = z.infer<typeof openCounterAccountPayloadSchema>;
