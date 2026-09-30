import { instantToLocal } from "@lfd/contracts";

import {
  InvalidVehicleNameError,
  RefrigeratedVolumeExceedsCargoError,
  VehicleAlreadyRetiredError,
  VehicleNotRetiredError,
} from "../errors/delivery-errors.js";
import {
  InvalidWheelArchesError,
  WheelArchesWithoutCargoError,
} from "../errors/delivery-floor-errors.js";
import { CargoFloor } from "../value-objects/cargo-floor.js";
import { type CargoDimensions, CargoSpace } from "../value-objects/cargo-space.js";
import { LicensePlate } from "../value-objects/license-plate.js";
import {
  RefrigeratedCompartment,
  type RefrigerationSpec,
} from "../value-objects/refrigerated-compartment.js";
import type { MeasuredWheelArches, WheelArches } from "../value-objects/wheel-arches.js";
import { type VehicleEnergy, vehicleEnergyOf } from "../value-objects/vehicle-energy.js";

/** Le nom tient sur une étiquette de tableau : la borne du contrat, reprise ici. */
export const VEHICLE_NAME_MAX_LENGTH = 60;

/** L'état persisté d'un véhicule — ce que `toDomain` réhydrate. */
export interface VehicleState {
  readonly id: string;
  readonly name: string;
  readonly plate: string;
  readonly retiredAt: Date | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly cargo: CargoDimensions | null;
  readonly wheelArches: MeasuredWheelArches | null;
  readonly refrigeration: RefrigerationSpec | null;
  /** Texte comme la plaque : `restore` le revalide. */
  readonly energy: string | null;
}

/**
 * Ce qu'une création ou une correction dit d'un véhicule. La fiche est
 * COMPLÈTE : `cargo`, `wheelArches`, `refrigeration` ou `energy` absents valent
 * `null` — des dimensions inconnues, un plancher rectangle, un véhicule sec, une
 * énergie non renseignée — et jamais « inchangé ».
 */
export interface VehicleIdentity {
  readonly name: string;
  readonly plate: string;
  readonly cargo?: CargoDimensions | null | undefined;
  readonly wheelArches?: MeasuredWheelArches | null | undefined;
  readonly refrigeration?: RefrigerationSpec | null | undefined;
  readonly energy?: string | null | undefined;
}

/** Le chargement d'un véhicule et son énergie, validés — ses parties et la règle qui les lie. */
interface LoadSpace {
  readonly cargo: CargoSpace | null;
  readonly wheelArches: WheelArches | null;
  readonly refrigeration: RefrigeratedCompartment | null;
  readonly energy: VehicleEnergy | null;
}

/**
 * **Un véhicule de la flotte** — l'agrégat qui porte son cycle de vie.
 *
 * Il n'est jamais supprimé (`CLAUDE.md` §3) : il est **retiré, à une date**,
 * et peut être réactivé. La date et non un drapeau, parce que la composition
 * des tournées lira « actif ce jour-là » : un retrait ne doit pas effacer le
 * véhicule des tournées déjà composées avant lui.
 *
 * L'unicité de la plaque entre véhicules EN SERVICE n'est pas ici : elle
 * concerne la flotte entière, et c'est la base qui la tient (index partiel).
 */
export class Vehicle {
  private constructor(
    readonly id: string,
    private currentName: string,
    private currentPlate: LicensePlate,
    private currentRetiredAt: Date | null,
    readonly createdAt: Date,
    private currentUpdatedAt: Date,
    private currentLoad: LoadSpace,
  ) {}

  /**
   * Un véhicule entre dans la flotte, en service.
   * @throws {InvalidVehicleNameError} @throws {InvalidLicensePlateError}
   * @throws {InvalidCargoDimensionsError} @throws {InvalidRefrigerationError}
   * @throws {RefrigeratedVolumeExceedsCargoError} @throws {InvalidWheelArchesError}
   * @throws {WheelArchesWithoutCargoError}
   */
  static register(input: VehicleIdentity & { readonly id: string; readonly at: Date }): Vehicle {
    return new Vehicle(
      input.id,
      nameOf(input.name),
      LicensePlate.of(input.plate),
      null,
      input.at,
      input.at,
      loadSpaceOf(input),
    );
  }

  /** Réhydrate un véhicule lu en base ; la plaque et le chargement se revalident. */
  static restore(state: VehicleState): Vehicle {
    return new Vehicle(
      state.id,
      state.name,
      LicensePlate.of(state.plate),
      state.retiredAt,
      state.createdAt,
      state.updatedAt,
      loadSpaceOf(state),
    );
  }

  get name(): string {
    return this.currentName;
  }

  get plate(): LicensePlate {
    return this.currentPlate;
  }

  get retiredAt(): Date | null {
    return this.currentRetiredAt;
  }

  /** Dimensions utiles, ou `null` si inconnues. */
  get cargo(): CargoSpace | null {
    return this.currentLoad.cargo;
  }

  /** Passages de roue, ou `null` : le plancher est un rectangle (G-D2). */
  get wheelArches(): WheelArches | null {
    return this.currentLoad.wheelArches;
  }

  /** Caisse réfrigérée, ou `null` pour un véhicule sec. */
  get refrigeration(): RefrigeratedCompartment | null {
    return this.currentLoad.refrigeration;
  }

  /** Énergie, ou `null` si non renseignée. */
  get energy(): VehicleEnergy | null {
    return this.currentLoad.energy;
  }

  /** La fiche telle qu'une correction la décrit — l'« avant » du journal. */
  get identity(): VehicleIdentity {
    return {
      name: this.currentName,
      plate: this.currentPlate.value,
      cargo: this.currentLoad.cargo?.toDimensions() ?? null,
      wheelArches: this.currentLoad.wheelArches?.measured() ?? null,
      refrigeration: this.currentLoad.refrigeration?.toSpec() ?? null,
      energy: this.currentLoad.energy,
    };
  }

  get updatedAt(): Date {
    return this.currentUpdatedAt;
  }

  get inService(): boolean {
    return this.currentRetiredAt === null;
  }

  /** Peut-il porter une tournée du jour `day` (`AAAA-MM-JJ`) ? Cf. {@link activeOnDay}. */
  activeOn(day: string): boolean {
    return activeOnDay(this.currentRetiredAt, day);
  }

  /**
   * Corrige la fiche ENTIÈRE — nom, plaque, dimensions, froid. Permis sur un
   * véhicule retiré : corriger une faute de saisie ne le remet pas en service.
   * Tout est validé avant la moindre affectation : un refus ne laisse pas une
   * fiche à moitié corrigée.
   */
  correct(identity: VehicleIdentity, at: Date): void {
    const name = nameOf(identity.name);
    const plate = LicensePlate.of(identity.plate);
    const load = loadSpaceOf(identity);
    this.currentName = name;
    this.currentPlate = plate;
    this.currentLoad = load;
    this.currentUpdatedAt = at;
  }

  /** @throws {VehicleAlreadyRetiredError} il l'est déjà — sa date ne se réécrit pas. */
  retire(at: Date): void {
    if (this.currentRetiredAt !== null) {
      throw new VehicleAlreadyRetiredError(this.currentName);
    }
    this.currentRetiredAt = at;
    this.currentUpdatedAt = at;
  }

  /** @throws {VehicleNotRetiredError} il roule déjà. */
  reactivate(at: Date): void {
    if (this.currentRetiredAt === null) {
      throw new VehicleNotRetiredError(this.currentName);
    }
    this.currentRetiredAt = null;
    this.currentUpdatedAt = at;
  }

  toState(): VehicleState {
    return {
      id: this.id,
      name: this.currentName,
      plate: this.currentPlate.value,
      retiredAt: this.currentRetiredAt,
      createdAt: this.createdAt,
      updatedAt: this.currentUpdatedAt,
      cargo: this.currentLoad.cargo?.toDimensions() ?? null,
      wheelArches: this.currentLoad.wheelArches?.measured() ?? null,
      refrigeration: this.currentLoad.refrigeration?.toSpec() ?? null,
      energy: this.currentLoad.energy,
    };
  }
}

/**
 * **« Actif ce jour-là »** (plan de tournée, lot 3, C5 corrigé par C14) : un
 * véhicule peut porter une tournée du jour J s'il n'est pas retiré, ou si le
 * jour **de Paris** de son retrait est J ou après. Le retirer aujourd'hui laisse
 * donc vivre la tournée d'aujourd'hui.
 *
 * Le jour en paramètre, sans horloge : la règle est pure. Les jours
 * `AAAA-MM-JJ` se comparent comme des chaînes.
 */
export function activeOnDay(retiredAt: Date | null, day: string): boolean {
  return retiredAt === null || instantToLocal(retiredAt).day >= day;
}

/** @throws {InvalidVehicleNameError} vide ou trop long. */
function nameOf(raw: string): string {
  const name = raw.trim();
  if (name.length === 0 || name.length > VEHICLE_NAME_MAX_LENGTH) {
    throw new InvalidVehicleNameError(VEHICLE_NAME_MAX_LENGTH);
  }
  return name;
}

/**
 * Les passages de roue n'existent que sur un plancher connu : `CargoFloor` les
 * confronte à sa largeur et à sa longueur (G-D2).
 *
 * @throws {WheelArchesWithoutCargoError} @throws {InvalidWheelArchesError}
 */
function wheelArchesOf(
  cargo: CargoSpace | null,
  input: MeasuredWheelArches | null | undefined,
): WheelArches | null {
  if (input === null || input === undefined) {
    return null;
  }
  if (cargo === null) {
    throw new WheelArchesWithoutCargoError();
  }
  const arches = CargoFloor.of({ ...cargo.toDimensions(), wheelArches: input }).wheelArches;
  // Le type exige la hauteur ; un appelant hors du contrat la refuse ici.
  if (arches?.measured() === null) {
    throw new InvalidWheelArchesError("la hauteur manque");
  }
  return arches;
}

/**
 * Valide les deux parties du chargement, puis la règle qui les lie ; l'énergie
 * suit le même chemin, parce qu'elle vit dans la même fiche complète : le volume
 * réfrigéré ne dépasse pas le volume utile quand celui-ci est connu (L2b-C2).
 *
 * @throws {InvalidCargoDimensionsError} @throws {InvalidRefrigerationError}
 * @throws {RefrigeratedVolumeExceedsCargoError} @throws {InvalidVehicleEnergyError}
 * @throws {WheelArchesWithoutCargoError} @throws {InvalidWheelArchesError}
 */
function loadSpaceOf(
  input: Pick<VehicleIdentity, "cargo" | "wheelArches" | "refrigeration" | "energy">,
): LoadSpace {
  const cargoInput = input.cargo ?? null;
  const refrigerationInput = input.refrigeration ?? null;
  const cargo = cargoInput === null ? null : CargoSpace.of(cargoInput);
  const refrigeration =
    refrigerationInput === null ? null : RefrigeratedCompartment.of(refrigerationInput);
  if (cargo !== null && refrigeration !== null && refrigeration.volumeLiters > cargo.volumeLiters) {
    throw new RefrigeratedVolumeExceedsCargoError(refrigeration.volumeLiters, cargo.volumeLiters);
  }
  const energyInput = input.energy ?? null;
  return {
    cargo,
    wheelArches: wheelArchesOf(cargo, input.wheelArches),
    refrigeration,
    energy: energyInput === null ? null : vehicleEnergyOf(energyInput),
  };
}
