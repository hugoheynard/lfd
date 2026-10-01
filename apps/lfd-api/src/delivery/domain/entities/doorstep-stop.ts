import {
  DeliveryRoundReturnedError,
  DoorstepRoundNotDepartedError,
  DoorstepStopClosedError,
} from "../errors/delivery-doorstep-errors.js";

/** La tournée d'un arrêt, telle que le journal la cite : véhicule, jour, passage. */
export interface DoorstepRoundKey {
  readonly roundId: string;
  readonly vehicleName: string;
  readonly serviceDay: string;
  readonly passage: number;
}

/** Un arrêt de MA tournée, vu de la porte. */
export interface DoorstepStopState {
  readonly stopId: string;
  readonly orderId: string;
  readonly round: DoorstepRoundKey;
  /** Partie le, ou `null` : au dépôt — aucune exécution n'existe encore. */
  readonly departedAt: Date | null;
  /** Rentrée le (« Tournée terminée », PL2), ou `null` : elle roule. */
  readonly returnedAt: Date | null;
  /** Le numéro de commande figé au départ ; `""` au dépôt. */
  readonly reference: string;
  /** Clos par la tournée (`closeStop`), ou `null`. */
  readonly closedAt: Date | null;
  readonly arrivedAt: Date | null;
  /**
   * La signature exigée, FIGÉE au départ (`plan-a-la-porte.md`, AP-D4) ;
   * `false` au dépôt — aucune exécution n'existe encore.
   */
  readonly signatureRequired: boolean;
}

/**
 * **Un arrêt, à la porte** (`documentation/livraisons/plan-a-la-porte.md`,
 * AP-D6) — l'EXÉCUTION de l'arrêt, pas la tournée : `arrived_at` vit dans
 * `delivery_stop_execution`, que la tournée n'écrit jamais.
 *
 * Il ne mute que l'arrivée. La clôture appartient à la tournée
 * (`DeliveryRound.closeStop`) : ici, `closedAt` est lu, jamais écrit.
 */
export class DoorstepStop {
  private currentArrivedAt: Date | null;

  private constructor(private readonly state: DoorstepStopState) {
    this.currentArrivedAt = state.arrivedAt;
  }

  static restore(state: DoorstepStopState): DoorstepStop {
    return new DoorstepStop(state);
  }

  get stopId(): string {
    return this.state.stopId;
  }

  get orderId(): string {
    return this.state.orderId;
  }

  get reference(): string {
    return this.state.reference;
  }

  get round(): DoorstepRoundKey {
    return this.state.round;
  }

  get signatureRequired(): boolean {
    return this.state.signatureRequired;
  }

  get arrivedAt(): Date | null {
    return this.currentArrivedAt;
  }

  /**
   * **« Je suis arrivé »** — une fois par arrêt. Une seconde arrivée (un
   * nouvel essai après une perte de réseau) rend `false` et ne réécrit rien :
   * le premier instant fait foi. Vérifiée AVANT la clôture : un arrêt arrivé
   * puis clos répond encore « déjà fait » à qui rejoue son arrivée.
   *
   * @throws {DoorstepRoundNotDepartedError} la tournée est au dépôt.
   * @throws {DeliveryRoundReturnedError} elle est rentrée (PL2).
   * @throws {DoorstepStopClosedError} l'arrêt est clos sans arrivée déclarée.
   */
  arrive(at: Date): boolean {
    if (this.currentArrivedAt !== null) {
      return false;
    }
    if (this.state.departedAt === null) {
      throw new DoorstepRoundNotDepartedError();
    }
    if (this.state.returnedAt !== null) {
      throw new DeliveryRoundReturnedError();
    }
    if (this.state.closedAt !== null) {
      throw new DoorstepStopClosedError();
    }
    this.currentArrivedAt = at;
    return true;
  }
}
