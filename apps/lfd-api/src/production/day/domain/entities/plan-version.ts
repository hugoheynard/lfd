import type { ProductionDaySnapshot } from "./production-day.snapshot.js";
import { contentOf, samePlan } from "./plan-version.build.js";
import {
  PLAN_VERSION_CONTENT_VERSION,
  type PlanVersionAuthor,
  type PlanVersionCause,
  type PlanVersionContent,
  type WithdrawalEntry,
} from "./plan-version.content.js";

export type {
  PlanEntry,
  PlanVersionAuthor,
  PlanVersionCause,
  PlanVersionContent,
  VersionedShipment,
  VersionedWithdrawal,
  WithdrawalEntry,
} from "./plan-version.content.js";

/** Ce que les ports d'effets fournissent à une version neuve : son identifiant et son instant. */
export interface PlanVersionStamp {
  readonly id: string;
  readonly at: Date;
}

/** Une version telle que l'adaptateur l'écrit et la relit. */
export interface PlanVersionRecord {
  readonly id: string;
  readonly serviceDay: string;
  readonly version: number;
  readonly cause: PlanVersionCause;
  readonly recordedAt: Date;
  readonly recordedBy: PlanVersionAuthor;
  readonly closedAt: Date;
  readonly printRun: number;
  readonly contentVersion: number;
  readonly content: PlanVersionContent;
}

/**
 * **Une version du plan de production** (`documentation/fournil/les-versions-du-plan.md`) : ce que contenait le plan figé d'une journée après un geste qui l'a
 * changé, qui l'a fait, quand, et pourquoi chaque envoi y est.
 *
 * Elle ne se modifie pas : on en écrit une nouvelle, construite par
 * {@link PlanVersion.next} depuis la précédente — c'est la précédente qui dit
 * comment chaque envoi est entré (§ 1.7).
 */
export class PlanVersion {
  private constructor(private readonly record: PlanVersionRecord) {}

  /**
   * La version qui suit `previous` après ce geste, ou `null` quand il n'y a
   * rien à garder : une journée qui n'est pas arrêtée n'a pas de plan, et un
   * plan identique à celui de la précédente n'est pas une version (§ 1.6).
   *
   * @param withdrawn les retraits après inscription du registre, lus sous le
   *   verrou ; le nouvel arrêt les écarte du plan, la version les garde.
   */
  static next(
    previous: PlanVersion | null,
    snapshot: ProductionDaySnapshot,
    cause: PlanVersionCause,
    withdrawn: readonly WithdrawalEntry[],
    by: PlanVersionAuthor,
    stamp: PlanVersionStamp,
  ): PlanVersion | null {
    const closedAt = snapshot.closedAt;
    if (closedAt === null) {
      return null;
    }
    const before = previous?.record ?? null;
    const content = contentOf(before, snapshot, closedAt, cause, withdrawn);
    if (
      before !== null &&
      before.closedAt.getTime() === closedAt.getTime() &&
      samePlan(before.content, content)
    ) {
      return null;
    }
    return new PlanVersion({
      id: stamp.id,
      serviceDay: snapshot.serviceDay,
      version: (before?.version ?? 0) + 1,
      cause,
      recordedAt: stamp.at,
      recordedBy: by,
      closedAt,
      printRun: (snapshot.retakeCount ?? 0) + 1,
      contentVersion: PLAN_VERSION_CONTENT_VERSION,
      content,
    });
  }

  /** Une version relue en base. */
  static restore(record: PlanVersionRecord): PlanVersion {
    return new PlanVersion(record);
  }

  get version(): number {
    return this.record.version;
  }

  get serviceDay(): string {
    return this.record.serviceDay;
  }

  get cause(): PlanVersionCause {
    return this.record.cause;
  }

  get content(): PlanVersionContent {
    return this.record.content;
  }

  /** L'état à écrire. */
  toRecord(): PlanVersionRecord {
    return this.record;
  }
}
