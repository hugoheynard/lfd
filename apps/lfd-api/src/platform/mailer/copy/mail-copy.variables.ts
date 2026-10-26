import type { MailCopy } from "./mail-copy.model.js";

/**
 * Les variables qu'un texte d'une section **peut** porter, par chemin dans la
 * section (`subject`, `title.paid`…). Un texte absent d'ici n'en porte aucune.
 */
export type MailSectionVariables = Readonly<Record<string, readonly string[]>>;

/** Une entrée par e-mail du registre — la carte est exhaustive, comme le dictionnaire. */
export type MailCopyVariables = { readonly [K in keyof MailCopy]: MailSectionVariables };

/**
 * **Les variables permises de chaque texte** (plan
 * `documentation/contenu-ecommerce/plan-textes-des-e-mails.md`, C5).
 *
 * Ce sont les valeurs que le gabarit passe à `fill` pour ce texte — la seule
 * liste qu'un texte réécrit a le droit d'employer : une variable que le
 * gabarit ne fournit pas resterait affichée telle quelle (`{ref}`) dans la
 * boîte du client. Les variables **obligatoires** ne s'écrivent pas ici :
 * ce sont celles que le texte français par défaut contient, et le manifeste
 * (`pnpm mail-copy:digest`) les en déduit.
 *
 * `mail-copy.spec.ts` refuse un texte qui emploie une variable non déclarée
 * ici, et un chemin déclaré qui n'existe plus au dictionnaire.
 */
export const MAIL_COPY_VARIABLES: MailCopyVariables = {
  "customer.order-placed": {
    subject: ["ref"],
    recapPieces: ["count"],
    recapDiscountBase: ["base"],
    qrAlt: ["ref"],
  },
  "customer.order-ready": {
    subject: ["ref"],
    piecesLabel: ["count"],
    qrAlt: ["ref"],
    subjectReminder: ["ref"],
    introReminder: ["site"],
    subjectRemainder: ["ref"],
  },
  "customer.delivery-en-route": {},
  "customer.order-delayed": { subject: ["ref"] },
  "customer.order-placed-with-your-email": { title: ["firstName"] },
  "customer.payment-failed": { subject: ["ref"] },
  "customer.payment-expired": { subject: ["ref"] },
  "customer.order-payment-link": { subject: ["ref"], intro: ["ref"] },
  "customer.order-cancelled": {
    subject: ["ref"],
    intro: ["ref", "day"],
    introWithoutDay: ["ref"],
    introBySelf: ["ref", "day"],
    introBySelfWithoutDay: ["ref"],
    introByMember: ["name", "company", "ref", "day"],
    introByMemberWithoutDay: ["name", "company", "ref"],
    introByPrincipal: ["name", "principal", "ref", "day"],
    introByPrincipalWithoutDay: ["name", "principal", "ref"],
    refundToCard: ["amount"],
    voucherReturned: ["value", "day"],
    voucherMerged: ["value", "day", "remainder"],
  },
  "customer.invoice-issued": {
    title: ["number"],
    subject: ["title", "seller"],
    intro: ["seller", "number", "buyer", "period", "total"],
    periodClause: ["period"],
  },
  "customer.collection-notice": {
    subject: ["title", "creditor", "day"],
    cancelled: ["amount", "day", "debtor"],
    representationLead: ["day"],
    announced: ["creditor", "amount", "debtor", "day", "pieces"],
    piecesStatement: ["statement"],
    piecesOneInvoice: ["number"],
    piecesInvoices: ["numbers"],
    previousValue: ["amount", "day"],
  },
  "customer.mandate-to-sign": {
    subject: ["document", "ref"],
    title: ["document"],
    intro: ["document", "company"],
  },
  "customer.access-opened": {
    subject: ["company"],
    title: ["firstName"],
    opened: ["company"],
    signInWithCode: ["email"],
  },
  "customer.company-attached": {
    subject: ["company"],
    title: ["firstName"],
    attached: ["company"],
  },
  "customer.login-method-linked": {
    subject: ["method"],
    title: ["firstName"],
    linked: ["method"],
  },
  "customer.password-reset": {
    linkRules: ["validity"],
    validityOneHour: ["count"],
    validityHours: ["count"],
  },
  "customer.sub-account-activity": {
    subject: ["site", "title", "order"],
    body: ["site", "action", "order"],
    bodyEnteredByTeam: ["site", "action", "order"],
  },
  "customer.sub-account-gesture": {
    subject: ["site", "title"],
    subjectWithReference: ["site", "title", "reference"],
    body: ["site", "action"],
    bodyWithReference: ["site", "action", "reference"],
    bodyByTeam: ["site", "action"],
    bodyWithReferenceByTeam: ["site", "action", "reference"],
  },
  "staff.appointment-booked": { subject: ["contact", "when"] },
  "staff.account-alert": { subject: ["company", "rule"], title: ["rule", "company"] },
  "staff.invited": { title: ["firstName"] },
  "staff.password-reset": { title: ["firstName"] },
  "staff.access-suspended": { title: ["firstName"] },
  "staff.access-restored": { title: ["firstName"] },
  "staff.production-dossier": {
    subject: ["day"],
    subjectCompleted: ["day"],
    greeting: ["firstName"],
    arrested: ["day", "by", "at"],
    arrestedWithoutAuthor: ["day", "at"],
    completed: ["day", "by", "at"],
    completedWithoutAuthor: ["day", "at"],
    figures: ["figures"],
    figuresPlain: ["orders", "pieces"],
    figuresSplit: ["orders", "split", "pieces"],
    figuresWithResupplies: ["head", "resupplies", "share"],
    ordersWithSplit: ["orders", "split"],
    pickupShare: ["count"],
    deliveryShare: ["count"],
    resupplyPieceShare: ["pieces", "count"],
    orderOne: ["count"],
    orderMany: ["count"],
    pieceOne: ["count"],
    pieceMany: ["count"],
    resupplyOne: ["count"],
    resupplyMany: ["count"],
  },
  "staff.support-requested": { subject: ["contact", "purpose"] },
  "staff.customer-request": {
    subject: ["form", "reason", "author"],
    subjectWithOrder: ["form", "reason", "order", "author"],
    urgentSubject: ["subject"],
    title: ["form"],
    photosValue: ["count"],
  },
  "customer.order-change-applied": {
    subject: ["ref"],
    intro: ["ref"],
    moreToPay: ["amount", "previous"],
    lessToPay: ["amount", "previous"],
  },
  "customer.order-change-refused": { subject: ["ref"], intro: ["ref"] },
  "customer.order-shortfall": {
    subject: ["ref"],
    intro: ["ref"],
    line: ["quantity", "product"],
  },
  "ops.deploy-check": { subject: ["revision"] },
  "agency.vitrine-notice": {},
};
