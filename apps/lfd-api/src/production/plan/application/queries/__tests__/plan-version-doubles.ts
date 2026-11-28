import { DocumentStorageUnavailableError } from "../../../../../platform/shared/errors/storage-errors.js";
import type { StoredDocument } from "../../../../../platform/storage/document-store.js";
import { ProductionDocumentStore } from "../../../../../platform/storage/production-document-store.js";
import {
  PlanVersionComparison,
  PlanVersionListing,
  type ServiceDay,
} from "../../../../day/index.js";

export type PlanVersionEntry = Awaited<ReturnType<PlanVersionListing["listOf"]>>[number];
export type PlanVersionDiff = Awaited<ReturnType<PlanVersionComparison["compare"]>>;

/** La liste du noyau doublée : des entrées posées par le test, et le jour demandé. */
export class EntriesListing extends PlanVersionListing {
  readonly asked: string[] = [];

  constructor(private readonly entries: readonly PlanVersionEntry[]) {
    super();
  }

  listOf(day: ServiceDay): Promise<readonly PlanVersionEntry[]> {
    this.asked.push(day.value);
    return Promise.resolve(this.entries);
  }
}

/** La comparaison du noyau doublée : un diff posé, ou le refus que le noyau lèverait. */
export class FixedComparison extends PlanVersionComparison {
  readonly asked: [string, number, number][] = [];

  constructor(private readonly answer: PlanVersionDiff | Error) {
    super();
  }

  compare(day: ServiceDay, from: number, to: number): Promise<PlanVersionDiff> {
    this.asked.push([day.value, from, to]);
    return this.answer instanceof Error
      ? Promise.reject(this.answer)
      : Promise.resolve(this.answer);
  }
}

/** Le bucket du fournil en mémoire, qui peut ne pas répondre (`down`). */
export class PaperBucket extends ProductionDocumentStore {
  readonly objects = new Map<string, StoredDocument>();
  readonly reads: string[] = [];
  down = false;

  put(key: string): this {
    this.objects.set(key, { bytes: Buffer.from("%PDF"), contentType: "application/pdf" });
    return this;
  }

  save(key: string, document: StoredDocument): Promise<string> {
    this.objects.set(key, document);
    return Promise.resolve(key);
  }

  read(key: string): Promise<Buffer> {
    const found = this.objects.get(key);
    return found === undefined
      ? Promise.reject(new DocumentStorageUnavailableError(`pièce absente : ${key}`))
      : Promise.resolve(found.bytes);
  }

  readIfPresent(key: string): Promise<Buffer | null> {
    this.reads.push(key);
    if (this.down) {
      return Promise.reject(new DocumentStorageUnavailableError("stockage en panne (double)"));
    }
    return Promise.resolve(this.objects.get(key)?.bytes ?? null);
  }

  delete(key: string): Promise<void> {
    this.objects.delete(key);
    return Promise.resolve();
  }
}

/** Une entrée de la liste : la version 1, arrêtée par une personne du staff nommée. */
export function entry(overrides: Partial<PlanVersionEntry> = {}): PlanVersionEntry {
  const closedAt = new Date("2026-11-27T18:00:00.000Z");
  return {
    version: 1,
    cause: "closed",
    recordedAt: closedAt,
    recordedBy: { kind: "staff", staffId: "s-marie", name: "Marie Dupont" },
    closedAt,
    printRun: 1,
    shipmentCount: 3,
    paperVersion: overrides.version ?? 1,
    ...overrides,
  };
}
