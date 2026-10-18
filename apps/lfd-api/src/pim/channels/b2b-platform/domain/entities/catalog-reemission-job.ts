import {
  InvalidReemissionScopeError,
  ReemissionJobClosedError,
} from "../errors/reemission-errors.js";

/** `all` = familles, fiches, règles ; `product` = une fiche. */
export type ReemissionScope = "all" | "product";

/** `running` → `done` (fini, échecs de fiche compris) | `failed` (arrêté en route). */
export type ReemissionStatus = "running" | "done" | "failed";

/** Une fiche qui n'est pas partie, nommée pour qu'on la retrouve sans les journaux. */
export interface ReemissionFailure {
  readonly productId: string;
  /** Le nom source de la fiche ; `null` s'il n'a pas pu être relu. */
  readonly name: string | null;
  readonly reason: string;
}

/** L'état d'un travail, tel qu'il se range et se relit. */
export interface CatalogReemissionJobSnapshot {
  readonly id: string;
  readonly scope: ReemissionScope;
  readonly productId: string | null;
  readonly startedAt: Date;
  readonly finishedAt: Date | null;
  readonly status: ReemissionStatus;
  readonly productsAttempted: number;
  readonly productsSucceeded: number;
  readonly failures: readonly ReemissionFailure[];
  readonly error: string | null;
  readonly startedBy: string;
}

/** Ce que le lanceur fournit ; le reste naît avec le travail. */
export interface ReemissionStart {
  readonly id: string;
  readonly productId: string | null;
  readonly startedAt: Date;
  readonly startedBy: string;
}

/**
 * La raison écrite sur un travail qu'un redémarrage a coupé : il tournait en
 * mémoire, et la mémoire est partie avec le processus.
 */
export const INTERRUPTED_BY_RESTART =
  "Interrompu par un redémarrage du serveur avant la fin. Les fiches comptées sont parties ; " +
  "relancer la réémission est sans risque.";

/**
 * **Une réémission du catalogue, suivie comme un travail** (2026-10-18).
 *
 * Elle porte ce que la réponse HTTP perdait : combien de fiches ont été
 * tentées, combien sont parties, lesquelles ont échoué et pourquoi, ou ce qui
 * a tout arrêté. L'invariant qu'elle garde est celui d'un compte rendu : un
 * travail clos ne change plus — ni compte, ni issue.
 */
export class CatalogReemissionJob {
  private constructor(private state: CatalogReemissionJobSnapshot) {}

  /** Un travail neuf, en cours, sans rien compté. */
  static start(start: ReemissionStart): CatalogReemissionJob {
    const scope: ReemissionScope = start.productId === null ? "all" : "product";
    if (start.productId?.trim() === "" || start.startedBy.trim() === "") {
      throw new InvalidReemissionScopeError();
    }
    return new CatalogReemissionJob({
      id: start.id,
      scope,
      productId: start.productId,
      startedAt: start.startedAt,
      finishedAt: null,
      status: "running",
      productsAttempted: 0,
      productsSucceeded: 0,
      failures: [],
      error: null,
      startedBy: start.startedBy,
    });
  }

  /** Relit un travail rangé ; une forme incohérente est refusée. */
  static restore(snapshot: CatalogReemissionJobSnapshot): CatalogReemissionJob {
    if ((snapshot.scope === "product") !== (snapshot.productId !== null)) {
      throw new InvalidReemissionScopeError();
    }
    return new CatalogReemissionJob({ ...snapshot, failures: [...snapshot.failures] });
  }

  get id(): string {
    return this.state.id;
  }

  get scope(): ReemissionScope {
    return this.state.scope;
  }

  get productId(): string | null {
    return this.state.productId;
  }

  get isRunning(): boolean {
    return this.state.status === "running";
  }

  /** Une fiche est partie. */
  productSucceeded(): void {
    this.requireRunning();
    this.state = {
      ...this.state,
      productsAttempted: this.state.productsAttempted + 1,
      productsSucceeded: this.state.productsSucceeded + 1,
    };
  }

  /** Une fiche n'est pas partie : elle est comptée tentée, et nommée. */
  productFailed(failure: ReemissionFailure): void {
    this.requireRunning();
    this.state = {
      ...this.state,
      productsAttempted: this.state.productsAttempted + 1,
      failures: [...this.state.failures, failure],
    };
  }

  /** Fini : chaque fiche a été tentée, les échecs éventuels sont nommés. */
  finish(at: Date): void {
    this.requireRunning();
    this.state = { ...this.state, status: "done", finishedAt: at };
  }

  /** Arrêté en route : ce qui a tout arrêté est écrit, les comptes restent. */
  fail(reason: string, at: Date): void {
    this.requireRunning();
    this.state = { ...this.state, status: "failed", finishedAt: at, error: reason };
  }

  /** Coupé par un redémarrage : le processus qui le tenait n'est plus. */
  interrupt(at: Date): void {
    this.fail(INTERRUPTED_BY_RESTART, at);
  }

  snapshot(): CatalogReemissionJobSnapshot {
    return { ...this.state, failures: [...this.state.failures] };
  }

  private requireRunning(): void {
    if (this.state.status !== "running") {
      throw new ReemissionJobClosedError(this.state.id);
    }
  }
}
