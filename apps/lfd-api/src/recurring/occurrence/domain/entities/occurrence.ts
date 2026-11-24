import type { OccurrenceRefusalCause } from "../refusal-cause.js";
import type { IsoDate } from "../../../basket/domain/value-objects/iso-date.js";
import type { BasketLine } from "../../../basket/domain/value-objects/basket-line.js";
import { OccurrenceTransitionRefusedError } from "../errors/occurrence-errors.js";

/** Une échéance se passe une semaine avant son jour (Q1 du planificateur, Hugo, 2026-11-23). */
export const PLACEMENT_LEAD_DAYS = 7;

/**
 * Les états d'une échéance (plan `plan-bloc-recurrent.md`, § 5) :
 *
 * - `planned` : créée à l'avance, à passer ;
 * - `skipped` : le client l'a sautée — il peut la rétablir ;
 * - `placed` : le commerce l'a passée, elle porte sa commande ;
 * - `refused` : refus que le staff peut corriger, repris au passage suivant ;
 * - `missed` : l'heure limite est passée sans commande ;
 * - `cancelled` : panier arrêté, ou jour tombé pendant une pause.
 */
export type OccurrenceState = "planned" | "skipped" | "placed" | "refused" | "missed" | "cancelled";

/** Les états que le balayage passe : ceux que l'index `occurrence_due_idx` couvre. */
export const DUE_STATES = ["planned", "refused"] as const satisfies readonly OccurrenceState[];

/** L'état d'une échéance, tel qu'il s'écrit (aucun type Prisma). */
export interface OccurrenceSnapshot {
  readonly id: string;
  readonly basketId: string;
  readonly serviceDay: IsoDate;
  readonly placeOn: IsoDate;
  readonly state: OccurrenceState;
  /** Les lignes de la dérogation ; `null` = celles du gabarit. */
  readonly lines: readonly BasketLine[] | null;
  readonly note: string;
  readonly orderId: string | null;
  readonly cause: OccurrenceRefusalCause | null;
  readonly reason: string | null;
  readonly settledAt: Date | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

/**
 * **Une échéance** : le jour qu'un panier vise, devenu une ligne. Elle porte
 * son état, sa dérogation et son issue, et refuse une transition que le cycle
 * du § 5 n'admet pas. Chaque méthode reproduit la forme que le `CHECK`
 * `occurrence_state_shape` exige : une commande seulement si passée, une
 * cause et sa phrase si refusée ou manquée, une heure d'issue dans ces trois
 * cas ; une échéance annulée garde la cause d'un refus antérieur.
 *
 * `loadedState` est l'état relu : l'adaptateur n'écrit qu'à condition que la
 * ligne y soit encore — deux écrivains concurrents ne s'écrasent pas.
 */
export class Occurrence {
  private constructor(
    private current: OccurrenceSnapshot,
    readonly loadedState: OccurrenceState | null,
  ) {}

  /** Une échéance neuve, à passer `PLACEMENT_LEAD_DAYS` jours avant son jour. */
  static plan(input: {
    readonly id: string;
    readonly basketId: string;
    readonly serviceDay: IsoDate;
    readonly at: Date;
  }): Occurrence {
    return new Occurrence(
      {
        id: input.id,
        basketId: input.basketId,
        serviceDay: input.serviceDay,
        placeOn: input.serviceDay.plusDays(-PLACEMENT_LEAD_DAYS),
        state: "planned",
        lines: null,
        note: "",
        orderId: null,
        cause: null,
        reason: null,
        settledAt: null,
        createdAt: input.at,
        updatedAt: input.at,
      },
      null,
    );
  }

  /** Reconstitue une échéance relue. */
  static reconstitute(snapshot: OccurrenceSnapshot): Occurrence {
    return new Occurrence(snapshot, snapshot.state);
  }

  get snapshot(): OccurrenceSnapshot {
    return this.current;
  }

  get id(): string {
    return this.current.id;
  }

  get serviceDay(): IsoDate {
    return this.current.serviceDay;
  }

  get state(): OccurrenceState {
    return this.current.state;
  }

  /**
   * **Remplace les lignes** de cette échéance (`null` : revenir au gabarit),
   * ou rétablit une échéance sautée. Admis tant qu'elle n'est pas passée :
   * `planned`, `refused` — une nouvelle composition peut lever la cause —, et
   * `skipped`, qui redevient `planned`.
   */
  override(lines: readonly BasketLine[] | null, note: string, at: Date): void {
    const state = this.current.state;
    this.ensureIn(["planned", "refused", "skipped"], "modifier");
    this.current = {
      ...this.current,
      state: state === "skipped" ? "planned" : state,
      lines,
      note,
      updatedAt: at,
    };
  }

  /**
   * **Rétablit** l'échéance : elle revient au gabarit, sans dérogation ni
   * note. Admis tant qu'elle n'est pas passée — une échéance sautée
   * redevient `planned`, une échéance refusée garde son état et sera reprise
   * au passage suivant. Rend faux quand il n'y avait rien à rétablir.
   */
  restore(at: Date): boolean {
    this.ensureIn(["planned", "refused", "skipped"], "rétablir");
    const { state, lines, note } = this.current;
    if (state !== "skipped" && lines === null && note === "") {
      return false;
    }
    this.override(null, "", at);
    return true;
  }

  /**
   * **Saute** l'échéance : aucune commande ce jour-là. Admis depuis `planned`
   * et depuis `refused` — le client renonce au jour que la passation refusait.
   * Une échéance sautée n'a pas d'issue : la cause du refus s'efface avec elle
   * (forme du `CHECK`), et si elle est rétablie, un nouveau refus alertera.
   */
  skip(note: string, at: Date): void {
    this.ensureIn(DUE_STATES, "sauter");
    this.current = {
      ...this.current,
      state: "skipped",
      lines: null,
      note,
      cause: null,
      reason: null,
      settledAt: null,
      updatedAt: at,
    };
  }

  /** **Passée** par le commerce : elle porte sa commande, sans cause. */
  place(orderId: string, at: Date): void {
    this.ensureIn(DUE_STATES, "passer");
    this.current = {
      ...this.current,
      state: "placed",
      orderId,
      cause: null,
      reason: null,
      settledAt: at,
      updatedAt: at,
    };
  }

  /**
   * **Refusée** (corrigeable) ou **manquée** (`final` : l'heure limite est
   * passée). Rend vrai quand la cause est nouvelle — le seul moment où
   * l'alerte staff repart.
   */
  refuse(cause: OccurrenceRefusalCause, reason: string, final: boolean, at: Date): boolean {
    this.ensureIn(DUE_STATES, "refuser");
    const newCause = this.current.cause !== cause;
    this.current = {
      ...this.current,
      state: final ? "missed" : "refused",
      cause,
      reason,
      settledAt: at,
      updatedAt: at,
    };
    return newCause;
  }

  /**
   * **Annulée** : panier arrêté, ou jour tombé pendant une pause. Admis tant
   * qu'elle n'a pas d'issue close. La cause d'un refus antérieur reste :
   * l'historique ne s'efface pas.
   */
  cancel(at: Date): void {
    this.ensureIn(["planned", "skipped", "refused"], "annuler");
    this.current = { ...this.current, state: "cancelled", updatedAt: at };
  }

  private ensureIn(states: readonly OccurrenceState[], gesture: string): void {
    if (!states.includes(this.current.state)) {
      throw new OccurrenceTransitionRefusedError(
        this.current.serviceDay.toString(),
        this.current.state,
        gesture,
      );
    }
  }
}
