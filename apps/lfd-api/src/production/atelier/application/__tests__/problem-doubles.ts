import {
  StaffNotifier,
  type StaffNotice,
} from "../../../../staff/notifications/domain/ports/staff-notifier.js";
import type { ServiceDay } from "../../../day/index.js";
import {
  ProductionProblem,
  type ProductionProblemState,
} from "../../domain/entities/production-problem.js";
import {
  OpenProductionProblemsReader,
  ProductionProblemRepository,
} from "../../domain/ports/production-problem.ports.js";

/**
 * Les doublés des problèmes du fournil — chacun ÉTEND son port, donc aucun
 * cast. Partagés par les specs du rouge, de « Fait », de « traité » et de
 * la Supervision.
 */

/** La table `production_problem` en mémoire : un par journée et SKU, l'état rangé tel quel. */
export class InMemoryProblems {
  readonly rows = new Map<string, ProductionProblemState>();
  saves = 0;

  repository(): ProductionProblemRepository {
    return new ProblemRepositoryOver(this);
  }

  reader(): OpenProductionProblemsReader {
    return new OpenProblemsReaderOver(this);
  }

  /** Le problème d'une ligne, ou `undefined`. */
  of(serviceDay: string, sku: string): ProductionProblemState | undefined {
    return [...this.rows.values()].find((row) => row.serviceDay === serviceDay && row.sku === sku);
  }
}

class ProblemRepositoryOver extends ProductionProblemRepository {
  constructor(private readonly table: InMemoryProblems) {
    super();
  }

  load(day: ServiceDay, sku: string): Promise<ProductionProblem | null> {
    const row = this.table.of(day.value, sku);
    return Promise.resolve(row === undefined ? null : ProductionProblem.fromState(row));
  }

  loadById(id: string): Promise<ProductionProblem | null> {
    const row = this.table.rows.get(id);
    return Promise.resolve(row === undefined ? null : ProductionProblem.fromState(row));
  }

  save(problem: ProductionProblem): Promise<void> {
    this.table.rows.set(problem.id, problem.state);
    this.table.saves += 1;
    return Promise.resolve();
  }
}

class OpenProblemsReaderOver extends OpenProductionProblemsReader {
  constructor(private readonly table: InMemoryProblems) {
    super();
  }

  openOf(day: ServiceDay): Promise<readonly ProductionProblemState[]> {
    return Promise.resolve(
      [...this.table.rows.values()].filter(
        (row) => row.serviceDay === day.value && row.resolved === null,
      ),
    );
  }
}

/** La cloche : elle garde ce qu'on lui a fait sonner. */
export class RecordingBell extends StaffNotifier {
  readonly notices: StaffNotice[] = [];

  notify(notices: readonly StaffNotice[]): Promise<void> {
    this.notices.push(...notices);
    return Promise.resolve();
  }
}
