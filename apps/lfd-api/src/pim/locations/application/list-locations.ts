import { type IQueryHandler, QueryHandler } from "@nestjs/cqrs";

import type { LocationSnapshot } from "../domain/entities/location.js";
import { LocationRepository } from "../domain/ports/location.repository.js";
import { LocationUsageReader } from "../domain/ports/location-usage.reader.js";

/** Un location tel que la liste le rend : son état, plus ce que l'écran doit savoir. */
export type LocationListItem = LocationSnapshot & {
  /** Combien de familles le cochent. Zéro ⇒ supprimable. */
  readonly usedByCategories: number;
};

/** Lecture des emplacements — dispatchée par le `QueryBus`. Sans paramètre. */
export class ListLocationsQuery {}

@QueryHandler(ListLocationsQuery)
export class ListLocationsHandler implements IQueryHandler<ListLocationsQuery, LocationListItem[]> {
  constructor(
    private readonly locations: LocationRepository,
    private readonly usage: LocationUsageReader,
  ) {}

  /**
   * La lecture rend des **instantanés**, pas des agrégats : un lecteur n'a
   * aucune raison de pouvoir muter ce qu'il affiche.
   *
   * Le compte d'usages voyage avec. Il ne vit PAS dans l'agrégat — un
   * location ignore les familles qui le cochent — mais l'écran en a besoin
   * pour DIRE qu'une suppression échouera, au lieu de l'apprendre après le
   * clic. Même raison que le compte de fiches sur une famille.
   *
   * Une seule lecture des grilles pour toute la liste, jamais une par ligne.
   */
  async execute(): Promise<LocationListItem[]> {
    const [locations, counts] = await Promise.all([
      this.locations.listAll(),
      this.usage.countByLocation(),
    ]);
    return locations.map((location) => {
      const snapshot = location.snapshot();
      return { ...snapshot, usedByCategories: counts.get(snapshot.id) ?? 0 };
    });
  }
}
