import { Injectable } from "@nestjs/common";

import { CommerceDayVersionReader } from "../../../channels/commerce/commerce-day-version.reader.js";
import { ProductionDayStatusReader, type ServiceDay } from "../../../day/index.js";
import {
  type ProvisionalChoice,
  selectionOfChoice,
} from "../../domain/entities/provisional-print.js";
import {
  NothingChangedSinceRunError,
  ProvisionalPrintOfArrestedDayError,
  ProvisionalRunUnknownError,
} from "../../domain/errors/provisional-print-errors.js";
import { ProvisionalPrintsReader } from "../../domain/ports/provisional-prints.reader.js";
import {
  type DossierSelection,
  selectedOrders,
} from "../../domain/services/day-dossier-selection.js";
import {
  changedSince,
  printedFingerprintsOf,
} from "../../domain/services/printed-order-fingerprint.js";
import { LiveDossierContent } from "./live-dossier-content.js";
import type { DossierContent } from "./production-paper.service.js";

/** Ce qu'une impression provisoire tire, et ce qu'elle garde. */
export interface ProvisionalIntake {
  readonly content: DossierContent;
  readonly selection: DossierSelection;
  /** La version du commerce lue au tirage. */
  readonly commerceVersion: number;
  /** L'empreinte de chaque commande dont la fiche s'imprime ; vide sans fiches. */
  readonly fingerprints: ReadonlyMap<string, string>;
}

/**
 * **Ce que lit une impression provisoire avant de se tirer** : le refus d'une
 * journée arrêtée, le contenu en direct, la version du commerce, et — pour
 * « nouvelles ou modifiées depuis #N » — les empreintes gardées au tirage N.
 *
 * Les empreintes gardées sont celles des commandes dont la **fiche** part au
 * papier (`orders` coché) : « modifiée depuis #N » parle de la fiche qu'on a
 * en main, pas d'un total où la commande ne se voit pas.
 */
@Injectable()
export class ProvisionalPrintIntake {
  constructor(
    private readonly status: ProductionDayStatusReader,
    private readonly live: LiveDossierContent,
    private readonly versions: CommerceDayVersionReader,
    private readonly prints: ProvisionalPrintsReader,
  ) {}

  /**
   * @throws {ProvisionalPrintOfArrestedDayError} le plan est arrêté.
   * @throws {ProvisionalRunUnknownError} « depuis #N » nomme un tirage absent.
   * @throws {NothingChangedSinceRunError} rien n'a changé depuis #N.
   * @throws {DossierSelectionUnknownError} une commande choisie n'est pas au jour.
   */
  async read(day: ServiceDay, choice: ProvisionalChoice): Promise<ProvisionalIntake> {
    if (await this.status.isClosed(day)) {
      throw new ProvisionalPrintOfArrestedDayError(day.value);
    }
    const [content, commerceVersion] = await Promise.all([
      this.live.read(day),
      this.versions.versionOf(day),
    ]);
    const selection = selectionOfChoice(choice, await this.changed(day, choice, content));
    const printed = choice.parts.has("orders") ? selectedOrders(content.orders, selection) : [];
    return { content, selection, commerceVersion, fingerprints: printedFingerprintsOf(printed) };
  }

  /** Les commandes nouvelles ou modifiées depuis #N — vide hors de ce choix. */
  private async changed(
    day: ServiceDay,
    choice: ProvisionalChoice,
    content: DossierContent,
  ): Promise<ReadonlySet<string>> {
    if (choice.orders.kind !== "since") {
      return new Set();
    }
    const { run } = choice.orders;
    const printed = await this.prints.fingerprintsOf(day, run);
    if (printed === null) {
      throw new ProvisionalRunUnknownError(day.value, run);
    }
    const changed = changedSince(content.orders, printed);
    if (changed.size === 0) {
      throw new NothingChangedSinceRunError(day.value, run);
    }
    return changed;
  }
}
