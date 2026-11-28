import { CommandBus, CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { CompanyNotFoundError } from "../../domain/errors/account-errors.js";
import { AdminCompanyReader } from "../../domain/ports/admin-company.reader.js";
import { CompanyRepository } from "../../domain/ports/company.repository.js";
import { activationGate } from "../../domain/services/activation-gate.js";
import { ActivateCompanyByStaffCommand } from "./activate-company.command.js";
import {
  ConvertCounterAccountCommand,
  type CounterAccountConversion,
} from "./convert-counter-account.command.js";

/** Le statut d'un compte ouvert au comptoir, tel que la fiche le lit. */
const COUNTER_OPENED = "counter_opened";

/**
 * Convertit un compte ouvert au comptoir (§ 3.1, § 4).
 *
 * - **Verdict d'activation vert** (la fonction qui garde l'activation, lue
 *   sur la fiche) : le compte s'active directement, par le cas d'usage de
 *   l'activation lui-même (`ActivateCompanyByStaffCommand`) — même trace,
 *   même fait, même règle ; `Company.activate` admet `counter_opened`.
 * - **Sinon** : `Company.convertFromCounter` le passe `pending`, ou refuse
 *   quand l'identité légale ou l'adresse de facturation manque ; le parcours
 *   d'activation normal reprend.
 *
 * L'agrégat refuse un compte qui n'est plus ouvert au comptoir : un second
 * clic est un `409` qui n'écrit rien.
 *
 * Le moyen d'encaissement n'est pas touché : il reste le virement posé à
 * l'ouverture (§ 3.2).
 *
 * @sans-journal la branche `pending` ne décide rien : elle rend le compte au
 * parcours d'activation, dont l'activation publie son fait ; la branche
 * `active` passe par `ActivateCompanyByStaffCommand`, qui journalise.
 *
 * @throws {CompanyNotFoundError} aucune société pour cet id.
 * @throws {CompanyStatusTransitionError} le compte n'est pas ouvert au comptoir.
 * @throws {CounterAccountConversionBlockedError} SIRET ou adresse de facturation manquants.
 */
@CommandHandler(ConvertCounterAccountCommand)
export class ConvertCounterAccountHandler implements ICommandHandler<
  ConvertCounterAccountCommand,
  CounterAccountConversion
> {
  constructor(
    private readonly companies: CompanyRepository,
    private readonly fiches: AdminCompanyReader,
    private readonly commands: CommandBus,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(command: ConvertCounterAccountCommand): Promise<CounterAccountConversion> {
    const fiche = await this.fiches.byId(command.companyId);
    if (fiche === null) {
      throw new CompanyNotFoundError(command.companyId);
    }
    if (fiche.status === COUNTER_OPENED && activationGate(fiche).blocking.length === 0) {
      await this.commands.execute<ActivateCompanyByStaffCommand, void>(
        new ActivateCompanyByStaffCommand(command.companyId, command.staffUserId),
      );
      return "active";
    }
    await this.uow.run(async () => {
      const company = await this.companies.load(command.companyId);
      if (company === null) {
        throw new CompanyNotFoundError(command.companyId);
      }
      company.convertFromCounter(fiche.addresses.billing !== null);
      await this.companies.save(company);
    });
    return "pending";
  }
}
