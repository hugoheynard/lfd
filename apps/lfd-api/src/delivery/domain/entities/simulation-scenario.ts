import type { DeliverySimulationPayload } from "@lfd/contracts";

import {
  InvalidSimulationScenarioNameError,
  SimulationScenarioAlreadyArchivedError,
  SimulationScenarioUnreadableError,
} from "../errors/delivery-simulation-errors.js";
import type { DeliveryAuthor } from "./departure-choice.js";

/** La borne du contrat (`SIMULATION_SCENARIO_NAME_MAX`), reprise ici : le domaine la refuse. */
export const SIMULATION_SCENARIO_NAME_MAX_LENGTH = 80;

/**
 * **Le contenu d'un scénario, tel qu'il se relit.** Le scénario est validé par
 * `deliverySimulationPayloadSchema` à l'entrée ET à la relecture (L9-C7) ; la
 * relecture peut échouer, et le scénario doit pourtant rester archivable —
 * c'est la sortie qu'on propose. D'où deux états plutôt qu'une exception au
 * chargement.
 */
export type SimulationScenarioContent =
  | { readonly readable: true; readonly payload: DeliverySimulationPayload }
  | { readonly readable: false; readonly reason: string };

/** L'état persisté — ce que `toDomain` réhydrate. */
export interface SimulationScenarioState {
  readonly id: string;
  readonly name: string;
  readonly content: SimulationScenarioContent;
  readonly createdAt: Date;
  readonly createdByStaffId: string;
  readonly updatedAt: Date;
  readonly updatedBy: DeliveryAuthor;
  readonly archivedAt: Date | null;
}

/**
 * **Un scénario enregistré du simulateur** (lot 9, L9-C7).
 *
 * Un agrégat léger plutôt qu'un CRUD : il existe des règles qui refusent une
 * écriture (`CLAUDE.md` §3.1) — un nom borné, un scénario archivé qu'on
 * n'archive pas deux fois, un contenu illisible qu'on ne duplique pas.
 * L'unicité du nom parmi les non archivés concerne l'ensemble des scénarios :
 * elle est lue avant d'écrire, et la base la tient (index partiel), comme la
 * plaque d'un véhicule en service.
 */
export class SimulationScenario {
  private constructor(
    readonly id: string,
    private currentName: string,
    private currentContent: SimulationScenarioContent,
    readonly createdAt: Date,
    readonly createdByStaffId: string,
    private currentUpdatedAt: Date,
    private currentUpdatedBy: DeliveryAuthor,
    private currentArchivedAt: Date | null,
  ) {}

  /** @throws {InvalidSimulationScenarioNameError} */
  static record(input: {
    readonly id: string;
    readonly name: string;
    readonly scenario: DeliverySimulationPayload;
    readonly at: Date;
    readonly author: DeliveryAuthor;
  }): SimulationScenario {
    return new SimulationScenario(
      input.id,
      nameOf(input.name),
      { readable: true, payload: input.scenario },
      input.at,
      input.author.staffUserId,
      input.at,
      input.author,
      null,
    );
  }

  static restore(state: SimulationScenarioState): SimulationScenario {
    return new SimulationScenario(
      state.id,
      state.name,
      state.content,
      state.createdAt,
      state.createdByStaffId,
      state.updatedAt,
      state.updatedBy,
      state.archivedAt,
    );
  }

  get name(): string {
    return this.currentName;
  }

  get archived(): boolean {
    return this.currentArchivedAt !== null;
  }

  /**
   * Le scénario, relu.
   * @throws {SimulationScenarioUnreadableError} il ne passe plus la validation.
   */
  scenario(): DeliverySimulationPayload {
    if (!this.currentContent.readable) {
      throw new SimulationScenarioUnreadableError(this.currentName, this.currentContent.reason);
    }
    return this.currentContent.payload;
  }

  /**
   * Remplace le nom et le contenu — ce qui répare aussi un scénario illisible.
   * @throws {InvalidSimulationScenarioNameError} @throws {SimulationScenarioAlreadyArchivedError}
   */
  replace(
    name: string,
    scenario: DeliverySimulationPayload,
    at: Date,
    author: DeliveryAuthor,
  ): void {
    this.ensureLive();
    this.currentName = nameOf(name);
    this.currentContent = { readable: true, payload: scenario };
    this.touch(at, author);
  }

  /**
   * Un scénario neuf au même contenu, sous le nom donné.
   * @throws {SimulationScenarioUnreadableError} @throws {SimulationScenarioAlreadyArchivedError}
   */
  duplicate(input: {
    readonly id: string;
    readonly name: string;
    readonly at: Date;
    readonly author: DeliveryAuthor;
  }): SimulationScenario {
    this.ensureLive();
    return SimulationScenario.record({ ...input, scenario: this.scenario() });
  }

  /** @throws {SimulationScenarioAlreadyArchivedError} — sa date ne se réécrit pas. */
  archive(at: Date, author: DeliveryAuthor): void {
    this.ensureLive();
    this.currentArchivedAt = at;
    this.touch(at, author);
  }

  toState(): SimulationScenarioState {
    return {
      id: this.id,
      name: this.currentName,
      content: this.currentContent,
      createdAt: this.createdAt,
      createdByStaffId: this.createdByStaffId,
      updatedAt: this.currentUpdatedAt,
      updatedBy: this.currentUpdatedBy,
      archivedAt: this.currentArchivedAt,
    };
  }

  private ensureLive(): void {
    if (this.currentArchivedAt !== null) {
      throw new SimulationScenarioAlreadyArchivedError(this.currentName);
    }
  }

  private touch(at: Date, author: DeliveryAuthor): void {
    this.currentUpdatedAt = at;
    this.currentUpdatedBy = author;
  }
}

/** @throws {InvalidSimulationScenarioNameError} vide ou trop long. */
function nameOf(raw: string): string {
  const name = raw.trim();
  if (name.length === 0 || name.length > SIMULATION_SCENARIO_NAME_MAX_LENGTH) {
    throw new InvalidSimulationScenarioNameError(SIMULATION_SCENARIO_NAME_MAX_LENGTH);
  }
  return name;
}
