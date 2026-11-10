import type { SepaScheme } from "../value-objects/sepa-scheme.js";

/**
 * **Ce que le formulaire de mandat DIT**, pour un schéma donné.
 *
 * Sorti du rendu pour une raison : le texte d'un mandat change avec le schéma,
 * et le garder à côté des coordonnées le laissait vivre loin de ce qui le
 * commande. Depuis le 2026-09-15, chaque schéma a aussi SA mise en page
 * (`core-mandate-pdf.ts`, `b2b-mandate-pdf.ts`) : chacune ne lit que les champs
 * qu'elle imprime, et un champ sans objet pour un schéma y vaut `null`.
 */
export interface SepaMandateWording {
  /** Le titre d'un mandat émis — celui qui porte une RUM et se signe. */
  readonly issuedTitle: string;
  /** Le titre de l'exemplaire non émis, filigrané EXEMPLE. */
  readonly sampleTitle: string;
  /** Le libellé des métadonnées du fichier (`Title`). */
  readonly documentLabel: string;
  /**
   * La cellule de titre au-dessus du peigne de la RUM — propre à la mise en
   * page EPC. `null` en interentreprises : le gabarit DGFiP n'en a pas.
   */
  readonly headerCell: string | null;
  /**
   * Les paragraphes en romain qui suivent la phrase d'autorisation — celle-ci
   * reste dessinée par chaque rendu, parce qu'elle intercale le nom du créancier.
   */
  readonly authorizationTerms: readonly string[];
  /**
   * Ce que le débiteur **abandonne**, en gras à la suite des termes.
   * `null` en CORE : le débiteur n'y abandonne rien.
   */
  readonly refundWaiver: string | null;
  /**
   * La consigne de transmettre le mandat à sa banque — le bandeau du gabarit
   * interentreprises. `null` en CORE : la banque du débiteur n'y exige aucune
   * déclaration.
   */
  readonly bankDeclaration: string | null;
}

/**
 * Le texte du formulaire, **indexé par le schéma** : ajouter un schéma à
 * `SepaScheme` sans écrire son texte ne compile pas.
 */
export const SEPA_MANDATE_WORDING: Readonly<Record<SepaScheme, SepaMandateWording>> = {
  /**
   * CORE — le texte d'origine du formulaire, restauré au mot près depuis
   * `dfeca850^` (2026-09-15) : droit au remboursement, 8 semaines, 13 mois.
   */
  CORE: {
    issuedTitle: "MANDAT DE PRÉLÈVEMENT SEPA",
    sampleTitle: "MANDAT SEPA (exemple - document non contractuel)",
    headerCell: "MANDAT de Prélèvement SEPA",
    documentLabel: "Mandat SEPA",
    authorizationTerms: [
      "Vous bénéficiez du droit d'être remboursé par votre banque selon les conditions décrites dans la convention que vous avez passée avec elle.",
      "Une demande de remboursement doit être présentée :",
      "- dans les 8 semaines suivant la date de débit de votre compte pour un prélèvement autorisé,",
      "- sans tarder et au plus tard dans les 13 mois en cas de prélèvement non autorisé.",
    ],
    refundWaiver: null,
    bankDeclaration: null,
  },
  /**
   * Interentreprises — le texte du mandat interentreprises de la DGFiP
   * (`mandat_prelevement_sepa_interentreprise.pdf`, fourni par Hugo le
   * 2026-09-15), au mot près, le créancier imprimé à la place de la DGFiP.
   *
   * ⚠️ Il remplace le libellé écrit le 2026-09-14 d'après la todo
   * (`todo-mandat-core-contre-b2b.md`), qui n'avait été confronté à aucun modèle
   * réel. Celui-ci est un formulaire en usage ; la Caisse d'Épargne reste libre
   * d'en exiger un autre.
   */
  B2B: {
    issuedTitle: "MANDAT DE PRÉLÈVEMENT SEPA INTERENTREPRISES",
    sampleTitle: "MANDAT SEPA INTERENTREPRISES (exemple - document non contractuel)",
    headerCell: null,
    documentLabel: "Mandat SEPA interentreprises",
    authorizationTerms: ["Ce mandat est dédié aux prélèvements SEPA interentreprises."],
    refundWaiver:
      "Vous n'êtes pas en droit de demander à votre banque le remboursement d'un prélèvement " +
      "SEPA interentreprises une fois que le montant est débité de votre compte. Vous pouvez " +
      "cependant demander à votre banque de ne pas débiter votre compte jusqu'au jour de " +
      "l'échéance.",
    bankDeclaration:
      "Vous devez compléter et signer ce mandat puis le transmettre à votre établissement " +
      "bancaire. Assurez-vous que votre établissement bancaire a enregistré la RUM ci-dessous " +
      "avant tout premier paiement sur le compte désigné.",
  },
};
