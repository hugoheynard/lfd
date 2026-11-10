import type { CardComplementPaymentView } from "@lfd/contracts";
import { Controller, Delete, Get, HttpCode, HttpStatus, Param } from "@nestjs/common";
import { CommandBus, QueryBus } from "@nestjs/cqrs";

import { CurrentUser } from "../../../platform/auth/current-user.decorator.js";
import type { Principal } from "../../../platform/auth/principal.js";
import { AbandonCardIncreaseCommand } from "../revision/application/commands/abandon-card-increase.command.js";
import { GetComplementPaymentQuery } from "../application/queries/get-complement-payment.query.js";

/**
 * **Le complément d'une hausse, côté client** (doc
 * `documentation/commandes/modification/modifier-une-commande.md`, §2.7.4) — le
 * relire pour payer, ou l'abandonner. Le mur est celui de la commande
 * (`ensureOrderVisible`) : hors mur, `404`.
 */
@Controller("orders")
export class OrderComplementController {
  constructor(
    private readonly commands: CommandBus,
    private readonly queries: QueryBus,
  ) {}

  /**
   * Le complément qui attend son paiement — `clientSecret` relu chez le
   * prestataire. `409` `orders.card_increase.nothing_to_pay` s'il n'y en a pas.
   */
  @Get(":id/complement")
  complement(
    @CurrentUser() user: Principal,
    @Param("id") id: string,
  ): Promise<CardComplementPaymentView> {
    return this.queries.execute<GetComplementPaymentQuery, CardComplementPaymentView>(
      new GetComplementPaymentQuery(user.userId, id),
    );
  }

  /** Abandonner le complément : `204`, la commande reste telle quelle. */
  @Delete(":id/complement")
  @HttpCode(HttpStatus.NO_CONTENT)
  async abandon(@CurrentUser() user: Principal, @Param("id") id: string): Promise<void> {
    await this.commands.execute<AbandonCardIncreaseCommand, void>(
      new AbandonCardIncreaseCommand(id, { kind: "customer", userId: user.userId }),
    );
  }
}
