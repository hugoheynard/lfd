import { InvalidPurchaseCandidateNameError } from "../errors/delivery-purchase-errors.js";
import { InvalidWheelArchesError } from "../errors/delivery-floor-errors.js";
import { CargoFloor } from "../value-objects/cargo-floor.js";
import type { CargoDimensions } from "../value-objects/cargo-space.js";
import {
  PurchaseListing,
  type PurchaseListingInput,
  type PurchaseListingState,
} from "../value-objects/purchase-listing.js";
import type { MeasuredWheelArches } from "../value-objects/wheel-arches.js";
import type { DeliveryAuthor } from "./departure-choice.js";
import {
  PurchaseCandidateLifecycle,
  type PurchaseCandidateLifecycleState,
} from "./purchase-candidate-lifecycle.js";

/** La borne du contrat (`PURCHASE_CANDIDATE_NAME_MAX_LENGTH`), reprise ici. */
export const PURCHASE_CANDIDATE_NAME_MAX_LENGTH = 60;

/**
 * Ce qu'une déclaration ou une correction dit d'un véhicule candidat — la
 * fiche COMPLÈTE : un champ facultatif absent vaut `null`, jamais « inchangé ».
 */
export interface PurchaseVehicleCandidateSpec extends PurchaseListingInput {
  readonly name: string;
  readonly cargo: CargoDimensions;
  readonly wheelArches?: MeasuredWheelArches | null | undefined;
}

/** La fiche telle qu'elle se range et se journalise : tout est explicite. */
export interface PurchaseVehicleCandidateSheet extends PurchaseListingState {
  readonly name: string;
  readonly cargo: CargoDimensions;
  readonly wheelArches: MeasuredWheelArches | null;
}

/** L'état persisté — ce que `toDomain` réhydrate. */
export interface PurchaseVehicleCandidateState
  extends PurchaseVehicleCandidateSheet, PurchaseCandidateLifecycleState {
  readonly id: string;
}

interface ValidSheet {
  readonly name: string;
  readonly floor: CargoFloor;
  readonly listing: PurchaseListing;
}

/**
 * **Un véhicule candidat** de la bibliothèque d'achat
 * (`documentation/livraisons/plan-bibliotheque-d-achat.md`, B-D1, lot B1) :
 * une camionnette qu'on envisage d'acheter. Ce n'est PAS un `Vehicle` — il n'a
 * ni plaque ni tournée, et vit dans sa propre table, qu'aucune lecture de la
 * flotte ne voit.
 *
 * Son plancher obéit pourtant aux MÊMES règles qu'un vrai véhicule, par les
 * mêmes value objects : `CargoFloor` (bornes, saillie, passage dans la
 * longueur, sous le plafond) et des passages mesurés hauteur comprise.
 *
 * L'unicité du nom parmi les candidats non archivés concerne la bibliothèque
 * entière : la base la tient (index partiel), le handler la lit avant d'écrire.
 */
export class PurchaseVehicleCandidate {
  private constructor(
    readonly id: string,
    private sheet: ValidSheet,
    private readonly lifecycle: PurchaseCandidateLifecycle,
  ) {}

  /**
   * @throws {InvalidPurchaseCandidateNameError} @throws {InvalidCargoDimensionsError}
   * @throws {InvalidWheelArchesError} @throws {InvalidPurchaseTextError}
   * @throws {InvalidPurchaseUrlError} @throws {InvalidPurchasePriceError}
   */
  static declare(
    input: PurchaseVehicleCandidateSpec & {
      readonly id: string;
      readonly at: Date;
      readonly author: DeliveryAuthor;
    },
  ): PurchaseVehicleCandidate {
    return new PurchaseVehicleCandidate(
      input.id,
      validSheetOf(input),
      PurchaseCandidateLifecycle.begin("vehicle", input.at, input.author),
    );
  }

  /** Réhydrate un candidat lu en base ; la fiche se revalide. */
  static restore(state: PurchaseVehicleCandidateState): PurchaseVehicleCandidate {
    return new PurchaseVehicleCandidate(
      state.id,
      validSheetOf(state),
      PurchaseCandidateLifecycle.restore("vehicle", state),
    );
  }

  get name(): string {
    return this.sheet.name;
  }

  get floor(): CargoFloor {
    return this.sheet.floor;
  }

  get listing(): PurchaseListing {
    return this.sheet.listing;
  }

  get archivedAt(): Date | null {
    return this.lifecycle.archivedAt;
  }

  get inLibrary(): boolean {
    return this.lifecycle.inLibrary;
  }

  /** La fiche entière, explicite — l'« avant » et l'« après » du journal. */
  get specification(): PurchaseVehicleCandidateSheet {
    const { floor } = this.sheet;
    return {
      name: this.sheet.name,
      cargo: floor.space.toDimensions(),
      wheelArches: floor.wheelArches?.measured() ?? null,
      ...this.sheet.listing.toState(),
    };
  }

  /**
   * Corrige la fiche ENTIÈRE. Permis sur un candidat archivé : corriger une
   * faute ne le remet pas dans la bibliothèque. Tout est validé avant la
   * moindre affectation.
   */
  correct(spec: PurchaseVehicleCandidateSpec, at: Date, author: DeliveryAuthor): void {
    this.sheet = validSheetOf(spec);
    this.lifecycle.touch(at, author);
  }

  /** @throws {PurchaseCandidateAlreadyArchivedError} */
  archive(at: Date, author: DeliveryAuthor): void {
    this.lifecycle.archive(this.sheet.name, at, author);
  }

  /** @throws {PurchaseCandidateNotArchivedError} */
  reactivate(at: Date, author: DeliveryAuthor): void {
    this.lifecycle.reactivate(this.sheet.name, at, author);
  }

  toState(): PurchaseVehicleCandidateState {
    return { id: this.id, ...this.specification, ...this.lifecycle.toState() };
  }
}

/**
 * @throws {InvalidPurchaseCandidateNameError} @throws {InvalidCargoDimensionsError}
 * @throws {InvalidWheelArchesError} @throws {InvalidPurchaseTextError}
 * @throws {InvalidPurchaseUrlError} @throws {InvalidPurchasePriceError}
 */
function validSheetOf(input: PurchaseVehicleCandidateSpec): ValidSheet {
  const name = input.name.trim();
  if (name.length === 0 || name.length > PURCHASE_CANDIDATE_NAME_MAX_LENGTH) {
    throw new InvalidPurchaseCandidateNameError("vehicle", PURCHASE_CANDIDATE_NAME_MAX_LENGTH);
  }
  const floor = CargoFloor.of({ ...input.cargo, wheelArches: input.wheelArches ?? null });
  // Comme un vrai véhicule : des bacs s'empilent par-dessus, la hauteur compte.
  if (floor.wheelArches !== null && floor.wheelArches.measured() === null) {
    throw new InvalidWheelArchesError("la hauteur manque");
  }
  return { name, floor, listing: PurchaseListing.of(input) };
}
