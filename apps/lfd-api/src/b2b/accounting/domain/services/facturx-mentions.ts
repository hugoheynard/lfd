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
 * ⚠️ Codes de sujet écrits DE MÉMOIRE (`PMD` pénalités, `PMT` indemnité
 * forfaitaire, `AAB` escompte, `AAI` information générale) — à vérifier
 * contre la spec Factur-X 1.07 et le Schematron (2026-10-08). Ils ne changent
 * aucun montant ; un code faux est un avertissement, pas une facture fausse.
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

function latePenaltiesText(state: InvoiceState): string {
  const rate = basisPointsPercent(state.mentions.latePenaltyRateBasisPoints).replace(".", ",");
  return `Pénalités de retard : ${rate} % l'an.`;
}

function recoveryIndemnityText(state: InvoiceState): string {
  const amount = centsAmount(state.mentions.recoveryIndemnityCents).replace(".", ",");
  return `Indemnité forfaitaire pour frais de recouvrement : ${amount} €.`;
}

/**
 * La catégorie d'opération. L'option débits n'est jamais prise
 * (`vatOnDebits: false`) : rien ne l'annonce, faute de mention à porter.
 */
function operationText(state: InvoiceState): string {
  return `Catégorie d'opération : ${OPERATION_LABELS[state.mentions.operationCategory]}.`;
}

/**
 * Les bons couverts et leur livraison réelle. La norme n'admet qu'UNE
 * référence de commande (BT-13, 0..1) et une facture du mois en couvre
 * plusieurs : la liste entière vit donc en note (plan § 5, remonté le
 * 2026-10-08).
 */
export function ordersText(orders: readonly InvoiceOrderReference[]): string {
  const listed = orders.map((order) =>
    order.deliveredOn === null
      ? `${order.reference} (livraison non constatée)`
      : `${order.reference} (livré le ${frenchDate(order.deliveredOn)})`,
  );
  return `Bons de commande : ${listed.join(", ")}.`;
}

function note(content: string, subject: string): string {
  return `<ram:IncludedNote>${textElement("ram:Content", content)}${textElement("ram:SubjectCode", subject)}</ram:IncludedNote>`;
}

function frenchDate(isoDate: string): string {
  const [year, month, day] = isoDate.split("-");
  return `${day ?? ""}/${month ?? ""}/${year ?? ""}`;
}
