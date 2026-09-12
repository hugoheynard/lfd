import {
  type CompanyBankAccountSectionView,
  type CompanyBankAccountView,
  type SetCompanyBankAccountPayload,
  setCompanyBankAccountPayloadSchema,
} from "@lfd/contracts";
import { Body, Controller, Get, HttpCode, HttpStatus, Param, Put } from "@nestjs/common";
import { CommandBus, QueryBus } from "@nestjs/cqrs";

import { AdminSurface } from "../../../platform/auth/admin-surface.decorator.js";
import { ZodBody } from "../../../platform/shared/http/zod-body.pipe.js";
import { SetCompanyBankAccountCommand } from "../application/commands/set-company-bank-account.command.js";
import { GetCompanyBankAccountQuery } from "../application/queries/get-company-bank-account.query.js";

/**
 * Surface **staff** du RIB d'une société cliente.
 *
 * Contrôleur à part du mandat, alors que les deux peignent la même section
 * d'écran : ce sont deux sujets, pas deux gestes d'un même sujet. Le RIB est une
 * coordonnée qu'on recopie ; le mandat est une autorisation qu'on obtient. Les
 * réunir ici ferait le fichier où l'on pose la troisième chose.
 *
 * Staff-only, comme le mandat, et pour la même raison : la clientèle visée ne
 * saisit pas ses coordonnées bancaires elle-même — le commercial les reporte
 * depuis un RIB papier.
 */
@Controller("admin/companies")
@AdminSurface("b2b_payments")
export class AdminCompanyBankAccountController {
  constructor(
    private readonly commands: CommandBus,
    private readonly queries: QueryBus,
  ) {}

  /**
   * Le RIB du client, ou `null` s'il n'en a jamais déposé — le cas ordinaire.
   *
   * 🔴 L'IBAN ne redescend **jamais** : la vue n'en porte que les quatre
   * derniers caractères. Une réponse qui porterait un IBAN entier est une
   * réponse qui finit dans un journal d'accès.
   */
  @Get(":companyId/bank-account")
  async read(@Param("companyId") companyId: string): Promise<CompanyBankAccountSectionView> {
    // Enveloppé, jamais rendu nu : Nest sérialise un `null` de contrôleur en
    // CORPS VIDE, et le front recevrait `""` plutôt que `null`.
    const account = await this.queries.execute<
      GetCompanyBankAccountQuery,
      CompanyBankAccountView | null
    >(new GetCompanyBankAccountQuery(companyId));
    return { account };
  }

  /**
   * Recopie le RIB — titulaire, adresse, IBAN, BIC, **en un seul geste**.
   *
   * L'IBAN monte ici en clair, et c'est la seule direction où il circule. Il est
   * **scellé** avant d'entrer en colonne (AES-256-GCM) : c'est le régime du
   * compte d'un client, et il diffère de celui du compte créancier, stocké en
   * clair. L'asymétrie est écrite dans `company-bank-account.ts`.
   *
   * Les quatre parties sont exigées ensemble : un compte à moitié rempli ne se
   * découvrirait qu'au rejet du lot, cinq jours après l'envoi.
   */
  @Put(":companyId/bank-account")
  @HttpCode(HttpStatus.NO_CONTENT)
  async set(
    @Param("companyId") companyId: string,
    @Body(new ZodBody(setCompanyBankAccountPayloadSchema)) payload: SetCompanyBankAccountPayload,
  ): Promise<void> {
    await this.commands.execute<SetCompanyBankAccountCommand, void>(
      new SetCompanyBankAccountCommand(companyId, payload),
    );
  }
}
