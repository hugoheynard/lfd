import { z } from "zod";

/**
 * **La mention d'une option sur une ligne** (« dont 2 tranchés »,
 * `documentation/catalogue/plan-options-de-commande.md`, § 3.4) — telle que
 * le fournil, le colisage et le bon de livraison l'affichent : le nom du
 * groupe, le libellé du choix, et combien d'unités de la ligne le portent.
 * Au poids, `quantity` est celle de toute la ligne (des grammes) : l'écran
 * dit alors « tranché » sans compte. Aucun montant : les options sont
 * gratuites.
 */
export interface LineOptionMention {
  readonly groupName: string;
  readonly choiceLabel: string;
  readonly quantity: number;
}

export const lineOptionMentionSchema = z.object({
  groupName: z.string().min(1),
  choiceLabel: z.string().min(1),
  quantity: z.number().int().positive(),
});
