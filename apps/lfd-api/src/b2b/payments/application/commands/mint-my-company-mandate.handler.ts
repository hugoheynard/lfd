import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { CreditorReader } from "../../../accounting/domain/ports/creditor.reader.js";
import { FirstMandateLedger } from "../../../accounting/domain/ports/first-mandate-ledger.js";
import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../../platform/events/domain-event-publisher.js";
import { SecretGenerator } from "../../../../platform/secret/secret-generator.js";
import { Clock } from "../../../../platform/time/clock.js";
import { MandateAlreadyInForceError } from "../../domain/errors/mandate-errors.js";
import { PaymentMandateRepository } from "../../domain/payment-mandate.repository.js";
import { BankAccountGuardReader } from "../../domain/ports/bank-account-guard.reader.js";
import { CompanyBankAccountRepository } from "../../domain/ports/company-bank-account.repository.js";
import { CustomerMandateGate } from "../../domain/ports/customer-mandate-gate.js";
import { ensureCustomerMandateAccess } from "../customer-mandate-access.js";
import { mintDraftMandate } from "../mint-mandate-support.js";
import { MintMyCompanyMandateCommand } from "./mint-my-company-mandate.command.js";

/**
 * Le client génère son mandat — ou retrouve celui qui attend sa signature.
 *
 * Ordre : mur (404/403) → drapeau (409) → **actif** (409) → RIB (409) →
 * émetteur → brouillon rendu. La frappe elle-même est celle du staff.
 *
 * - **Un actif fait refuser** : le remplacer engage un changement de compte ou
 *   de papier que le client ne mène pas seul (plan §6 #6).
 * - **Un brouillon est rendu, jamais refusé** — y compris quand c'est l'index
 *   qui a tranché entre deux onglets (plan §6 #5).
 *
 * Rend l'identifiant du mandat : c'est une écriture, le contrôleur relit.
 */
@CommandHandler(MintMyCompanyMandateCommand)
export class MintMyCompanyMandateHandler implements ICommandHandler<
  MintMyCompanyMandateCommand,
  string
> {
  constructor(
    private readonly guard: BankAccountGuardReader,
    private readonly gate: CustomerMandateGate,
    private readonly mandates: PaymentMandateRepository,
    private readonly accounts: CompanyBankAccountRepository,
    private readonly creditors: CreditorReader,
    private readonly clock: Clock,
    private readonly secrets: SecretGenerator,
    private readonly events: DomainEventPublisher,
    private readonly uow: UnitOfWork,
    private readonly ledger: FirstMandateLedger,
  ) {}

  async execute(command: MintMyCompanyMandateCommand): Promise<string> {
    await ensureCustomerMandateAccess(
      { guard: this.guard, gate: this.gate },
      command.actorUserId,
      command.companyId,
    );

    const current = await this.mandates.findCurrent(command.companyId);
    if (current?.debitable() === true) {
      throw new MandateAlreadyInForceError(command.companyId);
    }

    const outcome = await mintDraftMandate(
      {
        mandates: this.mandates,
        accounts: this.accounts,
        creditors: this.creditors,
        clock: this.clock,
        secrets: this.secrets,
        events: this.events,
        uow: this.uow,
        ledger: this.ledger,
      },
      command.companyId,
      "customer",
    );
    return outcome.minted ? outcome.mandateId : outcome.draft.id;
  }
}
