import type { SepaScheme } from "../value-objects/sepa-scheme.js";

/**
 * **Ce que le formulaire de mandat DIT**, pour un schéma donné.
 *
 * Sorti du rendu (`sepa-mandate-pdf.ts`) pour une raison : le texte d'un mandat
 * change avec le schéma, le dessin non. Les garder dans le même fichier laissait
 * le texte vivre à côté des coordonnées, loin de la constante qui le commande.
 */
export interface SepaMandateWording {
  /** Le titre d'un mandat émis — celui qui porte une RUM et se signe. */
  readonly issuedTitle: string;
  /** Le titre de l'exemplaire non émis, filigrané EXEMPLE. */
  readonly sampleTitle: string;
  /** La cellule de titre, dans le cadre, au-dessus du peigne de la RUM. */
  readonly headerCell: string;
  /** Le libellé des métadonnées du fichier (`Title`). */
  readonly documentLabel: string;
  /**
   * Les paragraphes qui suivent la phrase d'autorisation (A)/(B) — celle-ci est
   * commune aux deux schémas du modèle EPC et reste dessinée par le rendu, parce
   * qu'elle intercale le nom du créancier en italique.
   */
  readonly authorizationTerms: readonly string[];
  /** La consigne de déclaration à la banque, en gras sous l'autorisation. */
  readonly bankDeclaration: string;
}

/**
 * Le texte du formulaire, **indexé par le schéma** : ajouter un schéma à
 * `SepaScheme` sans écrire son texte ne compile pas.
 *
 * ## Interentreprises (B2B) — écrit le 2026-09-14
 *
 * Suit le modèle EPC du mandat interentreprises tel que
 * `documentation/todos/todo-mandat-core-contre-b2b.md` le décrit : la mention
 * « interentreprises » dans le titre, un mandat réservé aux transactions entre
 * entreprises, **aucun remboursement** d'un prélèvement autorisé une fois le
 * compte débité, la faculté de demander à sa banque de ne pas débiter avant
 * l'échéance, et la déclaration du mandat à sa banque.
 *
 * 🔴 **Le libellé exact n'a pas été confronté au modèle de la banque.** C'est la
 * version la plus fidèle à la todo, pas une copie certifiée : la Caisse
 * d'Épargne confirmera le formulaire qu'elle attend, et ce texte s'aligne
 * alors sur le sien, au mot près.
 *
 * ⚠️ Le paragraphe CORE a été retiré **entier**, « 8 semaines » ET « 13 mois ».
 * Le délai de 13 mois vise les opérations NON autorisées, pas le remboursement
 * d'un prélèvement autorisé : son retrait est à confirmer avec la banque (noté
 * dans la todo le 2026-09-14).
 */
export const SEPA_MANDATE_WORDING: Readonly<Record<SepaScheme, SepaMandateWording>> = {
  B2B: {
    issuedTitle: "MANDAT DE PRÉLÈVEMENT SEPA INTERENTREPRISES",
    sampleTitle: "MANDAT SEPA INTERENTREPRISES (exemple - document non contractuel)",
    headerCell: "MANDAT de Prélèvement SEPA interentreprises",
    documentLabel: "Mandat SEPA interentreprises",
    authorizationTerms: [
      "Ce mandat est destiné uniquement à des transactions interentreprises.",
      "Vous ne bénéficiez d'aucun droit à remboursement par votre banque une fois votre compte débité, " +
        "mais vous pouvez demander à votre banque de ne pas débiter votre compte jusqu'au jour où le " +
        "paiement est dû.",
    ],
    bankDeclaration:
      "Important : avant le premier prélèvement, déclarez ce mandat à votre banque en lui " +
      "communiquant la référence unique du mandat et l'identifiant du créancier. Sans cette " +
      "déclaration, votre banque refusera le prélèvement.",
  },
};
