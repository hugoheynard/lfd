import { addDays, instantToLocal } from "@lfd/contracts";

import type { StaffTrace } from "../../account/domain/value-objects/staff-trace.js";
import { UnknownResupplyTargetError } from "./site-resupply-errors.js";
import type { ResupplyOrigin } from "./resupply-origin.js";

/** `tomorrow` : la commande du soir pour demain ; `asap` : « au plus tôt », aujourd'hui. */
export type ResupplyTarget = "tomorrow" | "asap";

const TARGETS: readonly ResupplyTarget[] = ["tomorrow", "asap"];

/** La visée relue d'une valeur stockée, refusée si inconnue. */
export function resupplyTargetOf(value: string): ResupplyTarget {
  const target = TARGETS.find((known) => known === value);
  if (target === undefined) {
    throw new UnknownResupplyTargetError(value);
  }
  return target;
}

export type SiteResupplyStatus = "draft" | "placed" | "cancelled";

/** Un geste daté et signé. */
export interface SiteResupplyTrace {
  readonly at: Date;
  readonly author: StaffTrace;
}

/**
 * L'état persisté d'un réassort. Depuis le lot R1c (2026-10-21), le
 * brouillon — « la demande en cours » — se persiste aussi : `placed` est
 * alors `null`.
 */
export interface SiteResupplySnapshot {
  readonly id: string;
  readonly siteId: string;
  readonly target: ResupplyTarget;
  readonly serviceDay: string;
  readonly version: number;
  /** Qui l'envoie (lot R1d) ; `counter` pour tout ce qui précède. */
  readonly origin: ResupplyOrigin;
  /** Son nom libre (lot R1g) ; `null` : sans nom. */
  readonly name: string | null;
  readonly lines: readonly {
    readonly sku: string;
    readonly label: string;
    readonly quantity: number;
  }[];
  readonly placed: SiteResupplyTrace | null;
  readonly cancelled: SiteResupplyTrace | null;
  /**
   * Le signal « il est là » (lot R3e) : la réception au site du transfert
   * qui le porte, ou « Monté » au fournil ; `null` tant qu'il est attendu.
   */
  readonly arrived: SiteResupplyTrace | null;
}

/** Un réassort envoyé (passé, annulé ou non). */
export type PlacedSiteResupplySnapshot = SiteResupplySnapshot & {
  readonly placed: SiteResupplyTrace;
};

/** Le réassort a-t-il été envoyé ? Un brouillon ne l'a pas été. */
export function isPlaced(snapshot: SiteResupplySnapshot): snapshot is PlacedSiteResupplySnapshot {
  return snapshot.placed !== null;
}

/** La journée qu'une visée désigne à l'instant `at`, à l'heure de Paris. */
export function serviceDayFor(target: ResupplyTarget, at: Date): string {
  const today = instantToLocal(at).day;
  return target === "tomorrow" ? addDays(today, 1) : today;
}
