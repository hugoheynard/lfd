import {
  CatalogOperation,
  type CatalogOperationFacts,
} from "../../../domain/entities/catalog-operation.js";
import { CatalogOperationOverride } from "../../../domain/entities/catalog-operation-override.js";
import { CatalogOperationOverrideRepository } from "../../../domain/ports/catalog-operation-override.repository.js";
import { CatalogOperationRepository } from "../../../domain/ports/catalog-operation.repository.js";

/**
 * Les doubles des opérations reçues, partagés par les suites des commandes et
 * des lectures. Ils héritent des ports et RECONSTITUENT à chaque lecture,
 * comme les adaptateurs : une mutation non sauvée ne survit pas.
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

export class InMemoryOperations extends CatalogOperationRepository {
  private readonly rows = new Map<string, ReturnType<CatalogOperation["toPersistence"]>>();

  constructor(operations: readonly CatalogOperation[] = []) {
    super();
    for (const operation of operations) {
      this.rows.set(operation.key, operation.toPersistence());
    }
  }

  load(key: string): Promise<CatalogOperation | null> {
    const row = this.rows.get(key);
    return Promise.resolve(row === undefined ? null : CatalogOperation.reconstitute(row));
  }

  loadAllIncludingWithdrawn(): Promise<CatalogOperation[]> {
    return Promise.resolve(
      [...this.rows.values()].map((row) => CatalogOperation.reconstitute(row)),
    );
  }

  saveMany(operations: readonly CatalogOperation[]): Promise<void> {
    for (const operation of operations) {
      this.rows.set(operation.key, operation.toPersistence());
    }
    return Promise.resolve();
  }
}

export class InMemoryOverrides extends CatalogOperationOverrideRepository {
  readonly rows = new Map<string, ReturnType<CatalogOperationOverride["toPersistence"]>>();
  saves = 0;

  load(operationKey: string): Promise<CatalogOperationOverride | null> {
    const row = this.rows.get(operationKey);
    return Promise.resolve(row === undefined ? null : CatalogOperationOverride.reconstitute(row));
  }

  save(override: CatalogOperationOverride): Promise<void> {
    this.saves += 1;
    this.rows.set(override.operationKey, override.toPersistence());
    return Promise.resolve();
  }
}
