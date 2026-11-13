import type { DayJournal, DeliveryRoundsDayView } from "@lfd/contracts";
import { type IQueryHandler, QueryHandler } from "@nestjs/cqrs";

import { DayContents } from "../../../platform/day-versions/day-contents.js";
import { DayVersionRegistry } from "../../../platform/day-versions/day-version-registry.js";
import { servedRoundsDay } from "../delivery-rounds-view.js";
import { isRoundsDayContent, isStorableRoundsDay, ROUNDS_SCREEN } from "../rounds-day-content.js";
import { RoundsDayLiveReading } from "../rounds-day-live.service.js";
import { RoundsDayReading } from "../rounds-day-reading.service.js";
import { GetDeliveryRoundsDayQuery } from "./get-delivery-rounds-day.query.js";

/**
 * Les journaux dont la composition rangée lit les tables : la livraison
 * (`delivery` — tournées, arrêts, transferts, signalements) et le commerce
 * (`orders` — les livraisons attendues et leur état). L'écran ne sert aucun
 * nom de société ni de client (la référence et la clientèle seules) : le
 * sujet global `companies` n'entre pas dans la clé.
 */
const ROUNDS_JOURNALS: readonly DayJournal[] = ["delivery", "orders"];

/**
 * **La composition d'un jour** — les tournées, leurs arrêts signalés, leur
 * livreur (et s'il peut encore livrer : conduire ET les gestes à la porte,
 * audit 2026-10-07, B8), ce qui reste à répartir, les problèmes signalés par
 * les livreurs (`a-la-porte.md`, § 3), les commandes rapportées à replacer,
 * quel que soit le jour (lot RL1), et les arrêts posés hors des zones de
 * leur véhicule (2026-10-06). Une lecture : elle n'écrit rien.
 *
 * Servie depuis l'objet des journées tant que ses numéros ne bougent pas
 * (`le-cache-du-back-office.md`, § 3.5), clé `rounds`. 🔴 Les numéros sont
 * lus EN BASE, AVANT les données : lus après, ils couvriraient une écriture
 * que le contenu n'a pas.
 *
 * Livreurs, flotte, place au dépôt et commandes rapportées sont lus à
 * chaque appel (`RoundsDayLiveReading`) et posés sur le contenu.
 */
@QueryHandler(GetDeliveryRoundsDayQuery)
export class GetDeliveryRoundsDayHandler implements IQueryHandler<
  GetDeliveryRoundsDayQuery,
  DeliveryRoundsDayView
> {
  constructor(
    private readonly journals: DayVersionRegistry,
    private readonly contents: DayContents,
    private readonly reading: RoundsDayReading,
    private readonly live: RoundsDayLiveReading,
  ) {}

  async execute(query: GetDeliveryRoundsDayQuery): Promise<DeliveryRoundsDayView> {
    const versions = await this.journals.versionsOf(ROUNDS_JOURNALS, query.day);
    const content = await this.contents.contentOf(
      { screen: ROUNDS_SCREEN, day: query.day, versions },
      () => this.reading.contentOf(query.day),
      { accepts: isRoundsDayContent, storable: isStorableRoundsDay },
    );
    const live = await this.live.around(content.composition);
    return { ...servedRoundsDay(content.composition, live), incidents: content.incidents };
  }
}
