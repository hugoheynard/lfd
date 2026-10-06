import {
  DELIVERY_INCIDENT_NOTE_MAX,
  DELIVERY_INCIDENT_REASONS,
  type DeliveryIncidentFamily,
} from "@lfd/contracts";

import {
  DeliveryRoundReturnedError,
  DoorstepIncidentWithoutStopError,
  DoorstepRoundNotDepartedError,
  DoorstepStopNotFoundError,
  IncidentNoteTooLongError,
  InvalidIncidentReasonError,
} from "../errors/delivery-doorstep-errors.js";

/** La tournée telle que le signalement la voit : son jour, son départ, ses arrêts. */
export interface IncidentRound {
  readonly id: string;
  readonly serviceDay: string;
  readonly departed: boolean;
  /** Rentrée (« Tournée terminée », PL2) : plus aucun signalement. */
  readonly returned: boolean;
  /** Les arrêts non retirés de la tournée, clos compris. */
  readonly stopIds: ReadonlySet<string>;
}

/** Qui signale, son nom figé au geste ; `""` quand l'annuaire n'en connaît pas. */
export interface IncidentAuthor {
  readonly staffUserId: string;
  readonly name: string;
}

/** Ce que le livreur déclare. */
export interface IncidentReport {
  readonly id: string;
  readonly round: IncidentRound;
  readonly stopId: string | null;
  readonly family: DeliveryIncidentFamily;
  readonly reason: string;
  readonly note: string;
  /** La clé de stockage de la photo, composée par l'application ; `null` sans photo. */
  readonly photoKey: string | null;
  readonly at: Date;
  readonly author: IncidentAuthor;
}

/** Un signalement tel qu'il s'écrit. */
export interface DeliveryIncidentState {
  readonly id: string;
  readonly roundId: string;
  readonly stopId: string | null;
  readonly serviceDay: string;
  readonly family: DeliveryIncidentFamily;
  readonly reason: string;
  readonly note: string;
  readonly photoKey: string | null;
  readonly reportedAt: Date;
  readonly reportedBy: string;
  readonly reportedByName: string;
}

/**
 * **Un problème signalé par le livreur** (`documentation/livraisons/a-la-porte.md`,
 * § 3, AP-Q4) — un FAIT daté. Il ne clôt rien et ne touche pas la commande ;
 * il ne se corrige ni ne se supprime, donc il n'a pas de méthode : sa seule
 * règle est de naître juste.
 *
 * Ce que `report` refuse :
 * - une tournée encore au dépôt — les gestes de la porte suivent le départ ;
 * - une tournée rentrée (PL2) — ils s'arrêtent au retour ;
 * - un arrêt qui n'est pas de cette tournée ;
 * - un problème à la remise sans arrêt (il porte sur l'arrêt) ;
 * - un motif hors de la liste de sa famille (`DELIVERY_INCIDENT_REASONS`) ;
 * - une note de plus de 500 caractères.
 *
 * Un problème technique ou routier porte sur la tournée ; l'arrêt en cours y
 * est noté s'il y en a un.
 */
export class DeliveryIncident {
  private constructor(private readonly state: DeliveryIncidentState) {}

  /**
   * @throws {DoorstepRoundNotDepartedError} @throws {DeliveryRoundReturnedError}
   * @throws {DoorstepStopNotFoundError}
   * @throws {DoorstepIncidentWithoutStopError} @throws {InvalidIncidentReasonError}
   * @throws {IncidentNoteTooLongError}
   */
  static report(input: IncidentReport): DeliveryIncident {
    if (!input.round.departed) {
      throw new DoorstepRoundNotDepartedError();
    }
    if (input.round.returned) {
      throw new DeliveryRoundReturnedError();
    }
    if (input.stopId !== null && !input.round.stopIds.has(input.stopId)) {
      throw new DoorstepStopNotFoundError();
    }
    if (input.family === "doorstep" && input.stopId === null) {
      throw new DoorstepIncidentWithoutStopError();
    }
    const reasons: readonly string[] = DELIVERY_INCIDENT_REASONS[input.family];
    if (!reasons.includes(input.reason)) {
      throw new InvalidIncidentReasonError(input.family, input.reason);
    }
    const note = input.note.trim();
    if (note.length > DELIVERY_INCIDENT_NOTE_MAX) {
      throw new IncidentNoteTooLongError(note.length, DELIVERY_INCIDENT_NOTE_MAX);
    }
    return new DeliveryIncident({
      id: input.id,
      roundId: input.round.id,
      stopId: input.stopId,
      serviceDay: input.round.serviceDay,
      family: input.family,
      reason: input.reason,
      note,
      photoKey: input.photoKey,
      reportedAt: input.at,
      reportedBy: input.author.staffUserId,
      reportedByName: input.author.name,
    });
  }

  get id(): string {
    return this.state.id;
  }

  get stopId(): string | null {
    return this.state.stopId;
  }

  get family(): DeliveryIncidentFamily {
    return this.state.family;
  }

  get reason(): string {
    return this.state.reason;
  }

  get hasPhoto(): boolean {
    return this.state.photoKey !== null;
  }

  toSnapshot(): DeliveryIncidentState {
    return { ...this.state };
  }
}

/**
 * La clé de stockage d'une photo de problème — composée ici, jamais reçue du
 * client : le chemin porte la tournée, et l'identifiant du signalement.
 */
export function incidentPhotoKey(roundId: string, incidentId: string): string {
  return `delivery/incidents/${roundId}/${incidentId}`;
}
