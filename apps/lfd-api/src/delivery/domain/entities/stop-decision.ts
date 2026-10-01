import type { StopDecisionOutcome, StopDecisionSource, StopDecisionState } from "@lfd/contracts";

import {
  StopDecisionOnClosedStopError,
  StopDecisionOnReturnedRoundError,
} from "../errors/delivery-decision-errors.js";

/** Ce qu'une décision retient, tel qu'il s'écrit. */
export interface StopDecisionSnapshot {
  readonly stopId: string;
  readonly roundId: string;
  readonly orderId: string;
  readonly serviceDay: string;
  /** Le premier signalement qui l'a ouverte. */
  readonly openedByIncidentId: string;
  readonly openedAt: Date;
  /** `null` : à décider. */
  readonly outcome: StopDecisionOutcome | null;
  readonly source: StopDecisionSource | null;
  readonly decidedAt: Date | null;
  /** La fiche staff qui a répondu en dernier ; `null` à décider (ou pour un réglage, B3 bis). */
  readonly decidedBy: string | null;
  /** Son nom figé à la réponse ; `""` quand l'annuaire n'en connaissait pas. */
  readonly decidedByName: string | null;
}

/** Ce qui ouvre une décision : un signalement à la remise, sur un arrêt d'une tournée. */
export interface StopDecisionOpening {
  readonly stopId: string;
  readonly roundId: string;
  readonly orderId: string;
  readonly serviceDay: string;
  readonly incidentId: string;
  readonly at: Date;
}

/**
 * L'arrêt tel que la décision le voit, lu SOUS LE VERROU de sa tournée : son
 * numéro pour les refus, clos ou non, tournée rentrée ou non.
 */
export interface DecidedStop {
  readonly label: string;
  readonly closed: boolean;
  readonly returned: boolean;
}

/** Qui répond : une fiche staff, son nom figé au geste (`""` quand l'annuaire n'en a pas). */
export interface DecisionAuthor {
  readonly staffUserId: string;
  readonly name: string;
}

/**
 * **La décision du commercial sur un arrêt** (`documentation/livraisons/plan-a-la-porte.md`,
 * § 10 B3, § 10 bis « La décision a un propriétaire », LB-Q2, LB-Q5).
 *
 * Invariants tenus ici :
 * - on ne décide que sur un arrêt OUVERT d'une tournée NON RENTRÉE — la
 *   tournée elle-même est lue sous son verrou par l'application, que le dépôt
 *   du livreur prend aussi : décider et déposer ne se croisent jamais ;
 * - « Autoriser » puis « Rapporter » sont permis tant que l'arrêt est ouvert,
 *   et la DERNIÈRE réponse l'emporte — rapporter clôt l'arrêt (LB-Q2), donc
 *   rien ne peut plus suivre ;
 * - répéter la réponse en vigueur ne change rien (`false`) : le premier qui
 *   l'a donnée reste son auteur.
 *
 * Elle ne touche pas la tournée : la version que présente le livreur ne bouge
 * pas pour une autorisation. Ce n'est pas elle qui clôt l'arrêt rapporté —
 * c'est la tournée (`closeStop`), appelée par l'application dans la même
 * unité.
 *
 * `loadedVersion` : `null` à l'ouverture ; sinon celle qu'on a lue, que
 * l'adaptateur exige encore en base.
 */
export class StopDecision {
  private current: StopDecisionSnapshot;

  private constructor(
    state: StopDecisionSnapshot,
    readonly loadedVersion: number | null,
  ) {
    this.current = state;
  }

  /** Ouverte par un signalement à la remise ; personne n'a encore répondu. */
  static open(opening: StopDecisionOpening): StopDecision {
    return new StopDecision(
      {
        stopId: opening.stopId,
        roundId: opening.roundId,
        orderId: opening.orderId,
        serviceDay: opening.serviceDay,
        openedByIncidentId: opening.incidentId,
        openedAt: opening.at,
        outcome: null,
        source: null,
        decidedAt: null,
        decidedBy: null,
        decidedByName: null,
      },
      null,
    );
  }

  static restore(state: StopDecisionSnapshot, version: number): StopDecision {
    return new StopDecision(state, version);
  }

  get stopId(): string {
    return this.current.stopId;
  }

  get roundId(): string {
    return this.current.roundId;
  }

  get orderId(): string {
    return this.current.orderId;
  }

  get state(): StopDecisionState {
    return this.current.outcome ?? "pending";
  }

  get source(): StopDecisionSource | null {
    return this.current.source;
  }

  /**
   * « Autoriser le dépôt cette fois » (B3) : la carte du livreur propose
   * « Déposé avec preuve » pour cet arrêt, même signature exigée (LB-Q5).
   *
   * @returns `false` : c'était déjà la réponse en vigueur, rien ne change.
   * @throws {StopDecisionOnReturnedRoundError} @throws {StopDecisionOnClosedStopError}
   */
  authorizeDeposit(stop: DecidedStop, by: DecisionAuthor, at: Date): boolean {
    return this.decide("authorize_deposit", stop, by, at);
  }

  /**
   * « Rapporter » (B3, LB-Q2) : la décision se pose ici ; l'application clôt
   * l'arrêt par la tournée dans la même unité.
   *
   * @returns `false` : c'était déjà la réponse en vigueur.
   * @throws {StopDecisionOnReturnedRoundError} @throws {StopDecisionOnClosedStopError}
   */
  bringBack(stop: DecidedStop, by: DecisionAuthor, at: Date): boolean {
    return this.decide("bring_back", stop, by, at);
  }

  /**
   * La réponse d'un **réglage décidé d'avance** (B3 bis, LB-Q6) : la règle
   * figée au départ répond à la place du commercial, au signalement même.
   * Mêmes refus qu'une réponse du commercial ; ni auteur ni nom — c'est le
   * réglage qui a décidé, `source = setting`.
   *
   * @returns `false` : c'était déjà la réponse en vigueur.
   * @throws {StopDecisionOnReturnedRoundError} @throws {StopDecisionOnClosedStopError}
   */
  settle(outcome: StopDecisionOutcome, stop: DecidedStop, at: Date): boolean {
    return this.decide(outcome, stop, null, at);
  }

  toSnapshot(): StopDecisionSnapshot {
    return { ...this.current };
  }

  /** `by` nul : le réglage décide (`setting`) ; sinon un commercial (`staff`). */
  private decide(
    outcome: StopDecisionOutcome,
    stop: DecidedStop,
    by: DecisionAuthor | null,
    at: Date,
  ): boolean {
    if (stop.returned) {
      throw new StopDecisionOnReturnedRoundError(stop.label);
    }
    if (stop.closed) {
      throw new StopDecisionOnClosedStopError(stop.label);
    }
    if (this.current.outcome === outcome) {
      return false;
    }
    this.current = {
      ...this.current,
      outcome,
      source: by === null ? "setting" : "staff",
      decidedAt: at,
      decidedBy: by?.staffUserId ?? null,
      decidedByName: by?.name ?? null,
    };
    return true;
  }
}
