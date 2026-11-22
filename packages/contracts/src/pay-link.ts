import { z } from "zod";

import { PAY_LINK_TOKEN_LENGTH } from "./pay-link.values.js";

/**
 * Contrat de fil de **la page publique d'un lien de paiement** (doc
 * `documentation/payment/les-liens-de-paiement.md`). Le jeton voyage dans le CORPS d'un `POST`, jamais dans un chemin de
 * l'API : la page `/payer/<jeton>` le lit dans son adresse et le recopie.
 * Le schéma ne valide que la FORME du jeton.
 */
export {
  PAY_LINK_TOKEN_LENGTH,
  type PayLinkIntent,
  type PayLinkUnpayableReason,
  type PayLinkView,
} from "./pay-link.values.js";

/** `POST /pay-links/view` et `POST /pay-links/intent` — le corps. */
export const payLinkTokenPayloadSchema = z.object({
  token: z
    .string()
    .length(PAY_LINK_TOKEN_LENGTH)
    .regex(/^[A-Za-z0-9_-]+$/u),
});
export type PayLinkTokenPayload = z.infer<typeof payLinkTokenPayloadSchema>;
