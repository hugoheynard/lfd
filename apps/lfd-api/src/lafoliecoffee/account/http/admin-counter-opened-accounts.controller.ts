import type { CounterAccountConversionView, CounterOpenedAccountsView } from "@lfd/contracts";
import { Controller, Get, HttpCode, HttpStatus, Param, Post } from "@nestjs/common";
import { CommandBus, QueryBus } from "@nestjs/cqrs";

import { AdminSurface } from "../../../platform/auth/admin-surface.decorator.js";
import { StaffUserId } from "../../../platform/auth/staff.decorator.js";
import { Idempotent } from "../../../platform/shared/http/idempotent.decorator.js";
import {
  ConvertCounterAccountCommand,
  type CounterAccountConversion,
} from "../application/commands/convert-counter-account.command.js";
import { ListCounterOpenedAccountsQuery } from "../application/queries/list-counter-opened-accounts.query.js";

/**
 * **La page « Comptes du comptoir »** de l'espace commerce
 * (`plan-comptes-du-comptoir.md`, § 4) : la liste des comptes ouverts au
 * comptoir avec leur dû, et leur conversion. Sous le droit des comptes
 * clients (`b2b_companies`), pas sous `b2b_counter_accounts` : convertir
 * est un geste du commerce, pas du comptoir (§ 3.4).
 *
 * Un chemin à lui plutôt que sous `admin/companies` : `GET
 * admin/companies/:companyId` y prendrait le segment pour un identifiant.
 */
@Controller("admin/counter-opened-accounts")
@AdminSurface("b2b_companies")
export class AdminCounterOpenedAccountsController {
  constructor(
    private readonly commands: CommandBus,
    private readonly queries: QueryBus,
  ) {}

  /** La table, du plus ancien au plus récent, et le total du dû. */
  @Get()
  list(): Promise<CounterOpenedAccountsView> {
    return this.queries.execute<ListCounterOpenedAccountsQuery, CounterOpenedAccountsView>(
      new ListCounterOpenedAccountsQuery(),
    );
  }

  /** Convertit le compte : `active` si rien ne manque, `pending` sinon. */
  @Post(":companyId/convert")
  @HttpCode(HttpStatus.OK)
  @Idempotent(
    "convertit un compte ouvert au comptoir : rejouée, le compte n'est plus ouvert au comptoir et la conversion est refusée sans rien écrire",
  )
  async convert(
    @Param("companyId") companyId: string,
    @StaffUserId() staffUserId: string,
  ): Promise<CounterAccountConversionView> {
    const status = await this.commands.execute<
      ConvertCounterAccountCommand,
      CounterAccountConversion
    >(new ConvertCounterAccountCommand(companyId, staffUserId));
    return { status };
  }
}
