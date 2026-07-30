import { z } from "zod";

/**
 * Contrat de fil des **réglages d'entreprise** éditables en cours d'onboarding :
 * l'identité « souple » (enseigne + n° de TVA) et la condition de règlement
 * **souhaitée**.
 */

/** Condition de règlement (aligné sur l'enum Prisma `PaymentTerm`). */
export const paymentTermSchema = z.enum(["per_order", "monthly", "net60", "net90"]);
export type PaymentTerm = z.infer<typeof paymentTermSchema>;

/**
 * Édition de l'identité **souple** : l'enseigne (nom commercial) et le n° de TVA
 * intracommunautaire. La raison sociale, la forme juridique et le SIRET (identité
 * légale) restent fixés à la création — les changer, c'est une autre société.
 */
export const updateIdentityPayloadSchema = z.object({
  enseigne: z.string().default(""),
  tvaIntracom: z.string().default(""),
});
export type UpdateIdentityPayload = z.infer<typeof updateIdentityPayloadSchema>;

/**
 * Condition de règlement **souhaitée** par le client. C'est une demande : le
 * commercial la valide à l'activation. On enregistre le choix, pas un droit acquis.
 */
export const updatePaymentTermPayloadSchema = z.object({
  paymentTerm: paymentTermSchema,
});
export type UpdatePaymentTermPayload = z.infer<typeof updatePaymentTermPayloadSchema>;
