import type { CreditorSnapshot } from "../../creditor-snapshot.js";
import type { CollectableOrder } from "../../ports/collection-candidates.reader.js";
import type { CollectionMandate } from "../../ports/collection-mandates.reader.js";

/**
 * Données partagées des tests du lot figé. Les dates ne sont comparées qu'entre
 * elles et au cycle donné — jamais à l'horloge : elles peuvent rester absolues.
 */
export const ENTITY_ID = "le_1";
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
  return {
    orderId: `o${String(seq)}`,
    orderNumber: `CMD-${String(seq).padStart(3, "0")}`,
    companyId,
    placedAt: new Date("2026-09-15T08:00:00.000Z"),
    totalCents: 1_000,
    collection: null,
    ...overrides,
  };
}

export function mandate(
  companyId: string,
  overrides: Partial<CollectionMandate> = {},
): CollectionMandate {
  return {
    mandateId: `m_${companyId}`,
    companyId,
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
