import {
  PackingResupply,
  type PackingResupplySnapshot,
} from "../../domain/entities/packing-resupply.js";
import { PackingResupplyBoardReader } from "../../domain/ports/packing-resupply-board.reader.js";
import {
  PackingResupplyListing,
  type ResupplyToDraw,
} from "../../domain/ports/packing-resupply-listing.js";
import { PackingResupplyRepository } from "../../domain/ports/packing-resupply.repository.js";

/**
 * Les fiches de réassort en mémoire (lot R3b) — une seule table, que la
 * liste, le dépôt et la lecture partagent, avec la sémantique de la vraie :
 * inscrite une fois, retirée seulement intouchée et du soir.
 */
export class InMemoryResupplies extends PackingResupplyListing {
  readonly rows = new Map<string, PackingResupplySnapshot>();

  draw(resupply: ResupplyToDraw): Promise<void> {
    const key = `${resupply.serviceDay}/${resupply.resupplyId}`;
    if (!this.rows.has(key)) {
      this.rows.set(key, {
        serviceDay: resupply.serviceDay,
        resupplyId: resupply.resupplyId,
        siteId: resupply.siteId,
        siteLabel: resupply.siteLabel,
        name: resupply.name,
        kind: resupply.kind,
        drawnAt: resupply.drawnAt,
        closed: null,
        lines: resupply.lines.map((line) => ({ ...line, packed: null })),
      });
    }
    return Promise.resolve();
  }

  withdrawUntouched(serviceDay: string, resupplyIds: readonly string[]): Promise<number> {
    let count = 0;
    for (const id of resupplyIds) {
      const key = `${serviceDay}/${id}`;
      const row = this.rows.get(key);
      if (
        row !== undefined &&
        row.kind === "evening" &&
        !PackingResupply.fromSnapshot(row).started
      ) {
        this.rows.delete(key);
        count += 1;
      }
    }
    return Promise.resolve(count);
  }
}

/** Le dépôt, adossé à la même table. */
export class InMemoryResupplyRepository extends PackingResupplyRepository {
  constructor(private readonly table: InMemoryResupplies) {
    super();
  }

  lock(serviceDay: string, resupplyId: string): Promise<PackingResupply | null> {
    const row = this.table.rows.get(`${serviceDay}/${resupplyId}`);
    return Promise.resolve(row === undefined ? null : PackingResupply.fromSnapshot(row));
  }

  save(sheet: PackingResupply): Promise<void> {
    this.table.rows.set(`${sheet.serviceDay}/${sheet.resupplyId}`, sheet.toSnapshot());
    return Promise.resolve();
  }
}

/** La lecture du poste, adossée à la même table. */
export class InMemoryResupplyBoard extends PackingResupplyBoardReader {
  constructor(private readonly table: InMemoryResupplies) {
    super();
  }

  on(serviceDay: string): Promise<readonly PackingResupplySnapshot[]> {
    return Promise.resolve(
      [...this.table.rows.values()].filter((row) => row.serviceDay === serviceDay),
    );
  }
}
