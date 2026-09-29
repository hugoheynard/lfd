import { instantToLocal } from "@lfd/contracts";

import {
  InvalidVehicleNameError,
  VehicleAlreadyRetiredError,
  VehicleNotRetiredError,
} from "../errors/delivery-errors.js";
import { LicensePlate } from "../value-objects/license-plate.js";

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
}

/** Ce qu'une création ou une correction dit d'un véhicule. */
export interface VehicleIdentity {
  readonly name: string;
  readonly plate: string;
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
  ) {}

  /**
   * Un véhicule entre dans la flotte, en service.
   * @throws {InvalidVehicleNameError} @throws {InvalidLicensePlateError}
   */
  static register(input: VehicleIdentity & { readonly id: string; readonly at: Date }): Vehicle {
    return new Vehicle(
      input.id,
      nameOf(input.name),
      LicensePlate.of(input.plate),
      null,
      input.at,
      input.at,
    );
  }

  /** Réhydrate un véhicule lu en base ; la plaque se revalide. */
  static restore(state: VehicleState): Vehicle {
    return new Vehicle(
      state.id,
      state.name,
      LicensePlate.of(state.plate),
      state.retiredAt,
      state.createdAt,
      state.updatedAt,
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
   * Corrige le nom et la plaque. Permis sur un véhicule retiré : corriger une
   * faute de saisie ne le remet pas en service.
   */
  correct(identity: VehicleIdentity, at: Date): void {
    this.currentName = nameOf(identity.name);
    this.currentPlate = LicensePlate.of(identity.plate);
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
