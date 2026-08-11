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
  /**
   * Identité légale — envoyée seulement quand elle **manque** : un compte peut
   * s'ouvrir sans papiers (le commercial est chez le client), et ils arrivent
   * ensuite. Un champ déjà renseigné est ignoré côté serveur : on comble un
   * trou, on ne réécrit pas un SIRET.
   */
  raisonSociale: z.string().default(""),
  formeJuridique: z.string().default(""),
  siret: z.string().default(""),
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

/**
 * Le nom sous lequel une société **se reconnaît** : son enseigne, et à défaut sa
 * raison sociale.
 *
 * Les deux ne servent pas au même usage. L'enseigne est ce qui est écrit sur la
 * devanture, ce que le commercial a en tête et ce que le client dit au
 * téléphone ; la raison sociale est une donnée de greffe, qui n'apparaît que sur
 * les documents légaux. Un écran qui affiche la seconde là où l'humain attend la
 * première oblige à traduire mentalement à chaque ligne.
 *
 * C'est aussi ce qui permet d'ouvrir un compte sans les papiers : l'enseigne
 * suffit à nommer la société, la raison sociale arrive avec le SIRET.
 */
export function companyDisplayName(company: {
  readonly raisonSociale: string;
  readonly enseigne: string;
}): string {
  const enseigne = company.enseigne.trim();
  return enseigne === "" ? company.raisonSociale : enseigne;
}
