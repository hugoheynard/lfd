import { z } from "zod";

/**
 * **Ajustement de panier** — un montant en **pourcentage** ou en **€ fixe**,
 * réutilisé par la remise d'un point de retrait et par le frais d'une zone de
 * livraison. Entiers uniquement sur le fil (jamais de flottant) :
 * - `percent` → `bp` en **points de base** (2000 = 20,00 %) ;
 * - `amount` → `cents` en **centimes** HT (2000 = 20,00 €).
 */
export const cartAdjustmentSchema = z.discriminatedUnion("mode", [
  z.object({
    mode: z.literal("percent"),
    bp: z.number().int().min(0).max(10000),
  }),
  z.object({
    mode: z.literal("amount"),
    cents: z.number().int().min(0),
  }),
]);
export type CartAdjustment = z.infer<typeof cartAdjustmentSchema>;

/** Applique un ajustement à un sous-total (centimes) → le montant en centimes
 *  (arrondi au centime le plus proche pour un pourcentage). Jamais négatif. */
export function cartAdjustmentCents(adjustment: CartAdjustment, subtotalCents: number): number {
  if (adjustment.mode === "amount") {
    return Math.max(0, adjustment.cents);
  }
  return Math.max(0, Math.round((subtotalCents * adjustment.bp) / 10000));
}

/**
 * Une **remise**, bornée à ce qu'elle remise.
 *
 * 🔴 Distinct de {@link cartAdjustmentCents}, et la distinction est tout
 * l'objet : **des frais ne sont pas une remise**. Le coursier peut légitimement
 * coûter plus cher qu'un petit panier — douze euros de course sur dix euros de
 * marchandise est une commande ordinaire, pas une anomalie. Une remise, non :
 * au-delà du sous-total, elle rendrait une assiette négative, c'est-à-dire un
 * avoir déguisé en commande.
 *
 * La borne ne mordait nulle part **en pourcentage** — `bp` est plafonné à
 * 10 000 par le schéma, donc un taux ne peut pas dépasser son assiette. Elle
 * mord en **montant fixe**, où rien ne l'empêchait : un point de retrait qui
 * remise 50 € sur un panier de 10 € enregistrait une remise de 50 € à côté d'un
 * sous-total de 10 € et d'un total plancher. La ligne ne s'additionnait pas, et
 * elle contredisait le devis — que `ventilateVat` bornait déjà de son côté.
 *
 * Elle est ici plutôt que dans l'agrégat parce que **les deux surfaces la
 * demandent** : le devis de la boutique et la caisse. Une borne posée d'un seul
 * côté est précisément l'écart qu'on referme.
 */
export function discountCentsOf(adjustment: CartAdjustment, subtotalCents: number): number {
  return Math.min(cartAdjustmentCents(adjustment, subtotalCents), Math.max(0, subtotalCents));
}
