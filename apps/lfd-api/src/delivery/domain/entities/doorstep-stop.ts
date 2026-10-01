import {
  DeliveryRoundReturnedError,
  DepositNotAllowedError,
  DepositSignatureRequiredError,
  DoorstepRoundNotDepartedError,
  DoorstepStopClosedError,
} from "../errors/delivery-doorstep-errors.js";
import { depositPermitted } from "../services/deposit-rule.js";

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
  /**
   * Le dépôt autorisé par le client à l'adresse, FIGÉ au départ (AP-D5) ;
   * `false` au dépôt.
   */
  readonly depositAllowed: boolean;
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

  /** Le numéro figé au départ, ou l'id nu sans instantané — tel que le livreur le lit. */
  get label(): string {
    return this.state.reference === "" ? this.state.orderId : this.state.reference;
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

  /**
   * **« Déposé avec preuve » est-il permis ICI ?** (`plan-a-la-porte.md`, B2,
   * AP-D4, AP-D5, AP-Q6) — la règle de `depositPermitted`, sur les valeurs
   * figées au départ ; le refus nomme laquelle manque, la signature d'abord :
   * elle l'emporte toujours.
   *
   * 🔴 **Point d'extension de B3** (« ou autorisé par un commercial pour cet
   * arrêt », § 10 bis) : la décision vivante s'ajoutera ICI, et nulle part
   * ailleurs — l'écran lit `canDeposit`, qu'il faudra étendre du même pas.
   *
   * @throws {DepositSignatureRequiredError} la signature est exigée.
   * @throws {DepositNotAllowedError} le client n'a pas autorisé le dépôt.
   */
  ensureDepositPermitted(): void {
    if (depositPermitted(this.state)) {
      return;
    }
    if (this.state.signatureRequired) {
      throw new DepositSignatureRequiredError(this.label);
    }
    throw new DepositNotAllowedError(this.label);
  }
}
