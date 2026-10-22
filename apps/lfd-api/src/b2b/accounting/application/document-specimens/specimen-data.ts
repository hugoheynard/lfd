import { addDays, instantToLocal } from "@lfd/contracts";

import type { OrderToPlace } from "../../../orders/domain/entities/order.js";
import { specimenProOrderState } from "../../../orders/application/document-specimens/specimen-data.js";
import type { Invoice } from "../../domain/entities/invoice.js";
import type { InvoiceBuyer, InvoiceSeller } from "../../domain/entities/invoice.types.js";
import { simulateInvoiceDossier } from "../../domain/services/invoice-dossier.js";
import type { FrozenInvoiceOrder } from "../../domain/services/invoice-dossier.types.js";
import { invoiceFromDossier } from "../../domain/services/invoice-from-dossier.js";
import type { InvoiceSellerFacts } from "../../domain/services/invoice-issuance-blockers.js";
import { InvoiceNumber } from "../../domain/value-objects/invoice-number.js";
import { InvoicePaymentTerms } from "../../domain/value-objects/invoice-payment-terms.js";

/**
 * **Les données d'exemple de la facture** — la planche des documents de la
 * Comptabilité (`documentation/comptabilite/planche-des-documents.md`).
 *
 * 🔴 **Elles ne sont JAMAIS persistées.** La facture passe par le chemin de
 * la facture du mois — `simulateInvoiceDossier` puis `invoiceFromDossier`,
 * donc `Invoice.issue` et ses refus — et s'arrête là : aucun compteur ne
 * donne son numéro, aucun dépôt ne la range, aucun courriel ne part.
 *
 * Ses deux bons sont la commande pro de la planche (même agrégat, mêmes
 * montants) : la facture d'exemple reprend le bon d'exemple au centime.
 * Vendeur et acheteur sont fictifs et le disent ; leurs numéros n'appartiennent
 * à personne (`999…`).
 */

/** Le numéro imprimé : le dernier rang de l'année, qu'aucune pièce réelle n'atteindra. */
const SPECIMEN_SEQUENCE = 999_999;
/** L'échéance : trente jours, comme les mentions de paiement le diraient. */
const DUE_AFTER_DAYS = 30;

const SELLER: InvoiceSeller = {
  legalEntityId: "specimen-legal-entity",
  name: "EXEMPLE — La Folie Coffee",
  legalForm: "SAS",
  siren: "999999999",
  vatNumber: "FR00999999999",
  rcs: "Chambéry",
  shareCapitalCents: 1_000_000,
  addressLines: ["EXEMPLE — route de la Balme", "73150 Val d'Isère", "France"],
  ics: "FR00ZZZ999999",
  creditorIban: "FR7630006000011234567890189",
  creditorBic: "AGRIFRPP",
};

/** « EX » : un exemple ne prend le préfixe d'aucune entité réelle (lot ZA). */
const SPECIMEN_PREFIX = "EX";

const SELLER_FACTS: InvoiceSellerFacts = {
  legalEntityId: SELLER.legalEntityId,
  name: SELLER.name,
  legalForm: SELLER.legalForm,
  rcs: SELLER.rcs,
  vatNumber: SELLER.vatNumber,
  archived: false,
  paymentTerms: InvoicePaymentTerms.create({
    latePenaltyRateBasisPoints: 1_415,
    recoveryIndemnityCents: 4_000,
    earlyPaymentDiscount: "Pas d'escompte pour paiement anticipé.",
  }),
  invoicePrefix: SPECIMEN_PREFIX,
};

const BUYER: InvoiceBuyer = {
  companyId: "specimen-company",
  name: "EXEMPLE — SAS des Trois Ponts",
  legalForm: "SAS",
  siret: "99999999900017",
  siren: "999999999",
  vatNumber: "FR99999999999",
  billingAddressLines: ["EXEMPLE — 1 rue des Trois Ponts", "73150 Val d'Isère", "France"],
};

/** Les deux bons du mois, livrés la veille et l'avant-veille. */
const ORDERS = [
  { orderId: "specimen-order-1", reference: "EXEMPLE-0001", daysBefore: 2 },
  { orderId: "specimen-order-2", reference: "EXEMPLE-0002", daysBefore: 1 },
] as const;

/** Le bon figé tel que le dossier le lit en base — ici, lu sur l'état de l'agrégat. */
function frozenOf(state: OrderToPlace, reference: string, createdAt: Date): FrozenInvoiceOrder {
  return {
    reference,
    createdAt,
    requestedDeliveryDate: state.requestedDeliveryDate?.toISOString().slice(0, 10) ?? null,
    lines: state.lines.map((line) => ({
      sku: line.sku,
      productNameSnapshot: line.productName,
      unitPriceMillicents: line.unitPriceMillicents,
      // Le `Decimal(5,2)` de la colonne, tel que l'adaptateur le lit.
      vatRate: line.vatRate.toFixed(2),
      quantity: line.quantity,
      lineTotalCents: line.lineTotalCents,
    })),
    discountCents: state.discountCents,
    voucherDiscountCents: state.voucherDiscountCents,
    deliveryFeeCents: state.deliveryFeeCents,
    deliveryVatMode: state.deliveryVatMode,
    lateFeeCents: state.lateFeeCents,
    lateFeeVatRate: state.lateFeeAdjustment?.vatRatePercent ?? null,
    vatShares: state.vatShares,
    vatCents: state.vatCents,
    totalCents: state.totalCents,
  };
}

/** **La facture d'exemple**, émise aujourd'hui (jour de Paris de `now`). */
export function specimenInvoice(now: Date): Invoice {
  const today = instantToLocal(now).day;
  const state = specimenProOrderState(now);
  const frozen = ORDERS.map((order) => frozenOf(state, order.reference, now));
  return invoiceFromDossier({
    id: "specimen-invoice",
    number: InvoiceNumber.compose(SPECIMEN_PREFIX, Number(today.slice(0, 4)), SPECIMEN_SEQUENCE),
    issuedOn: today,
    dueOn: addDays(today, DUE_AFTER_DAYS),
    sellerFacts: SELLER_FACTS,
    seller: SELLER,
    buyer: BUYER,
    deliveryAddressLines: null,
    orders: ORDERS.map((order) => ({
      orderId: order.orderId,
      reference: order.reference,
      deliveredOn: addDays(today, -order.daysBefore),
    })),
    paymentMeans: null,
    prepayment: null,
    computed: simulateInvoiceDossier(frozen).invoice,
  });
}
