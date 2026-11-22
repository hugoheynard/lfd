import { z } from "zod";

/**
 * **« Rendu autrement »** — la FORME du corps (plan M2, §5.5) : un motif
 * écrit par l'équipe. Sa règle (1 à 500 caractères, une demande arrêtée)
 * est celle de l'agrégat `CardRefundRequest`, qui la refuse lui-même ; la
 * borne ici n'évite que de charger un corps démesuré.
 */
export const settleElsewherePayloadSchema = z.strictObject({
  reason: z.string().max(2_000),
});
export type SettleElsewherePayload = z.infer<typeof settleElsewherePayloadSchema>;
