import type { ServiceDay } from "../../../day/index.js";
import { LineStep, type LineStepKey, type LineStepState } from "../../domain/entities/line-step.js";
import {
  AutomaticStepChecks,
  DayLineStepsReader,
  LineStepRepository,
} from "../../domain/ports/line-step.ports.js";

/**
 * Les doublés des étapes d'une ligne — chacun ÉTEND son port, donc aucun
 * cast. Partagés par les specs des gestes, de la fiche, de la Supervision et
 * du tour toujours vert.
 */

/** La table `production_line_step` en mémoire, sous sa clé (jour, SKU, poste). */
export class InMemoryLineSteps {
  readonly rows = new Map<string, LineStepState>();
  saves = 0;
  /** Les appels de la coche d'office, tels que reçus. */
  readonly automatic: (readonly LineStepKey[])[] = [];

  repository(): LineStepRepository {
    return new LineStepRepositoryOver(this);
  }

  dayReader(): DayLineStepsReader {
    return new DayLineStepsReaderOver(this);
  }

  automaticChecks(): AutomaticStepChecks {
    return new AutomaticStepChecksOver(this);
  }

  /** Pose une étape telle quelle, comme si un geste l'avait écrite. */
  seed(state: LineStepState): void {
    this.rows.set(rowKey(state), state);
  }

  of(key: LineStepKey): LineStepState | undefined {
    return this.rows.get(rowKey(key));
  }
}

function rowKey(key: LineStepKey): string {
  return JSON.stringify([key.serviceDay, key.sku, key.workstationId]);
}

class LineStepRepositoryOver extends LineStepRepository {
  constructor(private readonly table: InMemoryLineSteps) {
    super();
  }

  load(key: LineStepKey): Promise<LineStep | null> {
    const row = this.table.of(key);
    return Promise.resolve(row === undefined ? null : LineStep.fromState(row));
  }

  save(step: LineStep): Promise<void> {
    this.table.seed(step.state);
    this.table.saves += 1;
    return Promise.resolve();
  }
}

class DayLineStepsReaderOver extends DayLineStepsReader {
  constructor(private readonly table: InMemoryLineSteps) {
    super();
  }

  allOf(day: ServiceDay): Promise<readonly LineStepState[]> {
    return Promise.resolve(
      [...this.table.rows.values()].filter((row) => row.serviceDay === day.value),
    );
  }
}

/** La coche d'office : insère ce qui manque, ne touche jamais une étape présente. */
class AutomaticStepChecksOver extends AutomaticStepChecks {
  constructor(private readonly table: InMemoryLineSteps) {
    super();
  }

  checkIfAbsent(keys: readonly LineStepKey[], at: Date, author: string): Promise<number> {
    this.table.automatic.push(keys);
    let inserted = 0;
    for (const key of keys) {
      if (this.table.of(key) === undefined) {
        this.table.seed({
          ...key,
          status: "done",
          reason: null,
          checked: { at, staffId: author, name: null },
          version: 1,
        });
        inserted += 1;
      }
    }
    return Promise.resolve(inserted);
  }
}

/** Une étape vide : aucune n'est rangée. Pour les suites qui ne regardent pas les étapes. */
export function noLineSteps(): DayLineStepsReader {
  return new InMemoryLineSteps().dayReader();
}
