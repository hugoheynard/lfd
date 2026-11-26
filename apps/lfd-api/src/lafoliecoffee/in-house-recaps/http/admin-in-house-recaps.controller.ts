import { Controller, Get, HttpCode, HttpStatus, Param, Post } from "@nestjs/common";
import { CommandBus, QueryBus } from "@nestjs/cqrs";

import { AdminSurface, RequirePermission } from "../../../platform/auth/admin-surface.decorator.js";
import { StaffUserId } from "../../../platform/auth/staff.decorator.js";
import { IntentKey } from "../../../platform/shared/http/intent-key.decorator.js";
import { ReissueInHouseRecapCommand } from "../application/commands/reissue-in-house-recap.command.js";
import { GetInHouseRecapQuery } from "../application/queries/get-in-house-recap.query.js";
import type {
  InHouseRecapDetailView,
  PayerInHouseRecapsView,
  RevisedInHouseRecapView,
} from "../application/queries/in-house-recap.views.js";
import { ListPayerInHouseRecapsQuery } from "../application/queries/list-payer-in-house-recaps.query.js";
import { ListRevisedInHouseRecapsQuery } from "../application/queries/list-revised-in-house-recaps.query.js";

/**
 * **Les récapitulatifs des BL** d'un restaurant maison, pour l'onglet de la
 * fiche client (`plan-restaurants-maison.md`, D8–D10). Se lisent sous
 * `b2b_companies:read`, comme la fiche ; « Réémettre » se fait sous
 * `b2b_in_house_payers:write`, le droit de la nature maison.
 */
@Controller("admin")
@AdminSurface("b2b_companies")
export class AdminInHouseRecapsController {
  constructor(
    private readonly commands: CommandBus,
    private readonly queries: QueryBus,
  ) {}

  /** Les récapitulatifs du payeur, ses mois vides et ses mois manqués. */
  @Get("companies/:companyId/in-house-recaps")
  list(@Param("companyId") companyId: string): Promise<PayerInHouseRecapsView> {
    return this.queries.execute<ListPayerInHouseRecapsQuery, PayerInHouseRecapsView>(
      new ListPayerInHouseRecapsQuery(companyId),
    );
  }

  /** Les signalements : les récapitulatifs dont un BL a été révisé depuis l'émission. */
  @Get("in-house-recaps/revised")
  revised(): Promise<readonly RevisedInHouseRecapView[]> {
    return this.queries.execute<ListRevisedInHouseRecapsQuery, readonly RevisedInHouseRecapView[]>(
      new ListRevisedInHouseRecapsQuery(),
    );
  }

  /** Le détail ; `404` sur un récapitulatif inconnu. */
  @Get("in-house-recaps/:recapId")
  detail(@Param("recapId") recapId: string): Promise<InHouseRecapDetailView> {
    return this.queries.execute<GetInHouseRecapQuery, InHouseRecapDetailView>(
      new GetInHouseRecapQuery(recapId),
    );
  }

  /**
   * Réémet : un rectificatif qui remplace celui-ci ; `201` et son
   * identifiant. `409` s'il est déjà remplacé, ou s'il n'y a plus de BL
   * remis dans le mois. Une fois par intention de l'écran.
   */
  @Post("in-house-recaps/:recapId/reissue")
  @RequirePermission("b2b_in_house_payers:write")
  @HttpCode(HttpStatus.CREATED)
  async reissue(
    @Param("recapId") recapId: string,
    @StaffUserId() staffUserId: string,
    @IntentKey() intentKey: string,
  ): Promise<{ readonly id: string }> {
    const id = await this.commands.execute<ReissueInHouseRecapCommand, string>(
      new ReissueInHouseRecapCommand(recapId, staffUserId, intentKey),
    );
    return { id };
  }
}
