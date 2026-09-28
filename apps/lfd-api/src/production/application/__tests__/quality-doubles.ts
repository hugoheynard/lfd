import type { StoredDocument } from "../../../platform/storage/document-store.js";
import { ProductionDocumentStore } from "../../../platform/storage/production-document-store.js";
import type { ProducibleOrder } from "../../channels/commerce/day-orders.reader.js";
import { ProductionDay } from "../../domain/entities/production-day.js";
import type { QualityCheck, QualityPhotoRef } from "../../domain/entities/quality-check.js";
import { QualityUpload, type QualityUploadState } from "../../domain/entities/quality-upload.js";
import { QualityCheckWriteRaceError } from "../../domain/errors/quality-record-errors.js";
import { ProductionDayRepository } from "../../domain/ports/production-day.repository.js";
import { QualityCheckReader } from "../../domain/ports/quality-check.reader.js";
import { QualityCheckRepository } from "../../domain/ports/quality-check.repository.js";
import { QualityUploadRepository } from "../../domain/ports/quality-upload.repository.js";
import type { ServiceDay } from "../../domain/value-objects/service-day.value-object.js";

/**
 * Les doublés du contrôle qualité — chacun ÉTEND son port, donc aucun cast.
 * Une « base » en mémoire partagée par les ports qui la lisent, comme la vraie.
 */

export const CROISSANT = "VIE-001";
export const BAGUETTE = "PAI-001";

/** Deux commandes : l'une porte des croissants, l'autre des croissants ET une baguette. */
export const ORDERS: readonly ProducibleOrder[] = [
  {
    orderId: "ord_1",
    reference: "ORD-0001",
    customerLabel: "Trois Ponts",
    fulfillmentMethod: "pickup",
    destination: "Le Labo",
    lines: [{ sku: CROISSANT, productName: "Croissant", quantity: 12 }],
  },
  {
    orderId: "ord_2",
    reference: "ORD-0002",
    customerLabel: "Le Chalet",
    fulfillmentMethod: "delivery",
    destination: "Val d'Isère",
    lines: [
      { sku: CROISSANT, productName: "Croissant", quantity: 4 },
      { sku: BAGUETTE, productName: "Baguette", quantity: 2 },
    ],
  },
];

/** Une journée arrêtée ; `packed` : les commandes dont le bac est fermé. */
export function closedDay(day: ServiceDay, at: Date, packed: readonly string[]): ProductionDay {
  const open = ProductionDay.open(day);
  open.close(ORDERS, at);
  const snapshot = open.toSnapshot();
  return ProductionDay.fromSnapshot({
    ...snapshot,
    orders: snapshot.orders.map((order) =>
      packed.includes(order.orderId) ? { ...order, packed: { at, by: "staff_pack" } } : order,
    ),
  });
}

export class FixedDays extends ProductionDayRepository {
  constructor(public current: ProductionDay) {
    super();
  }

  load(): Promise<ProductionDay> {
    return Promise.resolve(this.current);
  }

  /** Non utilisés par le contrôle qualité : rejeter plutôt que rendre muet. */
  save(): Promise<void> {
    return Promise.reject(new Error("non utilisé"));
  }

  markPacked(): Promise<boolean> {
    return Promise.reject(new Error("non utilisé"));
  }

  markPackedLine(): Promise<void> {
    return Promise.reject(new Error("non utilisé"));
  }

  recordContainerCount(): Promise<void> {
    return Promise.reject(new Error("non utilisé"));
  }

  stepContainerCount(): Promise<boolean> {
    return Promise.reject(new Error("non utilisé"));
  }
}

/** La table des contrôles — l'unicité de l'`id` et des dépôts, comme en base. */
export class CheckTable {
  readonly rows = new Map<string, QualityCheck>();

  attachedTo(uploadId: string): string | null {
    for (const check of this.rows.values()) {
      if (check.photos.some((photo) => photo.uploadId === uploadId)) {
        return check.id;
      }
    }
    return null;
  }
}

export class InMemoryChecks extends QualityCheckRepository {
  /** Simule un enregistrement concurrent gagnant, posé juste avant l'écriture. */
  raceWinner: QualityCheck | null = null;

  constructor(readonly table: CheckTable) {
    super();
  }

  load(id: string): Promise<QualityCheck | null> {
    return Promise.resolve(this.table.rows.get(id) ?? null);
  }

  save(check: QualityCheck): Promise<void> {
    if (this.raceWinner !== null) {
      this.table.rows.set(this.raceWinner.id, this.raceWinner);
      this.raceWinner = null;
    }
    const taken = check.photos.some((photo) => this.table.attachedTo(photo.uploadId) !== null);
    if (this.table.rows.has(check.id) || taken) {
      return Promise.reject(new QualityCheckWriteRaceError());
    }
    this.table.rows.set(check.id, check);
    return Promise.resolve();
  }
}

export class InMemoryCheckReader extends QualityCheckReader {
  constructor(private readonly table: CheckTable) {
    super();
  }

  forDay(day: ServiceDay): Promise<readonly QualityCheck[]> {
    return Promise.resolve([...this.table.rows.values()].filter((c) => c.serviceDay.equals(day)));
  }

  photo(checkId: string, position: number): Promise<QualityPhotoRef | null> {
    const check = this.table.rows.get(checkId);
    return Promise.resolve(check?.photos.find((p) => p.position === position) ?? null);
  }
}

export class InMemoryUploads extends QualityUploadRepository {
  readonly rows = new Map<string, QualityUploadState>();

  constructor(private readonly checks: CheckTable) {
    super();
  }

  record(upload: QualityUpload): Promise<void> {
    this.rows.set(upload.id, {
      id: upload.id,
      storageKey: upload.storageKey,
      contentType: upload.contentType,
      byteSize: upload.byteSize,
      uploadedBy: upload.uploadedBy,
      uploadedAt: upload.uploadedAt,
      attachedTo: null,
      releasedAt: null,
    });
    return Promise.resolve();
  }

  loadMany(ids: readonly string[]): Promise<readonly QualityUpload[]> {
    return Promise.resolve(
      ids.flatMap((id) => {
        const row = this.rows.get(id);
        return row === undefined ? [] : [this.restore(row)];
      }),
    );
  }

  releasable(uploadedBefore: Date, limit: number): Promise<readonly QualityUpload[]> {
    const rows = [...this.rows.values()]
      .filter((row) => row.releasedAt === null && row.uploadedAt < uploadedBefore)
      .sort((left, right) => left.uploadedAt.getTime() - right.uploadedAt.getTime())
      .slice(0, limit);
    return Promise.resolve(rows.map((row) => this.restore(row)));
  }

  markReleased(ids: readonly string[], at: Date): Promise<void> {
    for (const id of ids) {
      const row = this.rows.get(id);
      if (row !== undefined && row.releasedAt === null) {
        this.rows.set(id, { ...row, releasedAt: at });
      }
    }
    return Promise.resolve();
  }

  private restore(row: QualityUploadState): QualityUpload {
    return QualityUpload.restore({ ...row, attachedTo: this.checks.attachedTo(row.id) });
  }
}

/** Le bucket de la production, en mémoire ; `failOn` : une opération en panne. */
export class InMemoryProductionStore extends ProductionDocumentStore {
  readonly objects = new Map<string, StoredDocument>();
  failOn: "save" | "read" | "delete" | null = null;

  save(key: string, document: StoredDocument): Promise<string> {
    if (this.failOn === "save") {
      return Promise.reject(new Error("stockage en panne"));
    }
    this.objects.set(key, document);
    return Promise.resolve(key);
  }

  read(key: string): Promise<Buffer> {
    const found = this.objects.get(key);
    if (this.failOn === "read" || found === undefined) {
      return Promise.reject(new Error(`pièce absente : ${key}`));
    }
    return Promise.resolve(found.bytes);
  }

  readIfPresent(key: string): Promise<Buffer | null> {
    return Promise.resolve(this.objects.get(key)?.bytes ?? null);
  }

  delete(key: string): Promise<void> {
    if (this.failOn === "delete") {
      return Promise.reject(new Error("stockage en panne"));
    }
    this.objects.delete(key);
    return Promise.resolve();
  }
}

/** Un JPEG minimal : ses trois octets de tête suffisent au domaine. */
export const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
