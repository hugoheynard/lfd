import { z } from "zod";

/**
 * Contrat de fil du contexte **commerce** — les taux de TVA.
 *
 * Un taux, c'est un nom et un taux. Le handle de collection Shopify n'y
 * figure plus : c'est du vocabulaire de canal, dérivé par le canal.
 */
export const tvaRatePayloadSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  percent: z.number().positive(),
});
export type TvaRatePayload = z.infer<typeof tvaRatePayloadSchema>;

/**
 * Combien de familles visent ce taux, par mode de vente.
 *
 * C'est la donnée qui **protège la suppression** : la base pose un `Restrict`
 * sur les deux relations, donc supprimer un taux visé échoue — l'écran doit
 * le dire AVANT, pas laisser l'erreur de clé étrangère l'apprendre.
 */
export interface TvaRateUsageView {
  readonly emporter: number;
  readonly surPlace: number;
}

/** Vue d'un taux de TVA telle que l'API la rend. */
export interface TvaRateView {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  /** Taux en pourcentage : 5.5, 10, 20. */
  readonly percent: number;
  /** Ce qui s'y rattache dans le PIM — un compte, pas un état de l'agrégat. */
  readonly usage: TvaRateUsageView;
}
