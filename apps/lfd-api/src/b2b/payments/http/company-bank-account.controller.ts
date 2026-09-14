import {
  type CustomerBankAccountSectionView,
  type CustomerBankAccountView,
  type SetCompanyBankAccountPayload,
  setCompanyBankAccountPayloadSchema,
} from "@lfd/contracts";
import { Body, Controller, Get, HttpCode, HttpStatus, Param, Put } from "@nestjs/common";
import { CommandBus, QueryBus } from "@nestjs/cqrs";

import { CurrentUser } from "../../../platform/auth/current-user.decorator.js";
import type { Principal } from "../../../platform/auth/principal.js";
import { ZodBody } from "../../../platform/shared/http/zod-body.pipe.js";
import { SetMyCompanyBankAccountCommand } from "../application/commands/set-my-company-bank-account.command.js";
import { GetMyCompanyBankAccountQuery } from "../application/queries/get-my-company-bank-account.query.js";

/**
 * Surface **client** du RIB de sa société — la section RIB de `/mon-compte`.
 *
 * Le mur (détenteur ou facturation ; non-membre 404, autre rôle 403) vit dans
 * les handlers ; ce contrôleur ne fait que le transport. Aucune garde de
 * boutique : un RIB se dépose à tous les niveaux.
 *
 * Plan : `documentation/b2b/plan-rib-client.md`.
 */
@Controller("companies")
export class CompanyBankAccountController {
  constructor(
    private readonly commands: CommandBus,
    private readonly queries: QueryBus,
  ) {}

  /**
   * Le RIB de la société, ou `{ account: null }` s'il n'en a jamais été déposé.
   *
   * 🔴 L'IBAN ne redescend **jamais en JSON** : `last4` seulement, et sans les
   * zones facultatives du mandat.
   *
   * ⚠️ Amendé le 2026-09-14 : cette phrase disait « jamais », tout court. Le
   * PDF du mandat à signer (`GET :companyId/mandate/document.pdf`) rend l'IBAN
   * entier au même détenteur ou rôle facturation — assumé par Hugo, un mandat
   * EPC porte l'IBAN du débiteur (plan `documentation/b2b/plan-mandat-client.md`
   * §6 #3). Aucune réponse JSON ne le porte, toujours.
   */
  @Get(":companyId/bank-account")
  async read(
    @CurrentUser() user: Principal,
    @Param("companyId") companyId: string,
  ): Promise<CustomerBankAccountSectionView> {
    // Enveloppé, jamais rendu nu : Nest sérialise un `null` de contrôleur en
    // CORPS VIDE, et le front recevrait `""` plutôt que `null`.
    const account = await this.queries.execute<
      GetMyCompanyBankAccountQuery,
      CustomerBankAccountView | null
    >(new GetMyCompanyBankAccountQuery(user.userId, companyId));
    return { account };
  }

  /**
   * Recopie le RIB — titulaire, adresse, IBAN, BIC, en un seul geste, avec le
   * même payload que le staff. L'IBAN monte en clair ici et nulle part ne
   * redescend ; il est scellé avant d'entrer en colonne.
   *
   * ⚠️ Cette phrase disait « remplacer un compte déjà mandaté : aucune garde
   * ici, c'est l'écran qui le dit ». Depuis le 2026-09-14, le handler refuse en
   * **409** tant qu'un mandat est ACTIF (le changement de banque passe par le
   * staff), et révoque le BROUILLON en cours sinon (plan mandat client §8).
   */
  @Put(":companyId/bank-account")
  @HttpCode(HttpStatus.NO_CONTENT)
  async set(
    @CurrentUser() user: Principal,
    @Param("companyId") companyId: string,
    @Body(new ZodBody(setCompanyBankAccountPayloadSchema)) payload: SetCompanyBankAccountPayload,
  ): Promise<void> {
    await this.commands.execute<SetMyCompanyBankAccountCommand, void>(
      new SetMyCompanyBankAccountCommand(user.userId, companyId, payload),
    );
  }
}
