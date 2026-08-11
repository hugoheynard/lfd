import { z } from "zod";

/**
 * Le **garde-fou de saisie** du panier : ce qu'on dit au client **avant** qu'il
 * commande, ligne par ligne.
 *
 * Une lecture pure — elle ne persiste rien, ne notifie personne, et ne crée
 * aucune alerte au journal. C'est le même code de détection que l'évaluation
 * post-commande, appelé une seconde fois : deux implémentations du même seuil
 * finiraient par ne plus dire la même chose, et c'est le client qui verrait la
 * différence.
 */

/** Une ligne de panier soumise au contrôle. Ni prix ni nom : le serveur ne les croit pas. */
export const orderPreflightLineSchema = z.object({
  sku: z.string().min(1),
  quantity: z.number().int().positive(),
});

/**
 * Le panier soumis. `companyId` peut être `null` — une commande zéro friction
 * n'appartient à aucun compte, donc il n'existe aucun historique auquel la
 * comparer : la réponse est alors vide, et c'est normal.
 *
 * Le nombre de lignes est borné : ce point d'entrée est ouvert à tout client
 * connecté, et sans plafond un panier fabriqué ferait travailler la base autant
 * qu'on veut.
 */
export const orderPreflightPayloadSchema = z.object({
  companyId: z.string().min(1).nullable(),
  lines: z.array(orderPreflightLineSchema).max(200),
});
export type OrderPreflightPayload = z.infer<typeof orderPreflightPayloadSchema>;

/**
 * Un avertissement rattaché à **une ligne** : l'affichage se colle sous elle,
 * donc le SKU est ce qui les relie.
 *
 * Le message est écrit **pour le client** — jamais la formulation staff, qui
 * parle d'écarts en pourcentage et de fenêtres de commandes.
 */
export interface OrderPreflightWarning {
  readonly sku: string;
  readonly message: string;
}

/** Ce que le contrôle rend : au plus un avertissement par ligne. */
export interface OrderPreflightView {
  readonly warnings: readonly OrderPreflightWarning[];
}
