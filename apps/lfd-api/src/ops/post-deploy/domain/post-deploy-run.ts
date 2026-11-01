import {
  IllegalPostDeployTransitionError,
  SimulationExpiredError,
  SimulationOfAnotherAuthorError,
  SimulationOfAnotherRevisionError,
  SimulationRequiredError,
} from "./post-deploy-errors.js";

/**
 * **Un passage d'opération après déploiement** — la machine d'états du § 7.3
 * (`documentation/ops/plan-operations-apres-deploiement.md`) :
 *
 * ```
 * simulated ──start──▶ running ──▶ succeeded | failed | interrupted
 * ```
 *
 * Une simulation ne s'applique qu'une fois, par la personne qui l'a faite,
 * sur la même image, dans les quinze minutes (§ 3.6). Relancer après un échec
 * ou une interruption demande une nouvelle simulation.
 */
export type PostDeployRunState = "simulated" | "running" | "succeeded" | "failed" | "interrupted";

/** Le délai au-delà duquel une simulation ne vaut plus pour appliquer (§ 3.6). */
export const SIMULATION_FRESHNESS_MINUTES = 15;
const MS_PER_MINUTE = 60_000;

/** Le rapport, tel que le domaine le range : comptes et phrases. */
export interface RunReport {
  readonly writable: number;
  readonly byHand: number;
  readonly summary: readonly string[];
  readonly sample: readonly string[];
}

export interface PostDeployRunSnapshot {
  readonly id: string;
  readonly operationKey: string;
  readonly state: PostDeployRunState;
  readonly revision: string;
  readonly simulatedBy: string;
  readonly simulatedAt: Date;
  readonly simulationReport: RunReport;
  readonly startedAt: Date | null;
  readonly progressReport: RunReport | null;
  readonly finishedAt: Date | null;
  readonly failure: string | null;
}

export interface SimulationFacts {
  readonly id: string;
  readonly operationKey: string;
  readonly revision: string;
  readonly actor: string;
  readonly at: Date;
  readonly report: RunReport;
}

export interface StartFacts {
  readonly actor: string;
  readonly revision: string;
  readonly at: Date;
}

export class PostDeployRun {
  private constructor(
    private state: PostDeployRunSnapshot,
    /** L'état lu en base, `null` pour un passage neuf : l'écriture est conditionnée dessus. */
    readonly persistedState: PostDeployRunState | null,
  ) {}

  /** Une simulation vient d'être faite : le passage naît `simulated`. */
  static simulated(facts: SimulationFacts): PostDeployRun {
    return new PostDeployRun(
      {
        id: facts.id,
        operationKey: facts.operationKey,
        state: "simulated",
        revision: facts.revision,
        simulatedBy: facts.actor,
        simulatedAt: facts.at,
        simulationReport: facts.report,
        startedAt: null,
        progressReport: null,
        finishedAt: null,
        failure: null,
      },
      null,
    );
  }

  static rehydrate(snapshot: PostDeployRunSnapshot): PostDeployRun {
    return new PostDeployRun(snapshot, snapshot.state);
  }

  get id(): string {
    return this.state.id;
  }

  get operationKey(): string {
    return this.state.operationKey;
  }

  get revision(): string {
    return this.state.revision;
  }

  get currentState(): PostDeployRunState {
    return this.state.state;
  }

  snapshot(): PostDeployRunSnapshot {
    return this.state;
  }

  /**
   * « Appliquer » : refuse une simulation déjà employée, d'une autre personne,
   * d'une autre image ou trop ancienne. Chaque refus dit « simulez d'abord ».
   */
  start(facts: StartFacts): void {
    const key = this.state.operationKey;
    if (this.state.state !== "simulated") {
      throw new SimulationRequiredError(key);
    }
    if (facts.actor !== this.state.simulatedBy) {
      throw new SimulationOfAnotherAuthorError(key);
    }
    if (facts.revision !== this.state.revision) {
      throw new SimulationOfAnotherRevisionError(key);
    }
    const age = facts.at.getTime() - this.state.simulatedAt.getTime();
    if (age > SIMULATION_FRESHNESS_MINUTES * MS_PER_MINUTE) {
      throw new SimulationExpiredError(key, SIMULATION_FRESHNESS_MINUTES);
    }
    this.state = { ...this.state, state: "running", startedAt: facts.at };
  }

  /** L'avancement après un lot. */
  recordProgress(report: RunReport): void {
    this.requireRunning("running");
    this.state = { ...this.state, progressReport: report };
  }

  succeed(report: RunReport, at: Date): void {
    this.requireRunning("succeeded");
    this.state = { ...this.state, state: "succeeded", progressReport: report, finishedAt: at };
  }

  /** L'application a levé : ce qui a été écrit lot par lot reste écrit. */
  fail(reason: string, at: Date): void {
    this.requireRunning("failed");
    this.state = { ...this.state, state: "failed", failure: reason, finishedAt: at };
  }

  /** L'image qui conduisait l'application a été remplacée pendant qu'elle tournait. */
  interrupt(reason: string, at: Date): void {
    this.requireRunning("interrupted");
    this.state = { ...this.state, state: "interrupted", failure: reason, finishedAt: at };
  }

  private requireRunning(to: PostDeployRunState): void {
    if (this.state.state !== "running") {
      throw new IllegalPostDeployTransitionError(this.state.id, this.state.state, to);
    }
  }
}
