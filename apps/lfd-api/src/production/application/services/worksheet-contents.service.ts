import type { DayJournal, ProductionWorksheetView } from "@lfd/contracts";
import { Injectable } from "@nestjs/common";

import type { DaySubjectVersion } from "../../../platform/day-versions/day-content-tag.js";
import { DayContents } from "../../../platform/day-versions/day-contents.js";
import { DayVersionRegistry } from "../../../platform/day-versions/day-version-registry.js";
import { Clock } from "../../../platform/time/clock.js";
import type { ServiceDay } from "../../domain/value-objects/service-day.value-object.js";
import { ProductionWorksheetReading } from "./production-worksheet-reading.service.js";
import {
  isStorableWorksheet,
  isWorksheetContent,
  servedWorksheet,
  WORKSHEET_SCREEN,
} from "./worksheet-content.js";

/**
 * Les journaux dont la fiche lit les tables : le fournil (avec le colisage,
 * qui dit l'attente du four) et les commandes du jour (arrivées, demande,
 * paliers d'échéance). La fiche ne porte aucun nom de société ni de client :
 * le sujet global `companies` n'entre pas dans la clé.
 */
const WORKSHEET_JOURNALS: readonly DayJournal[] = ["production", "orders"];

/**
 * **La fiche du fournil d'une journée, servie depuis l'objet des journées**
 * tant que ses numéros ne bougent pas (`le-cache-du-back-office.md`, § 3.1).
 * Une seule clé `worksheet` pour la fiche datée, la fiche en cours et la
 * colonne Préparation de la Supervision : les trois envoient la même lecture,
 * et rendent les mêmes octets pour une journée.
 *
 * 🔴 Les numéros sont lus EN BASE, AVANT les données : une écriture validée
 * entre les deux fait monter un numéro après celui de l'étiquette, et le
 * veilleur de l'écran fait relire. Lus après, ils couvriraient une écriture
 * que le contenu n'a pas — servie vieille jusqu'au numéro suivant.
 *
 * ## Lu hors journal, accepté vieux jusqu'au prochain numéro (Hugo, 2026-11-13)
 *
 * - les contenants (`ProductionContainerReader`) ;
 * - le réglage d'affichage (sous-catégories) ;
 * - les rayons du catalogue ;
 * - le réglage des tranches, dont les paliers d'échéance sont faits ;
 * - les contrôles qualité.
 *
 * Une fiche incomplète (rayons, paliers ou attente du four en panne) est
 * servie, jamais rangée. `relativeDay` est recalculé à chaque réponse.
 */
@Injectable()
export class WorksheetContents {
  constructor(
    private readonly journals: DayVersionRegistry,
    private readonly contents: DayContents,
    private readonly reading: ProductionWorksheetReading,
    private readonly clock: Clock,
  ) {}

  async read(day: ServiceDay): Promise<ProductionWorksheetView> {
    const versions = await this.versionsOf(day);
    const content = await this.contents.contentOf(
      { screen: WORKSHEET_SCREEN, day: day.value, versions },
      () => this.reading.contentOf(day),
      { accepts: isWorksheetContent, storable: isStorableWorksheet },
    );
    return servedWorksheet(content, this.clock.now());
  }

  private versionsOf(day: ServiceDay): Promise<DaySubjectVersion[]> {
    return Promise.all(
      WORKSHEET_JOURNALS.map(async (journal) => ({
        subject: journal,
        version: await this.journals.sourceOf(journal).versionOf(day.value),
      })),
    );
  }
}
