import type { PurchaseScenarioContent } from "@lfd/contracts";

import {
  InvalidPurchaseScenarioNameError,
  PurchaseScenarioAlreadyArchivedError,
  PurchaseScenarioNotArchivedError,
  PurchaseScenarioUnreadableError,
} from "../errors/delivery-purchase-scenario-errors.js";
import { binGapCm } from "../value-objects/bin-gap.js";
import type { DeliveryAuthor } from "./departure-choice.js";

/** La borne du contrat (`PURCHASE_SCENARIO_NAME_MAX`), reprise ici : le domaine la refuse. */
export const PURCHASE_SCENARIO_NAME_MAX_LENGTH = 80;

/**
 * **Le contenu d'un scénario, tel qu'il se relit.** Validé à l'entrée ET à la
 * relecture (B-D5) ; la relecture peut échouer, et le scénario doit pourtant
 * rester remplaçable et archivable — d'où deux états plutôt qu'une exception
 * au chargement, comme les scénarios du simulateur.
 */
export type PurchaseScenarioStoredContent =
  | { readonly readable: true; readonly content: PurchaseScenarioContent }
  | { readonly readable: false; readonly reason: string };

/** L'état persisté — ce que `toDomain` réhydrate. */
export interface PurchaseScenarioState {
  readonly id: string;
  readonly name: string;
  readonly stored: PurchaseScenarioStoredContent;
  readonly createdAt: Date;
  readonly createdByStaffId: string;
  readonly updatedAt: Date;
  readonly updatedBy: DeliveryAuthor;
  readonly archivedAt: Date | null;
}

/**
 * **Un scénario d'achat** (`plan-bibliotheque-d-achat.md`, B-D5, lot B3) : la
 * sélection du tableau croisé sous un nom.
 *
 * Un agrégat léger plutôt qu'un CRUD : des règles refusent une écriture — un
 * nom borné, un jeu entre bacs borné, un archivé qu'on ne remplace pas,
 * qu'on n'archive pas deux fois, un vivant qu'on ne réactive pas. L'unicité
 * du nom parmi les non archivés est lue avant d'écrire et tenue par la base
 * (index partiel). Les éléments CITÉS ne sont pas vérifiés ici : ils peuvent
 * être archivés demain, et le scénario doit s'ouvrir quand même.
 */
export class PurchaseScenario {
  private constructor(
    readonly id: string,
    private currentName: string,
    private currentStored: PurchaseScenarioStoredContent,
    readonly createdAt: Date,
    readonly createdByStaffId: string,
    private currentUpdatedAt: Date,
    private currentUpdatedBy: DeliveryAuthor,
    private currentArchivedAt: Date | null,
  ) {}

  /** @throws {InvalidPurchaseScenarioNameError} @throws {InvalidBinGapError} */
  static record(input: {
    readonly id: string;
    readonly name: string;
    readonly content: PurchaseScenarioContent;
    readonly at: Date;
    readonly author: DeliveryAuthor;
  }): PurchaseScenario {
    return new PurchaseScenario(
      input.id,
      nameOf(input.name),
      readableOf(input.content),
      input.at,
      input.author.staffUserId,
      input.at,
      input.author,
      null,
    );
  }

  static restore(state: PurchaseScenarioState): PurchaseScenario {
    return new PurchaseScenario(
      state.id,
      state.name,
      state.stored,
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
   * Le contenu, relu.
   * @throws {PurchaseScenarioUnreadableError} il ne passe plus la validation.
   */
  content(): PurchaseScenarioContent {
    if (!this.currentStored.readable) {
      throw new PurchaseScenarioUnreadableError(this.currentName, this.currentStored.reason);
    }
    return this.currentStored.content;
  }

  /**
   * Remplace le nom et le contenu — ce qui répare aussi un scénario illisible.
   * @throws {InvalidPurchaseScenarioNameError} @throws {InvalidBinGapError}
   * @throws {PurchaseScenarioAlreadyArchivedError}
   */
  replace(name: string, content: PurchaseScenarioContent, at: Date, author: DeliveryAuthor): void {
    this.ensureLive();
    this.currentName = nameOf(name);
    this.currentStored = readableOf(content);
    this.touch(at, author);
  }

  /** @throws {PurchaseScenarioAlreadyArchivedError} — sa date ne se réécrit pas. */
  archive(at: Date, author: DeliveryAuthor): void {
    this.ensureLive();
    this.currentArchivedAt = at;
    this.touch(at, author);
  }

  /** @throws {PurchaseScenarioNotArchivedError} il est déjà en cours. */
  reactivate(at: Date, author: DeliveryAuthor): void {
    if (this.currentArchivedAt === null) {
      throw new PurchaseScenarioNotArchivedError(this.currentName);
    }
    this.currentArchivedAt = null;
    this.touch(at, author);
  }

  toState(): PurchaseScenarioState {
    return {
      id: this.id,
      name: this.currentName,
      stored: this.currentStored,
      createdAt: this.createdAt,
      createdByStaffId: this.createdByStaffId,
      updatedAt: this.currentUpdatedAt,
      updatedBy: this.currentUpdatedBy,
      archivedAt: this.currentArchivedAt,
    };
  }

  private ensureLive(): void {
    if (this.currentArchivedAt !== null) {
      throw new PurchaseScenarioAlreadyArchivedError(this.currentName);
    }
  }

  private touch(at: Date, author: DeliveryAuthor): void {
    this.currentUpdatedAt = at;
    this.currentUpdatedBy = author;
  }
}

/** @throws {InvalidPurchaseScenarioNameError} vide ou trop long. */
function nameOf(raw: string): string {
  const name = raw.trim();
  if (name.length === 0 || name.length > PURCHASE_SCENARIO_NAME_MAX_LENGTH) {
    throw new InvalidPurchaseScenarioNameError(PURCHASE_SCENARIO_NAME_MAX_LENGTH);
  }
  return name;
}

/** Le jeu entre bacs passe par la même borne que le tableau : on ne garde pas ce qu'il refuserait. */
function readableOf(content: PurchaseScenarioContent): PurchaseScenarioStoredContent {
  binGapCm(content.selection.gapCm);
  return { readable: true, content };
}
