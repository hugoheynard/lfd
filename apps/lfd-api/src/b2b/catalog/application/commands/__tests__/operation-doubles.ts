import type { CatalogOperationFacts } from "../../../domain/entities/catalog-operation.js";

/**
 * L'opération reçue de référence, partagée par les suites qui lisent le
 * miroir des opérations. Ses doubles de dépôt sont partis avec la surcharge
 * (X2, 2026-10-17).
 */

/** Noël tel que reçu. Dates comparées entre elles seulement, jamais à l'horloge. */
export function receivedNoel(over: Partial<CatalogOperationFacts> = {}): CatalogOperationFacts {
  return {
    key: "noel-2026",
    name: { fr: "Noël", en: "Christmas" },
    lede: null,
    image: null,
    announceFrom: new Date("2026-10-31T23:00:00.000Z"),
    orderFrom: null,
    orderUntil: new Date("2026-12-21T11:00:00.000Z"),
    pickupFrom: "2026-12-20",
    pickupUntil: "2026-12-24",
    audience: "both",
    skus: ["PAT-9-1", "VIE-001-1"],
    receivedAt: new Date("2026-09-01T00:00:00.000Z"),
    ...over,
  };
}
