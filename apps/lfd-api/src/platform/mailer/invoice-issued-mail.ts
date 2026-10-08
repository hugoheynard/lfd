import { sanitiseSubject, type LayoutInput, type LayoutRow, type RenderedMail } from "@lfd/mailer";

/**
 * Les données de l'e-mail **« Votre facture FA-… »** (plan
 * `documentation/facturation/plan-emission-de-la-facture.md`, E6, Q3).
 * Destinataires : le contact de facturation du payeur légal (sinon son
 * détenteur) et les rôles facturation des sous-comptes dont des bons
 * figurent sur la facture. Tout est déjà mis en forme : le gabarit ne
 * calcule rien.
 *
 * ⚠️ **Aucune pièce jointe** tant que le PDF/A-3 (E3b) n'existe pas : la
 * facture se consulte dans « Mes factures ». Le jour où le rendu existe,
 * l'abonné ajoutera `attachments` à l'envoi — le gabarit n'a rien à changer.
 */
export interface InvoiceIssuedMailData {
  readonly invoiceNumber: string;
  readonly sellerName: string;
  /** Le payeur légal — la société à qui la facture est adressée. */
  readonly buyerName: string;
  /** « mercredi 30 septembre 2026 ». */
  readonly issuedOn: string;
  /** « septembre 2026 » ; `null` hors facture du mois. */
  readonly period: string | null;
  /** « 1 234,56 € ». */
  readonly total: string;
  /** « jeudi 15 octobre 2026 ». */
  readonly dueOn: string;
  /** « Prélèvement SEPA — mandat RUM-… », ou `null` : aucun moyen figé sur la facture. */
  readonly paymentMeans: string | null;
  /** Le lien vers « Mes factures » ; vide quand l'origine de la boutique n'est pas connue. */
  readonly invoicesUrl: string;
}

/** La coquille client, prêtée par le registre. */
export type InvoiceShell = (input: Omit<LayoutInput, "brand" | "supportEmail">) => string;

/**
 * Le rendu, à part de `mail-templates.ts`. Sobre, en français : le numéro,
 * les dates, le montant, comment il sera réglé — ce qu'un service comptable
 * reporte sans ouvrir autre chose.
 */
export function renderInvoiceIssuedMail(
  data: InvoiceIssuedMailData,
  shell: InvoiceShell,
): RenderedMail {
  const title = `Votre facture ${data.invoiceNumber}`;
  return {
    subject: sanitiseSubject(`${title} — ${data.sellerName}`),
    html: shell({
      title,
      body: bodyOf(data),
      rows: rowsOf(data),
      ...(data.invoicesUrl === ""
        ? {}
        : { cta: { label: "Voir mes factures", url: data.invoicesUrl } }),
      footer:
        "Cette facture est consultable à tout moment dans votre espace client, rubrique « Mes factures ». " +
        "Pour toute question, répondez à ce message.",
    }),
  };
}

function bodyOf(data: InvoiceIssuedMailData): string {
  const period = data.period === null ? "" : ` pour les commandes de ${data.period}`;
  return (
    `Bonjour,\n\n${data.sellerName} a émis la facture ${data.invoiceNumber}` +
    ` adressée à ${data.buyerName}${period}, d'un montant de ${data.total} TTC.`
  );
}

function rowsOf(data: InvoiceIssuedMailData): readonly LayoutRow[] {
  return [
    { label: "Facture", value: data.invoiceNumber },
    { label: "Date", value: data.issuedOn },
    ...(data.period === null ? [] : [{ label: "Période", value: data.period }]),
    { label: "Adressée à", value: data.buyerName },
    { label: "Échéance", value: data.dueOn },
    ...(data.paymentMeans === null ? [] : [{ label: "Règlement", value: data.paymentMeans }]),
    { label: "Total TTC", value: data.total, strong: true },
  ];
}
