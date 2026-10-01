import type { StoredDocument } from "../../../../platform/storage/document-store.js";
import { ProductionDocumentStore } from "../../../../platform/storage/production-document-store.js";
import {
  type HandoverSubject,
  HandoverSubjectReader,
} from "../../../channels/commerce/handover-subject.reader.js";
import { HandoverProof } from "../../../domain/entities/handover-proof.js";
import { HandoverProofEraser } from "../../../domain/ports/handover-proof.eraser.js";
import { HandoverProofRepository } from "../../../domain/ports/handover-proof.repository.js";

/** Les doublés de l'effacement des pièces : un seul jeu de lignes, deux ports. */

export class ProofRows {
  readonly rows = new Map<string, HandoverProof>();
}

export class InMemoryProofRepository extends HandoverProofRepository {
  constructor(private readonly table: ProofRows) {
    super();
  }

  findByOrderId(orderId: string): Promise<HandoverProof | null> {
    return Promise.resolve(this.table.rows.get(orderId) ?? null);
  }

  record(proof: HandoverProof): Promise<void> {
    this.table.rows.set(proof.state.orderId, proof);
    return Promise.resolve();
  }
}

export class InMemoryProofEraser extends HandoverProofEraser {
  readonly erased: string[] = [];

  constructor(private readonly table: ProofRows) {
    super();
  }

  recordedBefore(cutoff: Date): Promise<readonly HandoverProof[]> {
    return Promise.resolve(
      [...this.table.rows.values()]
        .filter((proof) => proof.state.recordedAt < cutoff)
        .sort((a, b) => a.state.recordedAt.getTime() - b.state.recordedAt.getTime()),
    );
  }

  erase(orderId: string): Promise<boolean> {
    this.erased.push(orderId);
    return Promise.resolve(this.table.rows.delete(orderId));
  }
}

/** Un stockage qui refuse de retirer les clés de `failOn`. */
export class InMemoryProofStore extends ProductionDocumentStore {
  readonly objects = new Map<string, StoredDocument>();
  readonly failOn = new Set<string>();

  save(key: string, document: StoredDocument): Promise<string> {
    this.objects.set(key, document);
    return Promise.resolve(key);
  }

  read(key: string): Promise<Buffer> {
    const found = this.objects.get(key);
    return found === undefined
      ? Promise.reject(new RangeError(`absente : ${key}`))
      : Promise.resolve(found.bytes);
  }

  readIfPresent(key: string): Promise<Buffer | null> {
    return Promise.resolve(this.objects.get(key)?.bytes ?? null);
  }

  delete(key: string): Promise<void> {
    if (this.failOn.has(key)) {
      return Promise.reject(new RangeError("stockage en panne"));
    }
    this.objects.delete(key);
    return Promise.resolve();
  }
}

/** Le commerce ne connaît que les numéros donnés. */
export class NumberedSubjects extends HandoverSubjectReader {
  constructor(private readonly numbers: Readonly<Record<string, string>>) {
    super();
  }

  byToken(): Promise<HandoverSubject | null> {
    return Promise.resolve(null);
  }

  byReference(): Promise<HandoverSubject | null> {
    return Promise.resolve(null);
  }

  byOrderId(orderId: string): Promise<HandoverSubject | null> {
    const orderNumber = this.numbers[orderId];
    return Promise.resolve(
      orderNumber === undefined
        ? null
        : {
            orderId,
            orderNumber,
            placedByUserId: "usr_1",
            customerLabel: "Refuge 1950",
            placedAt: new Date(0),
            requestedDeliveryDate: null,
            pickupLabel: null,
            status: "fulfilled",
            fulfillmentMethod: "delivery",
            note: "",
            lines: [],
          },
    );
  }
}
