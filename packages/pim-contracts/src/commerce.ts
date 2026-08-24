import { z } from "zod";

/**
 * Contrat de fil du contexte **commerce** — les taux de TVA.
 *
 * Un taux, c'est un nom et un taux. Le handle de collection Shopify n'y
 * figure plus : c'est du vocabulaire de canal, dérivé par le canal.
 */
export const vatRatePayloadSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  percent: z.number().positive(),
});
export type VatRatePayload = z.infer<typeof vatRatePayloadSchema>;

/**
 * Combien de familles visent ce taux, **par clé de contexte de vente**. Clé
 * absente = aucune, dans ce contexte.
 *
 * C'est la donnée qui **protège la suppression** : la base pose un `Restrict`
 * sur la jointure, donc supprimer un taux visé échoue — l'écran doit le dire
 * AVANT, pas laisser l'erreur de clé étrangère l'apprendre.
 *
 * Elle nommait deux modes et en oubliait un troisième : un taux que seule la
 * plateforme B2B visait s'affichait « 0 famille », donc supprimable, et la base
 * refusait après le clic. Une carte ne peut plus oublier un contexte.
 */
export type VatRateUsageView = Readonly<Record<string, number>>;

/** Vue d'un taux de TVA telle que l'API la rend. */
export interface VatRateView {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  /** Taux en pourcentage : 5.5, 10, 20. */
  readonly percent: number;
  /** Ce qui s'y rattache dans le PIM — un compte, pas un état de l'agrégat. */
  readonly usage: VatRateUsageView;
}
