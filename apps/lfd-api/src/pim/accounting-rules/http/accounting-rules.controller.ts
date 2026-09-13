import { Body, Controller, Get, Put } from "@nestjs/common";
import { CommandBus, QueryBus } from "@nestjs/cqrs";
import {
  proPriceMethodPayloadSchema,
  proPriceRatioPayloadSchema,
  type AccountingRulesView,
  type ProPriceMethodPayload,
  type ProPriceRatioPayload,
} from "@lfd/pim-contracts";

import { AdminSurface } from "../../../platform/auth/admin-surface.decorator.js";
import { ZodBody } from "../../../platform/shared/http/zod-body.pipe.js";
import { ReadAccountingRulesQuery } from "../application/read-accounting-rules.js";
import { SetProPriceRatioCommand } from "../application/set-pro-price-ratio.js";
import { ChooseProPriceMethodCommand } from "../application/choose-pro-price-method.js";

/**
 * **Règles comptables** — le réglage unique de la maison. Le contrôleur ne fait
 * que dispatcher sur les bus CQRS.
 *
 * Surface staff murée par `@AdminSurface("pim_tax")`, comme les taux de TVA et pour
 * la même raison : décider ce que le professionnel paie par rapport au
 * particulier est une décision comptable, pas une édition de catalogue.
 * `catalog:write` est réservé à l'admin, et la comptabilité doit pouvoir poser
 * ce rapport sans l'être.
 *
 * `PUT` et non `POST` : le réglage est unique et idempotent — reposer le même
 * rapport laisse le système dans le même état. Il n'y a rien à créer, et pas
 * d'identifiant à rendre.
 */
@AdminSurface("pim_tax")
@Controller("accounting-rules")
export class AccountingRulesController {
  constructor(
    private readonly commands: CommandBus,
    private readonly queries: QueryBus,
  ) {}

  @Get()
  read(): Promise<AccountingRulesView> {
    return this.queries.execute<ReadAccountingRulesQuery, AccountingRulesView>(
      new ReadAccountingRulesQuery(),
    );
  }

  @Put("pro-price-ratio")
  async setProPriceRatio(
    @Body(new ZodBody(proPriceRatioPayloadSchema)) body: ProPriceRatioPayload,
  ): Promise<AccountingRulesView> {
    await this.commands.execute<SetProPriceRatioCommand, void>(
      new SetProPriceRatioCommand(body.ratioBp),
    );
    // On rend la vue relue plutôt qu'un accusé vide : l'écran affiche la date
    // du dernier réglage, et la recalculer côté front l'obligerait à inventer
    // une horloge — donc à afficher l'heure du navigateur pour un fait écrit
    // par le serveur.
    return this.queries.execute<ReadAccountingRulesQuery, AccountingRulesView>(
      new ReadAccountingRulesQuery(),
    );
  }

  /**
   * **Choisir la méthode appliquée.**
   *
   * Une route à part et non un champ de plus sur `pro-price-ratio` : ce sont
   * deux décisions, chacune retarife le catalogue professionnel, et les fondre
   * rendrait impossible de lire dans le journal laquelle a produit quel écart.
   *
   * `PUT` pour la même raison que sa voisine : le réglage est unique et
   * rechoisir la même méthode laisse le système dans le même état.
   */
  @Put("pro-price-method")
  async chooseProPriceMethod(
    @Body(new ZodBody(proPriceMethodPayloadSchema)) body: ProPriceMethodPayload,
  ): Promise<AccountingRulesView> {
    await this.commands.execute<ChooseProPriceMethodCommand, void>(
      new ChooseProPriceMethodCommand(body.method),
    );
    return this.queries.execute<ReadAccountingRulesQuery, AccountingRulesView>(
      new ReadAccountingRulesQuery(),
    );
  }
}
