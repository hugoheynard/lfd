import { InHouseMonthPayersReader } from "../../../account/domain/ports/in-house-month-payers.reader.js";
import type { InHouseRecap } from "../../domain/entities/in-house-recap.js";
import { InHouseRecapDocument } from "../../domain/ports/in-house-recap-document.js";
import { InHouseRecapRepository } from "../../domain/ports/in-house-recap.repository.js";
import { type InHouseRecapRun, InHouseRecapRuns } from "../../domain/ports/in-house-recap-runs.js";
import { RecapDeliveryNotesReader } from "../../domain/ports/recap-delivery-notes.reader.js";
import { RecapNumbering } from "../../domain/ports/recap-numbering.js";
import type { RecapSourceNote } from "../../domain/services/recap-aggregation.js";
import type { RecapMonth, RecapWindow } from "../../domain/value-objects/recap-month.js";

/** Les récapitulatifs en mémoire ; un BL est couvert par un récapitulatif non remplacé. */
export class InMemoryInHouseRecaps extends InHouseRecapRepository {
  readonly byId = new Map<string, InHouseRecap>();
  readonly writes: string[] = [];

  load(recapId: string): Promise<InHouseRecap | null> {
    return Promise.resolve(this.byId.get(recapId) ?? null);
  }

  save(recap: InHouseRecap): Promise<void> {
    this.writes.push(`save:${recap.id}`);
    this.byId.set(recap.id, recap);
    return Promise.resolve();
  }

  saveRectification(replaced: InHouseRecap, rectified: InHouseRecap): Promise<void> {
    this.writes.push(`rectify:${replaced.id}->${rectified.id}`);
    this.byId.set(replaced.id, replaced);
    this.byId.set(rectified.id, rectified);
    return Promise.resolve();
  }

  saveDocument(recap: InHouseRecap): Promise<void> {
    this.writes.push(`document:${recap.id}`);
    this.byId.set(recap.id, recap);
    return Promise.resolve();
  }

  /** Le récapitulatif non remplacé qui couvre ce BL, s'il y en a un. */
  coveringOf(deliveryNoteId: string): string | null {
    for (const recap of this.byId.values()) {
      const covers = recap.toState().notes.some((note) => note.deliveryNoteId === deliveryNoteId);
      if (covers && !recap.isReplaced) {
        return recap.id;
      }
    }
    return null;
  }
}

/** Les BL remis, par payeur ; la fenêtre est jugée sur `handedOverAt`. */
export class StubRecapNotes extends RecapDeliveryNotesReader {
  readonly notes = new Map<string, RecapSourceNote[]>();

  constructor(private readonly recaps: InMemoryInHouseRecaps) {
    super();
  }

  payersWithUncoveredNotes(window: RecapWindow): Promise<readonly string[]> {
    const payers = [...this.notes.keys()].filter(
      (payer) => this.free(payer, window, null).length > 0,
    );
    return Promise.resolve(payers);
  }

  uncoveredNotesOf(
    payerId: string,
    window: RecapWindow,
    releasing: string | null,
  ): Promise<readonly RecapSourceNote[]> {
    return Promise.resolve(this.free(payerId, window, releasing));
  }

  private free(payerId: string, { from, to }: RecapWindow, releasing: string | null) {
    return (this.notes.get(payerId) ?? []).filter((note) => {
      const at = note.handedOverAt.getTime();
      const covering = this.recaps.coveringOf(note.deliveryNoteId);
      return (
        at >= from.getTime() && at < to.getTime() && (covering === null || covering === releasing)
      );
    });
  }
}

/** Les payeurs maison d'un mois, posés par le test. */
export class StubMonthPayers extends InHouseMonthPayersReader {
  payers: readonly string[] = [];

  payersInHouseDuring(): Promise<readonly string[]> {
    return Promise.resolve(this.payers);
  }
}

/** Les issues, uniques par (payeur, mois). */
export class InMemoryRecapRuns extends InHouseRecapRuns {
  readonly runs = new Map<string, InHouseRecapRun>();

  claim(run: InHouseRecapRun): Promise<boolean> {
    const key = `${run.payerId}|${run.month}`;
    if (this.runs.has(key)) {
      return Promise.resolve(false);
    }
    this.runs.set(key, run);
    return Promise.resolve(true);
  }
}

/** Un numéro par appel, dans le mois. */
export class CountingNumbering extends RecapNumbering {
  private count = 0;

  next(month: RecapMonth): Promise<string> {
    this.count += 1;
    return Promise.resolve(
      `RBL-${month.key.replace("-", "")}-${String(this.count).padStart(4, "0")}`,
    );
  }
}

/** Le point d'extension du document : il retient ce qu'on lui a annoncé. */
export class RecordingRecapDocument extends InHouseRecapDocument {
  readonly announced: string[] = [];

  afterIssued(recapId: string): Promise<void> {
    this.announced.push(recapId);
    return Promise.resolve();
  }
}
