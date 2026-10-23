import {
  SPECIMEN_MARK,
  SPECIMEN_PDF_BASE64,
  SPECIMEN_URL,
  type MailSpecimens,
} from "./mail-specimen.types.js";

/** Les exemples des e-mails du compte client, de la facturation et du prélèvement. */

const COMPANY = `${SPECIMEN_MARK} — Hôtel des Trois Ponts`;
const LEGAL_NAME = `${SPECIMEN_MARK} — SAS des Trois Ponts`;
const CREDITOR = `${SPECIMEN_MARK} — CRAZEATIVITY`;
const CREDITOR_ID = "FR00ZZZ000000";
const MANDATE = `${SPECIMEN_MARK}-RUM-0001`;
const INVOICE = `${SPECIMEN_MARK}-FA-0001`;
const SITE = `${SPECIMEN_MARK} — Chalet Gentiane`;
const TICKET_URL = `${SPECIMEN_URL}/mot-de-passe`;

export const CUSTOMER_SPECIMENS: Pick<
  MailSpecimens,
  | "customer.collection-notice"
  | "customer.invoice-issued"
  | "customer.mandate-to-sign"
  | "customer.sub-account-activity"
  | "customer.sub-account-gesture"
  | "customer.access-opened"
  | "customer.company-attached"
  | "customer.login-method-linked"
  | "customer.password-reset"
> = {
  "customer.collection-notice": {
    family: "billing",
    data: () => ({
      kind: "notice",
      creditorName: CREDITOR,
      creditorIdentifier: CREDITOR_ID,
      debtorName: LEGAL_NAME,
      amount: "1 234,56 €",
      collectionDay: "jeudi 15 octobre 2026",
      mandateReference: MANDATE,
      statementReference: `${SPECIMEN_MARK}-ARR-0001`,
      invoiceNumbers: [],
      representedRejectionDay: null,
      previous: null,
    }),
  },
  "customer.invoice-issued": {
    family: "billing",
    data: (locale) => ({
      invoiceNumber: INVOICE,
      sellerName: CREDITOR,
      buyerName: LEGAL_NAME,
      issuedOn: "mercredi 30 septembre 2026",
      period: "du 21 au 27 septembre 2026",
      total: "1 234,56 €",
      dueOn: "jeudi 15 octobre 2026",
      paymentMeans: `Prélèvement SEPA — mandat ${MANDATE}`,
      invoicesUrl: `${SPECIMEN_URL}/mes-factures`,
      document: { fileName: `${INVOICE}.pdf`, pdfBase64: SPECIMEN_PDF_BASE64 },
      locale,
    }),
  },
  "customer.mandate-to-sign": {
    family: "billing",
    data: () => ({
      scheme: "CORE",
      companyName: COMPANY,
      reference: MANDATE,
      creditorIdentifier: CREDITOR_ID,
      creditorName: CREDITOR,
      pdfBase64: SPECIMEN_PDF_BASE64,
      fileName: `mandat-${MANDATE}.pdf`,
    }),
  },
  "customer.sub-account-activity": {
    family: "account",
    data: () => ({
      activity: "placed",
      siteName: SITE,
      orderNumber: `${SPECIMEN_MARK}-0001`,
      totalCents: 12_345,
      requestedFor: "2026-10-13",
      enteredByTeam: false,
    }),
  },
  "customer.sub-account-gesture": {
    family: "account",
    data: () => ({
      gesture: "problem_reported",
      siteName: SITE,
      reference: `${SPECIMEN_MARK}-0001`,
      byTeam: false,
    }),
  },
  "customer.access-opened": {
    family: "account",
    data: () => ({
      firstName: SPECIMEN_MARK,
      companyName: COMPANY,
      email: "exemple@exemple.invalid",
      signInUrl: `${SPECIMEN_URL}/connexion`,
      passwordSetupUrl: TICKET_URL,
    }),
  },
  "customer.company-attached": {
    family: "account",
    data: () => ({ firstName: SPECIMEN_MARK, companyName: COMPANY }),
  },
  "customer.login-method-linked": {
    family: "account",
    data: () => ({ firstName: SPECIMEN_MARK, methodLabel: "Google" }),
  },
  "customer.password-reset": {
    family: "account",
    data: () => ({ passwordSetupUrl: TICKET_URL }),
  },
};
