/**
 * Le schéma SEPA du mandat joint — recopié en littéraux, **pas importé** : le
 * mailer est une brique de `platform/`, qui ne connaît pas la comptabilité. Il
 * reçoit un `scheme`, il ne sait pas d'où il vient.
 */
export type MandateMailScheme = "CORE" | "B2B";

/** Ce qui change d'un schéma à l'autre dans le courriel. */
export interface MandateMailWording {
  /** Le nom du document, en minuscules : il se glisse dans l'objet, le titre et le corps. */
  readonly documentName: string;
  readonly footer: string;
}

/**
 * Le texte du courriel `customer.mandate-to-sign`, **indexé par le schéma du
 * mandat** (plan `documentation/b2b/plan-mandat-deux-schemas.md` §3.5) : ajouter
 * un schéma sans son texte ne compile pas.
 *
 * Même vocabulaire que le formulaire joint (`sepa-mandate-wording.ts`, vérifié
 * le 2026-09-15) : un courriel qui dirait « interentreprises » sur un papier
 * CORE ferait douter du papier — et c'est le papier qui fait foi.
 *
 * - **CORE** : ni « interentreprises », ni « aucun remboursement », ni consigne
 *   de déclaration — la banque d'un débiteur CORE n'en exige aucune, et le lui
 *   demander lui ferait faire une démarche pour rien.
 * - **B2B** : 🔴 la déclaration à la banque est une ÉTAPE, pas une remarque. La
 *   banque du débiteur refuse le premier prélèvement tant que le mandat ne lui a
 *   pas été déclaré — un client qui signe sans le faire croit avoir fini, et
 *   c'est le débit qui le lui apprend.
 */
export const MANDATE_TO_SIGN_WORDING: Readonly<Record<MandateMailScheme, MandateMailWording>> = {
  CORE: {
    documentName: "mandat de prélèvement SEPA",
    footer:
      "Ce mandat relève du schéma SEPA CORE. Vous bénéficiez du droit d'être remboursé par " +
      "votre banque selon les conditions décrites dans la convention que vous avez passée avec " +
      "elle : une demande de remboursement doit être présentée dans les 8 semaines suivant la " +
      "date de débit de votre compte pour un prélèvement autorisé.",
  },
  B2B: {
    documentName: "mandat de prélèvement SEPA interentreprises",
    footer:
      "Important : ce mandat relève du schéma SEPA interentreprises (B2B). Il est " +
      "destiné uniquement à des transactions interentreprises et ne donne droit à " +
      "aucun remboursement une fois votre compte débité. Avant le premier " +
      "prélèvement, déclarez-le à votre banque avec la référence du mandat et " +
      "l'identifiant du créancier ci-dessus — sans cette déclaration, votre banque " +
      "refusera le prélèvement.",
  },
};
