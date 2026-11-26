import type { MandateMailScheme } from "../../mandate-to-sign-wording.js";

/**
 * Les textes des e-mails **de la facturation et du prélèvement** : la facture
 * émise, l'avis de prélèvement, le mandat à signer.
 */

/** Ce que l'avis de prélèvement annonce. Recopié ici pour que le dictionnaire ne lise pas le gabarit. */
export type CollectionNoticeKind = "notice" | "correction" | "cancellation";

/**
 * **« Votre facture FA-… »** (plan `facture-emise.md` ;
 * rangé au dictionnaire le 2026-10-09, suite (c)). Les valeurs — dates,
 * période, montant, moyen de paiement — arrivent déjà mises en forme par la
 * comptabilité, en français : seuls les mots du gabarit se traduisent ici.
 */
export interface InvoiceIssuedCopy {
  /** Le sous-titre du bandeau d'en-tête, sous l'enseigne — rendu en capitales. */
  readonly kicker: string;
  /** `{number}` — « Votre facture FA-LFD-2026-000001 ». */
  readonly title: string;
  /** `{title}`, `{seller}`. */
  readonly subject: string;
  readonly greeting: string;
  /** `{seller}`, `{number}`, `{buyer}`, `{period}` (la clause, ou vide), `{total}`. */
  readonly intro: string;
  /** `{period}` — « pour les commandes du 5 au 11 octobre 2026 », précédée d’une espace. */
  readonly periodClause: string;
  readonly attachedNote: string;
  readonly invoiceLabel: string;
  readonly dateLabel: string;
  readonly periodLabel: string;
  readonly addressedToLabel: string;
  readonly dueLabel: string;
  readonly paymentLabel: string;
  /**
   * `{due}`, `{number}` (la référence à reporter) — la ligne « Règlement » d'une facture au
   * virement. Ni IBAN ni BIC : les coordonnées ne figurent que sur la facture
   * jointe (décidé par Hugo le 2026-11-12), jamais dans les données d'un
   * e-mail, donc ni dans la boîte d'envoi ni dans le suivi.
   */
  readonly bankTransfer: string;
  /**
   * `{days}` — l'échéance d'une facture d'organisme public : le délai légal
   * court à compter du dépôt sur Chorus Pro, aucune date n'est connue à
   * l'émission (plan `plan-clients-publics-chorus.md`, T1″).
   */
  readonly publicDue: string;
  /** `{number}` — la ligne « Règlement » d'une facture d'organisme public, sans date. */
  readonly publicBankTransfer: string;
  readonly totalLabel: string;
  readonly cta: string;
  readonly footer: string;
}

/**
 * **L'avis de prélèvement** (pré-notification SEPA) — premier avis,
 * rectificatif ou annulation. Les montants et les jours arrivent déjà en
 * toutes lettres.
 */
export interface CollectionNoticeCopy {
  /** Le sous-titre du bandeau d'en-tête, sous l'enseigne — rendu en capitales. */
  readonly kicker: string;
  /** Le titre, qui est aussi le début de l'objet, selon ce que l'avis annonce. */
  readonly title: Readonly<Record<CollectionNoticeKind, string>>;
  /** `{title}`, `{creditor}`, `{day}`. */
  readonly subject: string;
  readonly greeting: string;
  /** L'annulation : `{amount}`, `{day}`, `{debtor}`. */
  readonly cancelled: string;
  /** En tête d'un rectificatif. */
  readonly correctionLead: string;
  /** Une nouvelle présentation d'un rejet : `{day}`, le jour du rejet. */
  readonly representationLead: string;
  /** `{creditor}`, `{amount}`, `{debtor}`, `{day}`, `{pieces}` (l'une des trois clauses qui suivent). */
  readonly announced: string;
  /** `{statement}`. */
  readonly piecesStatement: string;
  /** `{number}`. */
  readonly piecesOneInvoice: string;
  /** `{numbers}`, déjà séparés par des virgules. */
  readonly piecesInvoices: string;
  readonly creditorLabel: string;
  readonly creditorIdentifierLabel: string;
  readonly mandateReferenceLabel: string;
  readonly cancelledAmountLabel: string;
  readonly announcedDayLabel: string;
  readonly previousLabel: string;
  /** `{amount}`, `{day}` — ce qu'annonçait l'avis précédent. */
  readonly previousValue: string;
  readonly collectionDayLabel: string;
  readonly representationLabel: string;
  readonly statementLabel: string;
  readonly invoiceLabel: string;
  readonly invoicesLabel: string;
  readonly amountLabel: string;
  readonly footer: string;
}

/** Ce qui change d'un schéma SEPA à l'autre dans le courriel du mandat. */
export interface MandateSchemeCopy {
  /** Le nom du document, en minuscules : il se glisse dans l'objet, le titre et le corps. */
  readonly documentName: string;
  readonly footer: string;
}

/**
 * **Le mandat de prélèvement à signer.** Le texte qui dépend du schéma est
 * indexé par lui : ajouter un schéma sans son texte ne compile pas. Même
 * vocabulaire que le formulaire joint (`sepa-mandate-wording.ts`) — c'est le
 * papier qui fait foi.
 */
export interface MandateToSignCopy {
  /** Le sous-titre du bandeau d'en-tête, sous l'enseigne — rendu en capitales. */
  readonly kicker: string;
  readonly scheme: Readonly<Record<MandateMailScheme, MandateSchemeCopy>>;
  /** `{document}`, `{ref}` (la RUM). */
  readonly subject: string;
  /** `{document}`. */
  readonly title: string;
  readonly greeting: string;
  /** `{document}`, `{company}`. */
  readonly intro: string;
  readonly mandateReferenceLabel: string;
  readonly creditorIdentifierLabel: string;
  readonly creditorLabel: string;
}

/**
 * **« Devis D-… »** — le devis de période d'un organisme public (plan
 * `plan-clients-publics-chorus.md`, § 6 sexies, QD4). Le numéro, la période
 * et le montant arrivent mis en forme par la comptabilité.
 */
export interface PeriodQuoteCopy {
  /** Le sous-titre du bandeau d'en-tête, sous l'enseigne — rendu en capitales. */
  readonly kicker: string;
  /** `{number}` — « Devis D-20261031-1 ». */
  readonly title: string;
  /** `{title}`, `{seller}`. */
  readonly subject: string;
  readonly greeting: string;
  /** `{seller}`, `{number}`, `{buyer}`, `{period}`, `{total}`. */
  readonly intro: string;
  /** Qu'un devis n'est pas une facture. */
  readonly notAnInvoice: string;
  /** Ce que l'organisme renvoie : son numéro d'engagement. */
  readonly returnRequest: string;
  readonly quoteLabel: string;
  readonly versionLabel: string;
  readonly periodLabel: string;
  readonly addressedToLabel: string;
  readonly serviceCodeLabel: string;
  readonly totalLabel: string;
  readonly footer: string;
}

/**
 * **« Récapitulatif des BL »** — à la place de la facture d'un de nos
 * restaurants, les quantités remises sur un mois, sans montant
 * (`restaurants-maison.md`). Le PDF est joint.
 */
export interface InHouseRecapCopy {
  /** Le sous-titre du bandeau d'en-tête, sous l'enseigne — rendu en capitales. */
  readonly kicker: string;
  /** `{number}` — « Récapitulatif des BL RBL-202611-0001 ». */
  readonly title: string;
  /** `{title}`, `{period}`. */
  readonly subject: string;
  readonly greeting: string;
  /** `{company}`, `{period}`. */
  readonly intro: string;
  /** `{replaced}` : le numéro du récapitulatif que celui-ci remplace. */
  readonly rectification: string;
  /** Qu'il n'appelle aucun paiement. */
  readonly internalNote: string;
  readonly recapLabel: string;
  readonly periodLabel: string;
  readonly footer: string;
}

/** La famille « facturation et prélèvement », une section par clé du registre. */
export interface BillingMailsCopy {
  readonly "customer.invoice-issued": InvoiceIssuedCopy;
  readonly "customer.period-quote": PeriodQuoteCopy;
  readonly "customer.in-house-recap": InHouseRecapCopy;
  readonly "customer.collection-notice": CollectionNoticeCopy;
  readonly "customer.mandate-to-sign": MandateToSignCopy;
}
