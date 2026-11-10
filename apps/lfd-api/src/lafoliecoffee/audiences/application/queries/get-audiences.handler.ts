import {
  addDays,
  AUDIENCE_DIMENSIONS,
  instantToLocal,
  type AudienceCell,
  type AudienceDimension,
  type AudienceSegmentation,
  type AudiencesView,
} from "@lfd/contracts";
import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";

import { Clock } from "../../../../platform/time/clock.js";
import { AUDIENCE_MIN_CLIENTS } from "../../domain/audience-anonymity.js";
import { AudienceFamilyReader } from "../../domain/ports/audience-family.reader.js";
import { AudienceOrderReader } from "../../domain/ports/audience-order.reader.js";
import {
  buildSegmentation,
  presentCell,
  topFamiliesOf,
} from "../../domain/services/audience-board.js";
import { GetAudiencesQuery } from "./get-audiences.query.js";

/** La case des abonnements, à part des coupes. */
const SUBSCRIPTIONS_CELL = { key: "subscriptions", label: "Commandes d'abonnement" } as const;

/**
 * **Le tableau des audiences** (lot A1) : pour chaque coupe demandée, deux
 * agrégats lus à la commande (les totaux par case, le CA par article), les
 * familles lues au catalogue, puis le seuil d'anonymat — dans le domaine.
 *
 * La période finit aujourd'hui (jour métier du `Clock`) et compte `days`
 * jours, comme les résultats des suggestions (RS6).
 */
@QueryHandler(GetAudiencesQuery)
export class GetAudiencesHandler implements IQueryHandler<GetAudiencesQuery, AudiencesView> {
  constructor(
    private readonly orders: AudienceOrderReader,
    private readonly families: AudienceFamilyReader,
    private readonly clock: Clock,
  ) {}

  async execute(query: GetAudiencesQuery): Promise<AudiencesView> {
    const to = instantToLocal(this.clock.now()).day;
    const from = addDays(to, 1 - query.days);
    const dimensions = query.dimension === null ? AUDIENCE_DIMENSIONS : [query.dimension];
    const [segmentations, subscriptions] = await Promise.all([
      Promise.all(dimensions.map((dimension) => this.segmentation(dimension, from, to))),
      this.subscriptions(from, to),
    ]);
    return {
      days: query.days,
      from,
      to,
      minClients: AUDIENCE_MIN_CLIENTS,
      segmentations,
      subscriptions,
    };
  }

  private async segmentation(
    dimension: AudienceDimension,
    from: string,
    to: string,
  ): Promise<AudienceSegmentation> {
    const [tallies, revenues] = await Promise.all([
      this.orders.tally(dimension, from, to),
      this.orders.skuRevenue(dimension, from, to),
    ]);
    const families = await this.families.familiesOf(unique(revenues.map((row) => row.sku)));
    return buildSegmentation(dimension, tallies, revenues, families);
  }

  private async subscriptions(from: string, to: string): Promise<AudienceCell> {
    const [tally, revenues] = await Promise.all([
      this.orders.subscriptionTally(from, to),
      this.orders.subscriptionSkuRevenue(from, to),
    ]);
    const families = await this.families.familiesOf(unique(revenues.map((row) => row.sku)));
    return presentCell(SUBSCRIPTIONS_CELL, tally, topFamiliesOf(revenues, families));
  }
}

function unique(skus: readonly string[]): readonly string[] {
  return [...new Set(skus)];
}
