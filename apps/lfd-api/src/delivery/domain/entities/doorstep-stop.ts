import type { StopDecisionState } from "@lfd/contracts";

import {
  DeliveryRoundReturnedError,
  DepositNotAllowedError,
  DepositSignatureRequiredError,
  DoorstepRoundNotDepartedError,
  DoorstepStopClosedError,
} from "../errors/delivery-doorstep-errors.js";
import { depositPermitted } from "../services/deposit-rule.js";
import type { GesturePosition } from "../value-objects/gesture-position.js";

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
   * La signature exigée, FIGÉE au départ (`a-la-porte.md`, AP-D4) ;
   * `false` au dépôt — aucune exécution n'existe encore.
   */
  readonly signatureRequired: boolean;
  /**
   * Le dépôt autorisé par le client à l'adresse, FIGÉ au départ (AP-D5) ;
   * `false` au dépôt.
   */
  readonly depositAllowed: boolean;
  /**
   * La décision VIVANTE du commercial sur cet arrêt (B3), lue sous le verrou
   * de la tournée ; `null` : aucun signalement n'en a ouvert.
   */
  readonly decision: StopDecisionState | null;
}

/**
 * **Un arrêt, à la porte** (`documentation/livraisons/livreur/a-la-porte.md`,
 * AP-D6) — l'EXÉCUTION de l'arrêt, pas la tournée : `arrived_at` vit dans
 * `delivery_stop_execution`, que la tournée n'écrit jamais.
 *
 * Il ne mute que l'arrivée. La clôture appartient à la tournée
 * (`DeliveryRound.closeStop`) : ici, `closedAt` est lu, jamais écrit.
 */
export class DoorstepStop {
  private currentArrivedAt: Date | null;
  /** La position relevée à CETTE arrivée ; jamais réhydratée (YA-D4). */
  private currentArrivalPosition: GesturePosition | null = null;

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

  /** La position du téléphone à l'arrivée déclarée par ce geste, ou `null`. */
  get arrivalPosition(): GesturePosition | null {
    return this.currentArrivalPosition;
  }

  /**
   * **« Je suis arrivé »** — une fois par arrêt. Une seconde arrivée (un
   * nouvel essai après une perte de réseau) rend `false` et ne réécrit rien :
   * le premier instant fait foi — et sa position, facultative (YA-D4), avec
   * lui. Vérifiée AVANT la clôture : un arrêt arrivé
   * puis clos répond encore « déjà fait » à qui rejoue son arrivée.
   *
   * @throws {DoorstepRoundNotDepartedError} la tournée est au dépôt.
   * @throws {DeliveryRoundReturnedError} elle est rentrée (PL2).
   * @throws {DoorstepStopClosedError} l'arrêt est clos sans arrivée déclarée.
   */
  arrive(at: Date, position: GesturePosition | null = null): boolean {
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
    this.currentArrivalPosition = position;
    return true;
  }

  /** Un commercial a décidé de rapporter cette commande (B3, LB-Q2). */
  get broughtBack(): boolean {
    return this.state.decision === "bring_back";
  }

  /**
   * **« Déposé avec preuve » est-il permis ICI ?** (`a-la-porte.md`, B2,
   * B3, AP-D4, AP-D5, AP-Q6, LB-Q5) — la règle de `depositPermitted` : les
   * valeurs figées au départ, OU la décision vivante d'un commercial qui
   * autorise le dépôt — elle l'emporte sur la signature (LB-Q5). L'écran lit
   * `canDeposit`, calculé par la même règle. Le refus nomme ce qui manque, la
   * signature d'abord.
   *
   * Une décision qui n'est plus « Autoriser » (« Rapporter » l'a remplacée)
   * n'ouvre plus rien — et « Rapporter » a de toute façon clos l'arrêt.
   *
   * @throws {DepositSignatureRequiredError} la signature est exigée.
   * @throws {DepositNotAllowedError} le client n'a pas autorisé le dépôt.
   */
  ensureDepositPermitted(): void {
    const authorized = this.state.decision === "authorize_deposit";
    if (depositPermitted({ ...this.state, depositAuthorized: authorized })) {
      return;
    }
    if (this.state.signatureRequired) {
      throw new DepositSignatureRequiredError(this.label);
    }
    throw new DepositNotAllowedError(this.label);
  }
}
