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
