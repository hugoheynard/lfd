import {
  type ApplyDeliveryProposalPayload,
  applyDeliveryProposalPayloadSchema,
  type DeliveryPlacementSuggestionsView,
  type DeliveryRoundProposalView,
  type DeliveryRoundTimingView,
  deliveryProposalModeSchema,
  type TimeDeliveryRoundsPayload,
  timeDeliveryRoundsPayloadSchema,
} from "@lfd/contracts";
import { Body, Controller, Get, HttpCode, HttpStatus, Post, Query } from "@nestjs/common";
import { CommandBus, QueryBus } from "@nestjs/cqrs";
import { z } from "zod";

import { AdminSurface, RequirePermission } from "../../platform/auth/admin-surface.decorator.js";
import { ZodBody, ZodQuery } from "../../platform/shared/http/zod-body.pipe.js";
import { ApplyDeliveryProposalCommand } from "../application/commands/apply-delivery-proposal.command.js";
import { LocateDeliveryStopsCommand } from "../application/commands/locate-delivery-stops.command.js";
import { GetDeliveryPlacementSuggestionsQuery } from "../application/queries/get-delivery-placement-suggestions.query.js";
import { GetDeliveryRoundProposalQuery } from "../application/queries/get-delivery-round-proposal.query.js";
import { TimeDeliveryRoundsQuery } from "../application/queries/time-delivery-rounds.query.js";

const dayField = z.string().regex(/^\d{4}-\d{2}-\d{2}$/u, "jour attendu au format AAAA-MM-JJ");

const dayQuerySchema = z.object({ jour: dayField });
type DayQuery = z.infer<typeof dayQuerySchema>;

/**
 * `vehicules=a,b` — absent : tous ceux qui roulent ce jour-là.
 * `toutRecomposer=true` — absent ou autre chose que `true` : compléter seulement.
 * `mode=insert|new_rounds` — absent : le mode par défaut des réglages.
 */
const proposalQuerySchema = z.object({
  jour: dayField,
  vehicules: z
    .string()
    .optional()
    .transform((value) =>
      value === undefined
        ? null
        : value
            .split(",")
            .map((id) => id.trim())
            .filter((id) => id !== ""),
    ),
  toutRecomposer: z
    .enum(["true", "false"], { message: "toutRecomposer vaut true ou false" })
    .optional()
    .transform((value) => value === "true"),
  mode: deliveryProposalModeSchema.optional().transform((value) => value ?? null),
});
type ProposalQuery = z.infer<typeof proposalQuerySchema>;

/**
 * **Le calculateur de tournée** — Livraison → Tournées → « Situer »,
 * « Proposer », « Appliquer » (`plan-preparation-de-tournee.md`, lot 7).
 *
 * Sous `delivery_rounds`, sans droit neuf (L7-C7) : proposer se lit, situer et
 * appliquer écrivent — c'est de la composition. Il n'injecte que les bus.
 */
@Controller("admin/livraison/tournees")
@AdminSurface("delivery_rounds")
export class DeliveryProposalController {
  constructor(
    private readonly commands: CommandBus,
    private readonly queries: QueryBus,
  ) {}

  /** Géocode ce qui manque (L7-C9) : un geste, qui sort sur le réseau. */
  @Post("situer")
  @HttpCode(HttpStatus.NO_CONTENT)
  async locate(@Query(new ZodQuery(dayQuerySchema)) query: DayQuery): Promise<void> {
    await this.commands.execute<LocateDeliveryStopsCommand, void>(
      new LocateDeliveryStopsCommand(query.jour),
    );
  }

  /** Une proposition calculée, jamais écrite (L7-C6). */
  @Get("proposition")
  propose(
    @Query(new ZodQuery(proposalQuerySchema)) query: ProposalQuery,
  ): Promise<DeliveryRoundProposalView> {
    return this.queries.execute<GetDeliveryRoundProposalQuery, DeliveryRoundProposalView>(
      new GetDeliveryRoundProposalQuery(
        query.jour,
        query.vehicules,
        query.toutRecomposer,
        query.mode,
      ),
    );
  }

  /**
   * **Les places suggérées** (CA7) : une par commande à répartir d'un jour
   * qui a des tournées enregistrées. Une lecture ; « Placer ici » est
   * l'affectation `POST :roundId/arrets` avec son rang.
   */
  @Get("places-suggerees")
  suggestions(
    @Query(new ZodQuery(dayQuerySchema)) query: DayQuery,
  ): Promise<DeliveryPlacementSuggestionsView> {
    return this.queries.execute<
      GetDeliveryPlacementSuggestionsQuery,
      DeliveryPlacementSuggestionsView
    >(new GetDeliveryPlacementSuggestionsQuery(query.jour));
  }

  /**
   * **Chronométrer** une composition glissée à la main (L10b-C2). POST parce
   * que la composition est un corps ; c'est une LECTURE — rien n'est écrit —,
   * donc sous le droit de lecture.
   */
  @Post("proposition/chronometrer")
  @HttpCode(HttpStatus.OK)
  @RequirePermission("delivery_rounds:read")
  time(
    @Body(new ZodBody(timeDeliveryRoundsPayloadSchema)) payload: TimeDeliveryRoundsPayload,
  ): Promise<DeliveryRoundTimingView> {
    return this.queries.execute<TimeDeliveryRoundsQuery, DeliveryRoundTimingView>(
      new TimeDeliveryRoundsQuery(payload),
    );
  }

  /** Applique la proposition vue, sous les versions lues : tout ou rien. */
  @Post("proposition")
  @HttpCode(HttpStatus.NO_CONTENT)
  async apply(
    @Body(new ZodBody(applyDeliveryProposalPayloadSchema)) payload: ApplyDeliveryProposalPayload,
  ): Promise<void> {
    await this.commands.execute<ApplyDeliveryProposalCommand, void>(
      new ApplyDeliveryProposalCommand(payload),
    );
  }
}
