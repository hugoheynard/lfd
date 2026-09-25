import type { DirectDebitBlockView } from "@lfd/contracts";
import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Post } from "@nestjs/common";
import { CommandBus, QueryBus } from "@nestjs/cqrs";

import { AdminSurface } from "../../../platform/auth/admin-surface.decorator.js";
import { StaffUserId } from "../../../platform/auth/staff.decorator.js";
import { ZodBody } from "../../../platform/shared/http/zod-body.pipe.js";
import { BlockDirectDebitCommand } from "../application/commands/block-direct-debit.command.js";
import { UnblockDirectDebitCommand } from "../application/commands/unblock-direct-debit.command.js";
import { ListDirectDebitBlocksQuery } from "../application/queries/list-direct-debit-blocks.query.js";
import { blockDirectDebitPayload, type BlockDirectDebitPayload } from "./payloads.js";

/**
 * Surface **comptabilité** du blocage du prélèvement.
 *
 * Elle vit dans `account` parce que la société y vit : c'est la même colonne,
 * écrite par le même agrégat. Elle déclare pourtant la ressource
 * `b2b_accounting` — c'est la comptabilité qui décide de suspendre un
 * prélèvement, pas le commercial. L'action se déduit du verbe
 * (`GET` → lecture, le reste → écriture). Plan :
 * `documentation/comptabilite/plan-blocage-prelevement-et-liens-de-paiement.md` §1.
 */
@Controller("admin/accounting/direct-debit-blocks")
@AdminSurface("b2b_accounting")
export class AdminDirectDebitBlocksController {
  constructor(
    private readonly queries: QueryBus,
    private readonly commands: CommandBus,
  ) {}

  /** Les sociétés au crédit mensuel, bloquées ou non. */
  @Get()
  list(): Promise<readonly DirectDebitBlockView[]> {
    return this.queries.execute<ListDirectDebitBlocksQuery, readonly DirectDebitBlockView[]>(
      new ListDirectDebitBlocksQuery(),
    );
  }

  /** Bloque le prélèvement : les commandes à venir se règlent par carte. */
  @Post(":companyId")
  @HttpCode(HttpStatus.NO_CONTENT)
  async block(
    @StaffUserId() staffUserId: string,
    @Param("companyId") companyId: string,
    @Body(new ZodBody(blockDirectDebitPayload)) payload: BlockDirectDebitPayload,
  ): Promise<void> {
    await this.commands.execute<BlockDirectDebitCommand, void>(
      new BlockDirectDebitCommand(companyId, staffUserId, payload.reason),
    );
  }

  /** Rétablit le prélèvement : le crédit accordé redevient le régime. */
  @Delete(":companyId")
  @HttpCode(HttpStatus.NO_CONTENT)
  async unblock(@Param("companyId") companyId: string): Promise<void> {
    await this.commands.execute<UnblockDirectDebitCommand, void>(
      new UnblockDirectDebitCommand(companyId),
    );
  }
}
