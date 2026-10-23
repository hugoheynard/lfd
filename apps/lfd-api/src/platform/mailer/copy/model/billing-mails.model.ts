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

/** La famille « facturation et prélèvement », une section par clé du registre. */
export interface BillingMailsCopy {
  readonly "customer.invoice-issued": InvoiceIssuedCopy;
  readonly "customer.collection-notice": CollectionNoticeCopy;
  readonly "customer.mandate-to-sign": MandateToSignCopy;
}
