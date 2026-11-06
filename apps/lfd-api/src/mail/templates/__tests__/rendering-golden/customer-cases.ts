import type { B2bMails } from "../../mail-templates.js";
import type { MailCases } from "./mail-cases.type.js";

/** Les cas des e-mails du compte client, de la facturation et du prélèvement. */

const NOTICE: B2bMails["customer.collection-notice"] = {
  kind: "notice",
  creditorName: "CRAZEATIVITY",
  creditorIdentifier: "FR00ZZZ900001",
  debtorName: "SAS des Trois Ponts",
  amount: "1 234,56 €",
  collectionDay: "jeudi 15 octobre 2026",
  mandateReference: "LFC-RUM-1",
  statementReference: "ARR-2026-10",
  invoiceNumbers: [],
  representedRejectionDay: null,
  previous: null,
};

const INVOICE: B2bMails["customer.invoice-issued"] = {
  invoiceNumber: "FA-LFD-2026-000001",
  sellerName: "CRAZEATIVITY",
  buyerName: "SAS des Trois Ponts",
  issuedOn: "mercredi 30 septembre 2026",
  period: "du 5 au 11 octobre 2026",
  total: "1 234,56 €",
  dueOn: "jeudi 15 octobre 2026",
  paymentMeans: "Prélèvement SEPA — mandat RUM-1",
  invoicesUrl: "https://shop.lfc.test/mes-factures",
  document: { fileName: "FA-LFD-2026-000001.pdf", pdfBase64: "JVBERi0=" },
  locale: "fr",
};

export const CUSTOMER_CASES: Pick<
  MailCases,
  | "customer.collection-notice"
  | "customer.invoice-issued"
  | "customer.mandate-to-sign"
  | "customer.sub-account-activity"
  | "customer.sub-account-gesture"
  | "customer.access-opened"
  | "customer.company-attached"
  | "customer.order-placed-with-your-email"
  | "customer.login-method-linked"
  | "customer.password-reset"
> = {
  "customer.collection-notice": {
    statement: NOTICE,
    oneInvoice: { ...NOTICE, invoiceNumbers: ["FA-1"] },
    correctionRepresented: {
      ...NOTICE,
      kind: "correction",
      invoiceNumbers: ["FA-1", "FA-2"],
      representedRejectionDay: "lundi 5 octobre 2026",
      previous: { amount: "1 000,00 €", collectionDay: "mardi 13 octobre 2026" },
    },
    cancellation: { ...NOTICE, kind: "cancellation", statementReference: "" },
  },
  "customer.invoice-issued": {
    full: INVOICE,
    bare: { ...INVOICE, period: null, paymentMeans: null, invoicesUrl: "", document: null },
  },
  "customer.mandate-to-sign": {
    core: {
      scheme: "CORE",
      companyName: "Refuge du Col",
      reference: "RUM-1",
      creditorIdentifier: "FR00ZZZ900001",
      creditorName: "CRAZEATIVITY",
      pdfBase64: "JVBERi0=",
      fileName: "mandat-RUM-1.pdf",
    },
    b2b: {
      scheme: "B2B",
      companyName: "Refuge du Col",
      reference: "RUM-1",
      creditorIdentifier: "FR00ZZZ900001",
      creditorName: "CRAZEATIVITY",
      pdfBase64: "JVBERi0=",
      fileName: "mandat-RUM-1.pdf",
    },
  },
  "customer.sub-account-activity": {
    placed: {
      activity: "placed",
      siteName: "Chalet Gentiane",
      orderNumber: "ORD-1",
      totalCents: 12_345,
      requestedFor: "2026-10-13",
      enteredByTeam: false,
    },
    cancelledByTeam: {
      activity: "cancelled",
      siteName: "Chalet Gentiane",
      orderNumber: "ORD-1",
      totalCents: null,
      requestedFor: null,
      enteredByTeam: true,
    },
    abandoned: {
      activity: "abandoned",
      siteName: "Chalet",
      orderNumber: "ORD-2",
      totalCents: 0,
      requestedFor: "pas une date",
      enteredByTeam: false,
    },
    paymentFailed: {
      activity: "payment_failed",
      siteName: "Chalet",
      orderNumber: "ORD-3",
      totalCents: 100,
      requestedFor: "2026-10-14",
      enteredByTeam: true,
    },
  },
  "customer.sub-account-gesture": {
    problem: {
      gesture: "problem_reported",
      siteName: "Chalet",
      reference: "ORD-1",
      byTeam: false,
    },
    problemByTeam: {
      gesture: "problem_reported",
      siteName: "Chalet",
      reference: "ORD-1",
      byTeam: true,
    },
    contactWithReference: {
      gesture: "contact_added",
      siteName: "Chalet",
      reference: "X-9",
      byTeam: true,
    },
    ...Object.fromEntries(
      (
        [
          "delivery_address_added",
          "delivery_address_updated",
          "delivery_address_removed",
          "default_delivery_set",
          "contact_added",
          "contact_updated",
          "contact_removed",
          "primary_contact_changed",
          "bank_account_changed",
          "mandate_proof_attached",
          "subscription_created",
          "subscription_paused",
          "subscription_resumed",
          "subscription_stopped",
        ] as const
      ).map((gesture) => [
        gesture,
        { gesture, siteName: "Chalet", reference: null, byTeam: false },
      ]),
    ),
  },
  "customer.access-opened": {
    code: {
      firstName: "Jeanne",
      companyName: "Hôtel des Trois Ponts",
      email: "jeanne@example.test",
      signInUrl: "https://shop.lfc.test/connexion/code",
      passwordSetupUrl: "https://auth.test/ticket",
    },
    passwordOnly: {
      firstName: "",
      companyName: "Hôtel des Trois Ponts",
      email: "jeanne@example.test",
      signInUrl: null,
      passwordSetupUrl: "https://auth.test/ticket",
    },
  },
  "customer.company-attached": {
    named: { firstName: "Jeanne", companyName: "Refuge du Col" },
    anonymous: { firstName: "", companyName: "Refuge du Col" },
  },
  "customer.order-placed-with-your-email": {
    named: { firstName: "Jeanne" },
    anonymous: { firstName: "" },
  },
  "customer.login-method-linked": {
    named: { firstName: "Jeanne", methodLabel: "Google" },
    anonymous: { firstName: "", methodLabel: "Facebook" },
  },
  "customer.password-reset": { only: { passwordSetupUrl: "https://auth.test/ticket" } },
};
