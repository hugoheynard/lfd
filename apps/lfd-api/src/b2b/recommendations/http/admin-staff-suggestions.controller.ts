import {
  DEFAULT_STAFF_SUGGESTION_RESULT_PERIOD,
  setStaffSuggestionActivePayloadSchema,
  setStaffSuggestionOrderPayloadSchema,
  staffSuggestionApplicableQuerySchema,
  staffSuggestionCountersQuerySchema,
  staffSuggestionPreviewPayloadSchema,
  staffSuggestionResultsQuerySchema,
  staffSuggestionRulePayloadSchema,
  type SetStaffSuggestionActivePayload,
  type SetStaffSuggestionOrderPayload,
  type StaffSuggestionAlertsView,
  type StaffSuggestionApplicableQuery,
  type StaffSuggestionChoicesView,
  type StaffSuggestionCountersQuery,
  type StaffSuggestionCountersView,
  type StaffSuggestionOrderView,
  type StaffSuggestionPreviewPayload,
  type StaffSuggestionPreviewView,
  type StaffSuggestionResultsQuery,
  type StaffSuggestionResultsView,
  type StaffSuggestionRuleIdResponse,
  type StaffSuggestionRulePayload,
  type StaffSuggestionRuleView,
} from "@lfd/contracts";
import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
  Query,
} from "@nestjs/common";
import { CommandBus, QueryBus } from "@nestjs/cqrs";

import { AdminSurface, RequirePermission } from "../../../platform/auth/admin-surface.decorator.js";
import { StaffUserId } from "../../../platform/auth/staff.decorator.js";
import { ZodBody, ZodQuery } from "../../../platform/shared/http/zod-body.pipe.js";
import { ArchiveStaffSuggestionCommand } from "../application/commands/archive-staff-suggestion.command.js";
import { CreateStaffSuggestionCommand } from "../application/commands/create-staff-suggestion.command.js";
import { ReviseStaffSuggestionCommand } from "../application/commands/revise-staff-suggestion.command.js";
import { SetStaffSuggestionActiveCommand } from "../application/commands/set-staff-suggestion-active.command.js";
import { SetStaffSuggestionOrderCommand } from "../application/commands/set-staff-suggestion-order.command.js";
import { ListStaffSuggestionAlertsQuery } from "../application/queries/list-staff-suggestion-alerts.query.js";
import { GetStaffSuggestionOrderQuery } from "../application/queries/get-staff-suggestion-order.query.js";
import { ListApplicableStaffSuggestionsQuery } from "../application/queries/list-applicable-staff-suggestions.query.js";
import { ListStaffSuggestionChoicesQuery } from "../application/queries/list-staff-suggestion-choices.query.js";
import { ListStaffSuggestionCountersQuery } from "../application/queries/list-staff-suggestion-counters.query.js";
import { ListStaffSuggestionResultsQuery } from "../application/queries/list-staff-suggestion-results.query.js";
import { ListStaffSuggestionsQuery } from "../application/queries/list-staff-suggestions.query.js";
import {
  PreviewStaffSuggestionsQuery,
  type PreviewPlace,
} from "../application/queries/preview-staff-suggestions.query.js";

/**
 * **Les suggestions décidées par le staff** — `/admin/suggestions`
 * (`documentation/recommandation-produit/suggestions-du-staff.md`, RS1
 * et RS3). Sous `lfc_suggestions`, un droit à lui ; l'action se déduit du
 * verbe. Pas de `DELETE` : on archive.
 *
 * Les chemins nommés (`order`, `applicable`, `choices`, `counters`, `results`,
 * `alerts`, `preview`) sont
 * déclarés AVANT `:id` : Nest prend la première route qui correspond.
 */
@Controller("admin/suggestions")
@AdminSurface("lfc_suggestions")
export class AdminStaffSuggestionsController {
  constructor(
    private readonly commands: CommandBus,
    private readonly queries: QueryBus,
  ) {}

  @Get()
  list(): Promise<readonly StaffSuggestionRuleView[]> {
    return this.queries.execute<ListStaffSuggestionsQuery, readonly StaffSuggestionRuleView[]>(
      new ListStaffSuggestionsQuery(),
    );
  }

  @Get("order")
  order(): Promise<StaffSuggestionOrderView> {
    return this.queries.execute<GetStaffSuggestionOrderQuery, StaffSuggestionOrderView>(
      new GetStaffSuggestionOrderQuery(),
    );
  }

  @Put("order")
  @HttpCode(HttpStatus.NO_CONTENT)
  async setOrder(
    @Body(new ZodBody(setStaffSuggestionOrderPayloadSchema)) body: SetStaffSuggestionOrderPayload,
    @StaffUserId() staffUserId: string,
  ): Promise<void> {
    await this.commands.execute<SetStaffSuggestionOrderCommand, void>(
      new SetStaffSuggestionOrderCommand(body.order, staffUserId),
    );
  }

  /** Les règles qui s'appliquent aujourd'hui à un emplacement, dans l'ordre réglé. */
  @Get("applicable")
  applicable(
    @Query(new ZodQuery(staffSuggestionApplicableQuerySchema))
    query: StaffSuggestionApplicableQuery,
  ): Promise<readonly StaffSuggestionRuleView[]> {
    return this.queries.execute<
      ListApplicableStaffSuggestionsQuery,
      readonly StaffSuggestionRuleView[]
    >(new ListApplicableStaffSuggestionsQuery(query.placement, query.audience ?? null));
  }

  @Get("choices")
  choices(): Promise<StaffSuggestionChoicesView> {
    return this.queries.execute<ListStaffSuggestionChoicesQuery, StaffSuggestionChoicesView>(
      new ListStaffSuggestionChoicesQuery(),
    );
  }

  /** Affichée, cliquée, ajoutée, par règle, sur une période (RS3). */
  @Get("counters")
  counters(
    @Query(new ZodQuery(staffSuggestionCountersQuerySchema)) query: StaffSuggestionCountersQuery,
  ): Promise<readonly StaffSuggestionCountersView[]> {
    return this.queries.execute<
      ListStaffSuggestionCountersQuery,
      readonly StaffSuggestionCountersView[]
    >(new ListStaffSuggestionCountersQuery(query.from, query.to));
  }

  /**
   * Les résultats par règle (RS6) : les chiffres comptés, puis commandées et
   * chiffre d'affaires HT ESTIMÉS, sur 7, 30 (défaut) ou 90 jours métier.
   */
  @Get("results")
  results(
    @Query(new ZodQuery(staffSuggestionResultsQuerySchema)) query: StaffSuggestionResultsQuery,
  ): Promise<StaffSuggestionResultsView> {
    return this.queries.execute<ListStaffSuggestionResultsQuery, StaffSuggestionResultsView>(
      new ListStaffSuggestionResultsQuery(query.days ?? DEFAULT_STAFF_SUGGESTION_RESULT_PERIOD),
    );
  }

  /**
   * Les alertes (RS10) : les règles vivantes dont un article ne se vend plus,
   * ou dont le déclencheur ne peut plus être vrai. Calculées à la demande.
   */
  @Get("alerts")
  alerts(): Promise<StaffSuggestionAlertsView> {
    return this.queries.execute<ListStaffSuggestionAlertsQuery, StaffSuggestionAlertsView>(
      new ListStaffSuggestionAlertsQuery(),
    );
  }

  /**
   * L'aperçu (RS5) : ce que la boutique afficherait, et pourquoi chaque règle
   * s'affiche ou non. Un `POST` parce que le corps porte un panier ; il ne
   * fait que lire, d'où le droit de lecture.
   */
  @Post("preview")
  @HttpCode(HttpStatus.OK)
  @RequirePermission("lfc_suggestions:read")
  preview(
    @Body(new ZodBody(staffSuggestionPreviewPayloadSchema)) body: StaffSuggestionPreviewPayload,
  ): Promise<StaffSuggestionPreviewView> {
    const place: PreviewPlace =
      body.placement === "product"
        ? { placement: "product", viewedSku: body.viewedSku }
        : { placement: body.placement };
    return this.queries.execute<PreviewStaffSuggestionsQuery, StaffSuggestionPreviewView>(
      new PreviewStaffSuggestionsQuery(
        place,
        body.skus,
        body.audience,
        body.day,
        body.pickupAddressId,
      ),
    );
  }

  @Post()
  async create(
    @Body(new ZodBody(staffSuggestionRulePayloadSchema)) body: StaffSuggestionRulePayload,
    @StaffUserId() staffUserId: string,
  ): Promise<StaffSuggestionRuleIdResponse> {
    const id = await this.commands.execute<CreateStaffSuggestionCommand, string>(
      new CreateStaffSuggestionCommand(body, staffUserId),
    );
    return { id };
  }

  /** La règle entière : un `PUT` remplace tout. */
  @Put(":id")
  async revise(
    @Param("id") id: string,
    @Body(new ZodBody(staffSuggestionRulePayloadSchema)) body: StaffSuggestionRulePayload,
    @StaffUserId() staffUserId: string,
  ): Promise<StaffSuggestionRuleIdResponse> {
    await this.commands.execute<ReviseStaffSuggestionCommand, void>(
      new ReviseStaffSuggestionCommand(id, body, staffUserId),
    );
    return { id };
  }

  @Put(":id/active")
  async setActive(
    @Param("id") id: string,
    @Body(new ZodBody(setStaffSuggestionActivePayloadSchema)) body: SetStaffSuggestionActivePayload,
    @StaffUserId() staffUserId: string,
  ): Promise<StaffSuggestionRuleIdResponse> {
    await this.commands.execute<SetStaffSuggestionActiveCommand, void>(
      new SetStaffSuggestionActiveCommand(id, body.active, staffUserId),
    );
    return { id };
  }

  @Put(":id/archive")
  async archive(
    @Param("id") id: string,
    @StaffUserId() staffUserId: string,
  ): Promise<StaffSuggestionRuleIdResponse> {
    await this.commands.execute<ArchiveStaffSuggestionCommand, void>(
      new ArchiveStaffSuggestionCommand(id, staffUserId),
    );
    return { id };
  }
}
