import { STRICT_JOURNAL_FACTS } from "../../../../../platform/journal/__tests__/strict-journal-facts.js";
import type { RecordActivityInput } from "../../activity-event.js";
import { ActivityRecorder } from "../activity-recorder.js";

/**
 * Le journal d'activité, en test : il garde ce qu'on lui donne, après l'avoir
 * confronté au catalogue des faits — strictement, comme l'adaptateur réel sous
 * le harnais.
 *
 * Partagé par les suites de la croissance plutôt que redéclaré dans chacune :
 * neuf copies identiques vivaient dans neuf fichiers, et une copie qui ne
 * vérifie rien est exactement celle qui laisserait passer un type oublié.
 */
export class RecordingActivityRecorder extends ActivityRecorder {
  readonly records: RecordActivityInput[] = [];

  record(input: RecordActivityInput): Promise<void> {
    STRICT_JOURNAL_FACTS.verify(input.type, input.payload);
    this.records.push(input);
    return Promise.resolve();
  }

  /** Les deux garanties écrivent au même endroit — le double n'en distingue qu'une. */
  recordOrFail(input: RecordActivityInput): Promise<void> {
    return this.record(input);
  }
}
