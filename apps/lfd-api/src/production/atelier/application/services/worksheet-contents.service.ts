import type { DayJournal, ProductionWorksheetView } from "@lfd/contracts";
import { Injectable } from "@nestjs/common";

import { DayContents } from "../../../../platform/day-versions/day-contents.js";
import { DayVersionRegistry } from "../../../../platform/day-versions/day-version-registry.js";
import { Clock } from "../../../../platform/time/clock.js";
import type { ServiceDay } from "../../../day/index.js";
import { ProductionDisplaySettingsVersion } from "../../../shared/print/index.js";
import { WorkstationMapVersion } from "../../../workstations/index.js";
import { ProductionTrackingSettingsVersion } from "../../domain/ports/production-tracking-settings.ports.js";
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
 * Les numéros sans journée que l'étiquette porte en plus des journaux :
 * le rangement de la fiche en dépend, et ni le réglage ni les postes n'écrivent
 * de journal de journée. Ce sont des sujets de l'étiquette seulement — l'écran
 * ne les suit pas par la porte des versions.
 */
const DISPLAY_SUBJECT = "display";
const WORKSTATIONS_SUBJECT = "workstations";
/**
 * Le réglage de suivi du fournil : une journée pas encore figée sert le
 * réglage courant, qui n'écrit aucun journal de journée (plan
 * `documentation/fournil/plan-niveaux-de-suivi.md`, § 3.9). Le niveau d'un
 * poste monte déjà le numéro de la carte, et le niveau figé écrit au journal.
 */
const TRACKING_SUBJECT = "tracking";

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
 * ## Le rangement : deux numéros de plus dans l'étiquette
 *
 * Le réglage d'affichage (sous-catégories, mode boutique ou prod) et la carte
 * des postes changent le rangement de la fiche sans écrire de journal de
 * journée. Leurs numéros (`display`, `workstations` : l'instant de leur
 * dernière écriture) entrent dans l'étiquette, lus avec les journaux : un
 * placement, un geste sur les postes ou une bascule de mode font relire la
 * fiche à la requête suivante. L'écran, lui, ne suit que les journaux : il
 * relit sur un mouvement du jour, au filet, ou en rouvrant la fiche.
 *
 * ## Lu hors journal, accepté vieux jusqu'au prochain numéro (Hugo, 2026-11-13)
 *
 * - les contenants (`ProductionContainerReader`) ;
 * - les rayons du catalogue, et en mode prod les articles du commerce ;
 * - le réglage des tranches, dont les paliers d'échéance sont faits ;
 * - les contrôles qualité.
 *
 * Une fiche incomplète (rayons, postes, paliers ou attente du four en panne) est
 * servie, jamais rangée. `relativeDay` est recalculé à chaque réponse.
 */
@Injectable()
export class WorksheetContents {
  constructor(
    private readonly journals: DayVersionRegistry,
    private readonly contents: DayContents,
    private readonly reading: ProductionWorksheetReading,
    private readonly clock: Clock,
    private readonly display: ProductionDisplaySettingsVersion,
    private readonly workstations: WorkstationMapVersion,
    private readonly tracking: ProductionTrackingSettingsVersion,
  ) {}

  async read(day: ServiceDay): Promise<ProductionWorksheetView> {
    const [journals, display, workstations, tracking] = await Promise.all([
      this.journals.versionsOf(WORKSHEET_JOURNALS, day.value),
      this.display.versionOf(),
      this.workstations.versionOf(),
      this.tracking.versionOf(),
    ]);
    const versions = [
      ...journals,
      { subject: DISPLAY_SUBJECT, version: display },
      { subject: WORKSTATIONS_SUBJECT, version: workstations },
      { subject: TRACKING_SUBJECT, version: tracking },
    ];
    const content = await this.contents.contentOf(
      { screen: WORKSHEET_SCREEN, day: day.value, versions },
      () => this.reading.contentOf(day),
      { accepts: isWorksheetContent, storable: isStorableWorksheet },
    );
    return servedWorksheet(content, this.clock.now());
  }
}
