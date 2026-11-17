import type { WorkstationsPageView } from "@lfd/contracts";
import { addDays } from "@lfd/contracts";
import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";

import { Clock } from "../../../../platform/time/clock.js";
import {
  ExpectedProductionReader,
  ExpectedResuppliesReader,
  ProductionArticlesReader,
} from "../../../channels/commerce/index.js";
import { KnownArticles, ServiceRange, todayOf } from "../../../day/index.js";
import { WorkstationMapReader } from "../../domain/ports/workstation-map.reader.js";
import { type OrderedArticle, workstationsPageOf } from "../services/workstations-page.js";
import { ListWorkstationsQuery } from "./list-workstations.query.js";

/** Les journées arrêtées relues : J−30 à aujourd'hui (31 jours, la borne d'une plage). */
const PAST_DAYS = 30;
/** La demande à venir : aujourd'hui et les 13 jours suivants. */
const COMING_DAYS = 13;

/**
 * **La page Postes** (`documentation/fournil/les-postes-du-fournil.md`, § 3.8) :
 * l'union de quatre sources, ramenée au produit par la réponse du commerce.
 *
 * 1. tous les articles du miroir, déclinaisons et masqués compris ;
 * 2. les lignes des journées arrêtées de J−30 à aujourd'hui (`KnownArticles`) ;
 * 3. la demande des commandes des 14 prochains jours ;
 * 4. celle des réassorts — le commerce n'y met pas les réassorts « au plus
 *    tôt », qui n'entrent pas au plan.
 *
 * Les sources 2 à 4 ne font que marquer ce qui est commandé, et nommer les
 * SKU que le commerce ne connaît plus. Toute panne remonte.
 */
@QueryHandler(ListWorkstationsQuery)
export class ListWorkstationsHandler implements IQueryHandler<
  ListWorkstationsQuery,
  WorkstationsPageView
> {
  constructor(
    private readonly stations: WorkstationMapReader,
    private readonly articles: ProductionArticlesReader,
    private readonly known: KnownArticles,
    private readonly expectedOrders: ExpectedProductionReader,
    private readonly expectedResupplies: ExpectedResuppliesReader,
    private readonly clock: Clock,
  ) {}

  async execute(): Promise<WorkstationsPageView> {
    const today = todayOf(this.clock.now());
    const past = ServiceRange.of(addDays(today, -PAST_DAYS), today);
    const coming = ServiceRange.of(today, addDays(today, COMING_DAYS));
    const [listing, articles, known, orders, resupplies] = await Promise.all([
      this.stations.listing(),
      this.articles.allArticles(),
      this.known.between(past),
      this.expectedOrders.expectedBetween(coming),
      this.expectedResupplies.expectedBetween(coming),
    ]);
    const ordered: OrderedArticle[] = [
      ...known,
      ...[...orders, ...resupplies].flatMap((day) =>
        day.items.map(({ sku, productName }) => ({ sku, productName })),
      ),
    ];
    return workstationsPageOf(listing, articles, ordered);
  }
}
