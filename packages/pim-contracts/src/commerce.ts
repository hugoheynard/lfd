import { z } from "zod";

/**
 * Contrat de fil du contexte **commerce** — les régimes de TVA. Le `tag` (handle
 * Shopify) est dérivé du taux **côté serveur** : jamais dans le payload.
 */
export const tvaRegimePayloadSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  percent: z.number().positive(),
});
export type TvaRegimePayload = z.infer<typeof tvaRegimePayloadSchema>;

/** Vue d'un régime de TVA telle que l'API la rend. */
export interface TvaRegimeView {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  /** Taux en pourcentage : 5.5, 10, 20. */
  readonly percent: number;
  /** Handle Shopify dérivé du taux (`tva-5-5`) — unique. */
  readonly tag: string;
}
