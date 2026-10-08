import type { CreditorSnapshot } from "../../creditor-snapshot.js";
import type { ConstitutionAuthor } from "../../entities/collection-batch.js";
import type { CollectableOrder } from "../../ports/collection-candidates.reader.js";
import type { FrozenInvoiceOrder } from "../invoice-dossier.types.js";
import type { CollectionMandate } from "../../ports/collection-mandates.reader.js";

/**
 * Données partagées des tests du lot figé. Les dates ne sont comparées qu'entre
 * elles et au cycle donné — jamais à l'horloge : elles peuvent rester absolues.
 */
export const ENTITY_ID = "le_1";
/** Le bouton de la comptabilité : une fiche staff locale. */
export const STAFF_AUTHOR: ConstitutionAuthor = { kind: "staff", staffId: "staff_1" };
export const BATCH_ID = "01JBQ7Z5K8M3QT9P2X4BZZZZZZ";
export const SEPTEMBER = {
  startsAt: new Date("2026-08-31T22:00:00.000Z"),
  closesAt: new Date("2026-09-30T22:00:00.000Z"),
};

export const CREDITOR: CreditorSnapshot = {
  legalEntityId: ENTITY_ID,
  name: "Crazeativity",
  legalForm: "SAS",
  siren: "900000001",
  vatNumber: "",
  rcs: "Chambéry",
  shareCapitalCents: 1_000_000,
  addressLines: ["Route de la Balme"],
  ics: "FR00ZZZ900001",
  accountHolder: "CRAZEATIVITY",
  accountAddressLines: ["Route de la Balme"],
  creditorBic: "CEPAFRPP751",
  creditorIban: "FR7630006000011234567890189",
  preNotificationDays: 14,
  collectionDaysAfterClosure: null,
  mandateContractDescription: "Pains",
  mandatePaymentType: "recurrent",
  mandateScheme: "B2B",
};

let seq = 0;

export function order(
  companyId: string,
  overrides: Partial<CollectableOrder> = {},
): CollectableOrder {
  seq += 1;
  const orderNumber = `CMD-${String(seq).padStart(3, "0")}`;
  const placedAt = new Date("2026-09-15T08:00:00.000Z");
  return {
    orderId: `o${String(seq)}`,
    orderNumber,
    companyId,
    placedAt,
    billedCompanyId: null,
    totalCents: 1_000,
    frozen: frozenOrder(orderNumber, placedAt),
    collection: null,
    ...overrides,
  };
}

/** Un bon figé à 1 000 c TTC (948 HT à 5,5 %), cohérent avec `order()`. */
export function frozenOrder(reference: string, createdAt: Date): FrozenInvoiceOrder {
  return {
    reference,
    createdAt,
    requestedDeliveryDate: null,
    lines: [
      {
        sku: "PAIN-1",
        productNameSnapshot: "Pain",
        unitPriceMillicents: 948_000,
        vatRate: "5.50",
        quantity: 1,
        lineTotalCents: 948,
      },
    ],
    discountCents: 0,
    voucherDiscountCents: 0,
    deliveryFeeCents: 0,
    deliveryVatMode: null,
    lateFeeCents: 0,
    lateFeeVatRate: null,
    vatShares: [{ rate: 5.5, amountCents: 52 }],
    vatCents: 52,
    totalCents: 1_000,
  };
}

export function mandate(
  companyId: string,
  overrides: Partial<CollectionMandate> = {},
): CollectionMandate {
  return {
    mandateId: `m_${companyId}`,
    companyId,
    debtorCompanyId: companyId,
    creditorId: ENTITY_ID,
    reference: `RUM-${companyId}`,
    iban: "FR7630004000031234567890143",
    bic: null,
    scheme: "B2B",
    paymentType: "recurrent",
    signedAt: new Date("2026-08-01T10:00:00.000Z"),
    ...overrides,
  };
}
