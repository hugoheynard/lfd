import { z } from "zod";

/**
 * Contrat de fil des **réglages d'entreprise** éditables en cours d'onboarding :
 * l'identité « souple » (enseigne + n° de TVA) et la condition de règlement
 * **souhaitée**.
 */

/**
 * Les moyens de règlement sont **cumulatifs**, pas exclusifs.
 *
 * Payer **à la commande** est toujours possible : c'est le socle, offert à tout
 * le monde, et ce n'est pas une condition de règlement — c'est l'absence de
 * crédit. Un `DeferredTerm` est un crédit qu'on **accorde** : la société règle
 * plus tard, et le commercial le débloque société par société.
 *
 * Les modéliser comme une seule valeur (`per_order | monthly | …`) faisait du
 * déblocage un remplacement : accorder le mensuel retirait la carte. Or un
 * client au mensuel doit pouvoir régler une commande ponctuelle à part.
 */
/**
 * **Un seul terme aujourd'hui : le mensuel.** 60 et 90 jours ont été retirés —
 * ils n'étaient adossés à aucune mécanique (ni facture, ni échéance, ni
 * prélèvement) et promettaient donc un crédit que l'application ne savait pas
 * recouvrer. Le jour où d'autres termes reviendront, ils viendront de la DONNÉE
 * (une page de réglages facturation), pas d'une constante gravée ici.
 */
export const deferredTermSchema = z.enum(["monthly"]);
export type DeferredTerm = z.infer<typeof deferredTermSchema>;

/**
 * La **seule** traduction des termes, partagée par les deux frontends — mêmes
 * raisons que pour les rôles : les valeurs vivent en anglais, le français ne
 * vit qu'à l'écran.
 */
export const DEFERRED_TERM_LABELS: Readonly<Record<DeferredTerm, string>> = {
  monthly: "Mensuel",
};

/**
 * Comment une commande se règle **en fait**.
 *
 * `account` = portée au compte, facturée au terme accordé ; `card` = payée tout
 * de suite. Quand un terme est accordé, `account` est le **défaut** — c'est le
 * régime négocié —, et le client garde la possibilité de régler une commande
 * ponctuelle par carte.
 */
export const settlementSchema = z.enum(["account", "card"]);
export type Settlement = z.infer<typeof settlementSchema>;

/**
 * Édition de l'identité : l'enseigne (nom commercial), le n° de TVA
 * intracommunautaire, et l'identité **légale** (raison sociale, forme juridique,
 * SIRET, SIREN).
 *
 * La même charge sert deux écritures, et le vide y veut dire la même chose —
 * « ne réécrit rien » : le client **complète** ce qui manque, le back-office
 * **corrige**. Un écran encore ouvert sur un bundle qui n'envoie pas `siren`
 * n'efface donc rien (plan-mentions-obligatoires-du-mandat §9).
 */
export const updateIdentityPayloadSchema = z.object({
  enseigne: z.string().default(""),
  vatNumber: z.string().default(""),
  /**
   * Identité légale. Un compte peut s'ouvrir sans papiers (le commercial est
   * chez le client), et ils arrivent ensuite. Côté client, un champ déjà
   * renseigné est ignoré : on comble un trou. Côté back-office, un champ
   * renseigné **réécrit** — c'est la correction d'une faute de saisie, que seul
   * le staff peut faire (`Company.correctLegalIdentity`, vérifié le 2026-09-15).
   */
  raisonSociale: z.string().default(""),
  formeJuridique: z.string().default(""),
  siret: z.string().default(""),
  /**
   * SIREN de l'entreprise. Vide = « ne réécrit rien ». Un SIRET dont le préfixe
   * est un SIREN valide le fixe côté serveur ; un SIREN qui le contredit est
   * refusé.
   */
  siren: z.string().default(""),
});
export type UpdateIdentityPayload = z.infer<typeof updateIdentityPayloadSchema>;

/**
 * Terme **souhaité** par le client. C'est une demande : le commercial l'accorde
 * ou non. On enregistre le choix, pas un droit acquis.
 */
export const updatePaymentTermPayloadSchema = z.object({
  paymentTerm: deferredTermSchema,
});
export type UpdatePaymentTermPayload = z.infer<typeof updatePaymentTermPayloadSchema>;

/**
 * Ce que le staff **accorde** à une société : la liste des termes débloqués.
 *
 * Une liste et non un ajout/retrait : l'écran montre des interrupteurs, et
 * envoyer l'état complet évite qu'un double clic laisse la fiche et la base en
 * désaccord.
 */
export const grantTermsPayloadSchema = z.object({
  grantedTerms: z.array(deferredTermSchema),
});
export type GrantTermsPayload = z.infer<typeof grantTermsPayloadSchema>;

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
