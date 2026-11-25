import { FixedIdGenerator } from "../../../../../platform/id/fixed-id-generator.js";
import { RecordingJournal } from "../../../../../platform/journal/__tests__/recording-journal.js";
import type { Backorder, BackorderSnapshot } from "../../domain/entities/backorder.js";
import {
  BackorderOriginReader,
  type BackorderOrigin,
} from "../../domain/ports/backorder-origin.reader.js";
import { BackorderRepository } from "../../domain/ports/backorder.repository.js";
import { BackorderOpening } from "../backorder-opening.js";

/** L'origine relue sous le verrou : fixée par le test. */
export class FixedBackorderOrigins extends BackorderOriginReader {
  readonly asked: string[] = [];

  constructor(private readonly origin: BackorderOrigin | null) {
    super();
  }

  ofLocked(orderId: string): Promise<BackorderOrigin | null> {
    this.asked.push(orderId);
    return Promise.resolve(this.origin);
  }
}

/** Le dépôt du reliquat : il garde ce qu'on lui sauve, et le note dans la trace partagée. */
export class RecordingBackorders extends BackorderRepository {
  readonly saved: BackorderSnapshot[] = [];

  constructor(private readonly trace: string[] = []) {
    super();
  }

  load(): Promise<Backorder | null> {
    return Promise.reject(new RangeError("la naissance ne relit pas de reliquat"));
  }

  loadLocked(): Promise<Backorder | null> {
    return Promise.reject(new RangeError("la naissance ne verrouille pas de reliquat"));
  }

  save(backorder: Backorder): Promise<void> {
    this.trace.push("save-backorder");
    this.saved.push(backorder.toSnapshot());
    return Promise.resolve();
  }
}

/** Une naissance du reliquat sur ports doublés, et ses doubles pour l'assertion. */
export function backorderOpeningScene(origin: BackorderOrigin | null, trace: string[] = []) {
  const origins = new FixedBackorderOrigins(origin);
  const backorders = new RecordingBackorders(trace);
  const journal = new RecordingJournal();
  const opening = new BackorderOpening(origins, backorders, journal, new FixedIdGenerator("bo"));
  return { origins, backorders, journal, opening };
}
