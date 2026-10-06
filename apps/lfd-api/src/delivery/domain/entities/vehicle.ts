import { instantToLocal } from "@lfd/contracts";

import {
  InvalidVehicleNameError,
  VehicleAlreadyRetiredError,
  VehicleNotRetiredError,
} from "../errors/delivery-errors.js";
import { AllowedZones } from "../value-objects/allowed-zones.js";
import type { CargoDimensions, CargoSpace } from "../value-objects/cargo-space.js";
import { LicensePlate } from "../value-objects/license-plate.js";
import type {
  RefrigeratedCompartment,
  RefrigerationSpec,
} from "../value-objects/refrigerated-compartment.js";
import type { MeasuredWheelArches, WheelArches } from "../value-objects/wheel-arches.js";
import type { VehicleEnergy } from "../value-objects/vehicle-energy.js";
import { type LoadSpace, loadSpaceOf } from "./vehicle-load-space.js";

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
  /** Les zones autorisées ; vide = partout. `restore` les revalide. */
  readonly allowedZoneIds: readonly string[];
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
  /** Les zones autorisées ; absent ou vide = partout (même règle : absent efface). */
  readonly allowedZoneIds?: readonly string[] | undefined;
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
    private currentZones: AllowedZones,
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
      AllowedZones.of(input.allowedZoneIds ?? []),
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
      AllowedZones.of(state.allowedZoneIds),
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

  /** Les zones de livraison où il peut aller ; partout si la liste est vide. */
  get allowedZones(): AllowedZones {
    return this.currentZones;
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
      allowedZoneIds: this.currentZones.values,
    };
  }

  get updatedAt(): Date {
    return this.currentUpdatedAt;
  }

  get inService(): boolean {
    return this.currentRetiredAt === null;
  }

  /**
   * **En service et mesuré** : ce qui le compte pour la composition (CA-D3,
   * Q5 — les cotes suffisent ; passages de roue et froid restent facultatifs).
   */
  get measured(): boolean {
    return this.inService && this.currentLoad.cargo !== null;
  }

  /** Peut-il porter une tournée du jour `day` (`AAAA-MM-JJ`) ? Cf. {@link activeOnDay}. */
  activeOn(day: string): boolean {
    return activeOnDay(this.currentRetiredAt, day);
  }

  /**
   * Corrige la fiche ENTIÈRE — nom, plaque, dimensions, froid, zones. Permis sur un
   * véhicule retiré : corriger une faute de saisie ne le remet pas en service.
   * Tout est validé avant la moindre affectation : un refus ne laisse pas une
   * fiche à moitié corrigée.
   */
  correct(identity: VehicleIdentity, at: Date): void {
    const name = nameOf(identity.name);
    const plate = LicensePlate.of(identity.plate);
    const load = loadSpaceOf(identity);
    const zones = AllowedZones.of(identity.allowedZoneIds ?? []);
    this.currentName = name;
    this.currentPlate = plate;
    this.currentLoad = load;
    this.currentZones = zones;
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
      allowedZoneIds: this.currentZones.values,
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
