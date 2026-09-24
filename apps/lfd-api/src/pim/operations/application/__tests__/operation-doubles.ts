import type { PrepareOperationPayload } from "@lfd/pim-contracts";

import { DirectUnitOfWork } from "../../../../platform/database/__tests__/direct-unit-of-work.js";
import type { WriteTicket } from "../../../../platform/journal/scoped-journal.js";
import { FixedClock } from "../../../../platform/time/fixed-clock.js";
import { ImageCatalogue, type CatalogueImage } from "../../../channels/media/image-catalogue.js";
import { RecordingJournal } from "../../../journal/__tests__/recording-journal.js";
import {
  Operation,
  type OperationRecord,
  type OperationSnapshot,
} from "../../domain/entities/operation.js";
import { OperationKeyTakenError } from "../../domain/errors/operation-errors.js";
import { OperationSkuCatalogue } from "../../domain/ports/operation-sku.catalogue.js";
import { OperationReader } from "../../domain/ports/operation.reader.js";
import { OperationRepository } from "../../domain/ports/operation.repository.js";

/**
 * Les doubles des suites d'application des opérations — des objets qui
 * HÉRITENT des ports, jamais un `jest.mock` : c'est le contrat du port qu'on
 * éprouve, et un double qui en dériverait ne compilerait plus.
 */

/** « Maintenant », pour ces suites. Les dates des fixtures en dérivent toutes. */
export const NOW = new Date("2026-10-01T08:00:00.000Z");
const DAY_MS = 24 * 60 * 60 * 1000;

/** Un instant `days` jours après {@link NOW}, en ISO. */
export function inDays(days: number): string {
  return new Date(NOW.getTime() + days * DAY_MS).toISOString();
}

/** Le jour `AAAA-MM-JJ` qui tombe `days` jours après {@link NOW}. */
export function dayIn(days: number): string {
  return inDays(days).slice(0, 10);
}

export const KNOWN_IMAGE = "https://media.test/buche.webp";
export const KNOWN_SKUS = ["BUC-001", "GAL-002", "TAR-003"];

/**
 * Une opération qui s'annonce dans un mois, ouvre dans six semaines, ferme
 * dans onze et se retire la semaine suivante.
 */
export function prepared(over: Partial<PrepareOperationPayload> = {}): PrepareOperationPayload {
  return {
    key: "noel-2026",
    name: { fr: "Noël 2026" },
    lede: { fr: "Les bûches sont là." },
    image: { url: KNOWN_IMAGE, alt: "Une bûche" },
    announceFrom: inDays(30),
    orderFrom: inDays(45),
    orderUntil: inDays(80),
    pickupFrom: dayIn(78),
    pickupUntil: dayIn(84),
    audience: "both",
    ...over,
  };
}

function recordOf(snapshot: OperationSnapshot): OperationRecord {
  const { schedule } = snapshot;
  return {
    ...snapshot,
    schedule: {
      announceFrom: schedule.announceFrom,
      orderFrom: schedule.orderFrom,
      orderUntil: schedule.orderUntil,
      pickupFrom: schedule.pickupFrom.value,
      pickupUntil: schedule.pickupUntil.value,
    },
  };
}

/**
 * Le dépôt ET le lecteur en mémoire, sur les mêmes lignes — comme la base.
 * Il range des lignes, pas des agrégats : relire rend une instance neuve, et
 * un cas d'usage qui muterait sans `save` ne serait pas sauvé par un alias.
 */
export class InMemoryOperations extends OperationRepository {
  readonly rows = new Map<string, OperationRecord>();
  readonly writes: string[] = [];

  load(key: string): Promise<Operation | null> {
    const row = this.rows.get(key);
    return Promise.resolve(row === undefined ? null : Operation.reconstitute(row));
  }

  add(operation: Operation, _ticket: WriteTicket): Promise<void> {
    const snapshot = operation.snapshot();
    if (this.rows.has(snapshot.key)) {
      return Promise.reject(new OperationKeyTakenError(snapshot.key));
    }
    this.rows.set(snapshot.key, recordOf(snapshot));
    this.writes.push(`add:${snapshot.key}`);
    return Promise.resolve();
  }

  save(operation: Operation, _ticket: WriteTicket): Promise<void> {
    const snapshot = operation.snapshot();
    this.rows.set(snapshot.key, recordOf(snapshot));
    this.writes.push(`save:${snapshot.key}`);
    return Promise.resolve();
  }

  /** Sème une ligne comme si un cas d'usage l'avait écrite. */
  seed(operation: Operation): void {
    this.rows.set(operation.key, recordOf(operation.snapshot()));
  }

  reader(): OperationReader {
    return new InMemoryOperationReader(this.rows);
  }
}

class InMemoryOperationReader extends OperationReader {
  constructor(private readonly rows: ReadonlyMap<string, OperationRecord>) {
    super();
  }

  list(): Promise<readonly OperationSnapshot[]> {
    const snapshots = [...this.rows.values()].map((row) => Operation.reconstitute(row).snapshot());
    return Promise.resolve(
      snapshots.sort(
        (a, b) => b.schedule.announceFrom.getTime() - a.schedule.announceFrom.getTime(),
      ),
    );
  }

  find(key: string): Promise<OperationSnapshot | null> {
    const row = this.rows.get(key);
    return Promise.resolve(row === undefined ? null : Operation.reconstitute(row).snapshot());
  }
}

/** La médiathèque : elle ne connaît que {@link KNOWN_IMAGE}. */
export class TableImageCatalogue extends ImageCatalogue {
  describe(): Promise<ReadonlyMap<string, CatalogueImage>> {
    return Promise.resolve(new Map());
  }

  has(url: string): Promise<boolean> {
    return Promise.resolve(url === KNOWN_IMAGE);
  }
}

/** Le catalogue : il ne connaît que {@link KNOWN_SKUS}, et compte ses lectures. */
export class TableSkuCatalogue extends OperationSkuCatalogue {
  reads = 0;

  unknownAmong(skus: readonly string[]): Promise<readonly string[]> {
    this.reads += 1;
    return Promise.resolve(skus.filter((sku) => !KNOWN_SKUS.includes(sku)));
  }
}

export interface Doubles {
  readonly operations: InMemoryOperations;
  readonly images: TableImageCatalogue;
  readonly skus: TableSkuCatalogue;
  readonly journal: RecordingJournal;
  readonly uow: DirectUnitOfWork;
  readonly clock: FixedClock;
}

export function doubles(): Doubles {
  return {
    operations: new InMemoryOperations(),
    images: new TableImageCatalogue(),
    skus: new TableSkuCatalogue(),
    journal: new RecordingJournal(),
    uow: new DirectUnitOfWork(),
    clock: new FixedClock(NOW),
  };
}
