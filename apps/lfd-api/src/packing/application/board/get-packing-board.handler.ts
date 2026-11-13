import type { DayJournal, ProductionPackingView } from "@lfd/contracts";
import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";

import type { DaySubjectVersion } from "../../../platform/day-versions/day-content-tag.js";
import { DayContents } from "../../../platform/day-versions/day-contents.js";
import { DayVersionRegistry } from "../../../platform/day-versions/day-version-registry.js";
import { Clock } from "../../../platform/time/clock.js";
import { servedPackingBoard } from "../../domain/services/packing-board.js";
import { GetPackingBoardQuery } from "./get-packing-board.query.js";
import {
  isPackingBoardContent,
  isStorablePackingBoard,
  PACKING_SCREEN,
} from "./packing-board-content.js";
import { PackingBoardReading } from "./packing-board-reading.service.js";

/**
 * Les journaux dont le poste lit les tables : le fournil et le colisage
 * (`production`), le commerce (`orders` : BL, départ incomplet) et la
 * livraison (`delivery` : froid, départs). Le poste ne lit aucun nom de
 * société ni de client — `customerLabel` est l'instantané rangé au
 * colisage : le sujet global `companies` n'entre pas dans la clé.
 */
const PACKING_JOURNALS: readonly DayJournal[] = ["production", "orders", "delivery"];

/**
 * **Le poste de colisage, servi par le colisage** (`colisage/colisage.md`,
 * §17) — `GET admin/packing/:date/board`, le poste et la colonne colisage de
 * la Supervision : la même requête, la date seule, aucun droit ni personne.
 * Le contrat est `ProductionPackingView`.
 *
 * Servi depuis l'objet des journées tant que ses numéros ne bougent pas
 * (`le-cache-du-back-office.md`, § 3.1), clé `packing`.
 *
 * 🔴 Les numéros sont lus EN BASE, AVANT les données : une écriture validée
 * entre les deux fait monter un numéro après celui de l'étiquette, et le
 * veilleur de l'écran fait relire. Lus après, ils couvriraient une écriture
 * que le contenu n'a pas — servie vieille jusqu'au numéro suivant.
 *
 * Lu hors journal, accepté vieux jusqu'au prochain numéro (Hugo,
 * 2026-11-13) : les noms du personnel (qui a fermé un bac, qui a décidé un
 * départ incomplet). `relativeDay`, seul usage de l'horloge, est recalculé à
 * chaque réponse.
 */
@QueryHandler(GetPackingBoardQuery)
export class GetPackingBoardHandler implements IQueryHandler<
  GetPackingBoardQuery,
  ProductionPackingView
> {
  constructor(
    private readonly journals: DayVersionRegistry,
    private readonly contents: DayContents,
    private readonly reading: PackingBoardReading,
    private readonly clock: Clock,
  ) {}

  async execute(query: GetPackingBoardQuery): Promise<ProductionPackingView> {
    const versions = await this.versionsOf(query.serviceDay);
    const content = await this.contents.contentOf(
      { screen: PACKING_SCREEN, day: query.serviceDay, versions },
      () => this.reading.contentOf(query.serviceDay),
      { accepts: isPackingBoardContent, storable: isStorablePackingBoard },
    );
    return servedPackingBoard(content, this.clock.now());
  }

  private versionsOf(serviceDay: string): Promise<DaySubjectVersion[]> {
    return Promise.all(
      PACKING_JOURNALS.map(async (journal) => ({
        subject: journal,
        version: await this.journals.sourceOf(journal).versionOf(serviceDay),
      })),
    );
  }
}
