import type {
  InvoiceMentions,
  InvoiceOrderReference,
  InvoiceState,
} from "../entities/invoice.types.js";
import { basisPointsPercent, centsAmount, textElement } from "./facturx-format.js";

/**
 * Les mentions en clair du XML Factur-X : conditions de paiement (BT-20) et
 * notes (BG-1), avec le code de sujet UNTDID 4451 que l'usage français de
 * Factur-X leur donne.
 *
 * Codes de sujet : `PMD` pénalités, `PMT` indemnité forfaitaire, `AAB`
 * escompte — les trois que la règle BR-FR-05 du Schematron BR-FR Flux 2
 * v1.4.0.04 exige dans BG-1 et retrouve dans nos pièces ; `AAI` information
 * générale, admis par la liste de codes du Schematron Factur-X 1.09.2
 * (`__tests__/facturx-fr-conformance.spec.ts`, vérifié le 2026-10-22).
 */

const SUBJECT_LATE_PENALTIES = "PMD";
const SUBJECT_RECOVERY_INDEMNITY = "PMT";
const SUBJECT_EARLY_PAYMENT = "AAB";
const SUBJECT_GENERAL = "AAI";

const OPERATION_LABELS: Readonly<Record<InvoiceMentions["operationCategory"], string>> = {
  goods: "livraison de biens",
};

/** BT-20 — l'échéance et les trois mentions de retard, en une phrase par sujet. */
export function paymentTermsDescription(state: InvoiceState): string {
  return [
    ...(state.prepayment === null ? [] : [settledText(state)]),
    state.dueOn === null ? "Avoir : sans échéance." : `Échéance : ${frenchDate(state.dueOn)}.`,
    latePenaltiesText(state),
    recoveryIndemnityText(state),
    state.mentions.earlyPaymentDiscount,
  ].join(" ");
}

/** BG-1 — les mentions légales et la liste des bons couverts. */
export function documentNotes(state: InvoiceState): string {
  return [
    note(latePenaltiesText(state), SUBJECT_LATE_PENALTIES),
    note(recoveryIndemnityText(state), SUBJECT_RECOVERY_INDEMNITY),
    note(state.mentions.earlyPaymentDiscount, SUBJECT_EARLY_PAYMENT),
    note(operationText(state), SUBJECT_GENERAL),
    note(ordersText(state.orders), SUBJECT_GENERAL),
  ].join("");
}

/**
 * « Facture acquittée le 12/10/2026 par carte. » — la facture carte (E5a) ;
 * la même phrase sur le XML et le PDF.
 */
export function settledText(state: InvoiceState): string {
  return state.prepayment === null
    ? ""
    : `Facture acquittée le ${frenchDate(state.prepayment.paidOn)} par carte.`;
}

/** « Pénalités de retard : 10,15 % l'an. » — la même phrase sur le XML et le PDF. */
export function latePenaltiesText(state: InvoiceState): string {
  const rate = basisPointsPercent(state.mentions.latePenaltyRateBasisPoints).replace(".", ",");
  return `Pénalités de retard : ${rate} % l'an.`;
}

/** « Indemnité forfaitaire pour frais de recouvrement : 40,00 €. » */
export function recoveryIndemnityText(state: InvoiceState): string {
  const amount = centsAmount(state.mentions.recoveryIndemnityCents).replace(".", ",");
  return `Indemnité forfaitaire pour frais de recouvrement : ${amount} €.`;
}

/**
 * La catégorie d'opération. L'option débits n'est jamais prise
 * (`vatOnDebits: false`) : rien ne l'annonce, faute de mention à porter.
 */
export function operationText(state: InvoiceState): string {
  return `Catégorie d'opération : ${OPERATION_LABELS[state.mentions.operationCategory]}.`;
}

/**
 * **La ligne de référence** : les commandes couvertes, leur réception réelle
 * (livrée ou retirée, « reçue le ») — une mention obligatoire —, puis les bons
 * de livraison facturés. La norme n'admet qu'UNE référence de commande
 * (BT-13, 0..1) et une facture du mois en couvre plusieurs : la liste entière
 * vit donc en note (plan § 5, remonté le 2026-10-08).
 *
 * « Commandes : ORD-1042 (reçue le …) — Bons de livraison : BL-1042-1 »
 * depuis E6c2 (Hugo, 2026-10-25, plan E6 § 11) : après un départ incomplet,
 * le BL dit ce qui est facturé, la commande ce qui a été demandé. Une facture
 * émise avant ne portait pas ses BL (`deliveryNoteNumbers` absent) : la
 * seconde moitié se tait. Seul le rendu change : une facture déjà émise garde
 * son PDF et son Factur-X archivés (`document_sha256`, `invoice_immutable`)
 * — rien n'est réécrit.
 */
export function ordersText(orders: readonly InvoiceOrderReference[]): string {
  const listed = orders.map((order) =>
    order.receivedOn === null
      ? `${order.reference} (réception non constatée)`
      : `${order.reference} (reçue le ${frenchDate(order.receivedOn)})`,
  );
  const notes = orders.flatMap((order) => order.deliveryNoteNumbers ?? []);
  const delivered = notes.length === 0 ? "" : ` — Bons de livraison : ${notes.join(", ")}`;
  return `Commandes : ${listed.join(", ")}${delivered}.`;
}

function note(content: string, subject: string): string {
  return `<ram:IncludedNote>${textElement("ram:Content", content)}${textElement("ram:SubjectCode", subject)}</ram:IncludedNote>`;
}

/** `AAAA-MM-JJ` → `JJ/MM/AAAA`. */
export function frenchDate(isoDate: string): string {
  const [year, month, day] = isoDate.split("-");
  return `${day ?? ""}/${month ?? ""}/${year ?? ""}`;
}
