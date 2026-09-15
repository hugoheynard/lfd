import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { CreditorReader } from "../../../accounting/domain/ports/creditor.reader.js";
import { FirstMandateLedger } from "../../../accounting/domain/ports/first-mandate-ledger.js";
import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../../platform/events/domain-event-publisher.js";
import { Clock } from "../../../../platform/time/clock.js";
import { SecretGenerator } from "../../../../platform/secret/secret-generator.js";
import { MandateDraftAlreadyExistsError } from "../../domain/errors/mandate-errors.js";
import { PaymentMandateRepository } from "../../domain/payment-mandate.repository.js";
import { CompanyBankAccountRepository } from "../../domain/ports/company-bank-account.repository.js";
import { mintDraftMandate } from "../mint-mandate-support.js";
import { MintMandateCommand } from "./mint-mandate.command.js";

/**
 * Frappe un mandat **maison**, depuis le back-office : une RUM neuve, un
 * émetteur nommé, aucune signature.
 *
 * La séquence vit dans `mintDraftMandate`, partagée avec le client : société →
 * **RIB** → émetteur → brouillon, tous en amont du tirage, et la frappe écrite
 * avec son fait au journal dans la même transaction.
 *
 * ## Le RIB est exigé (depuis le 2026-09-14)
 *
 * ⚠️ Ce JSDoc disait l'inverse — « la frappe ne lit pas le RIB, l'impression
 * refusera ». Hugo a tranché le 2026-09-14 : un mandat nomme le compte qu'il
 * autorise à débiter, et une RUM frappée sans compte est une référence perdue.
 *
 * ## Le brouillon en cours se refuse ici ET en base
 *
 * Le staff reçoit un **409 qui nomme la RUM** existante — le geste de sortie
 * est d'ouvrir ce brouillon-là, ou de l'abandonner. Deux clics simultanés, qui
 * passent tous deux la lecture, butent sur l'index partiel ; la séquence
 * partagée relit alors le brouillon gagnant, et le refus nomme sa RUM aussi.
 *
 * 🔴 **`findDraft` et pas `findCurrent`.** En rotation bancaire, un mandat actif
 * est toujours en vigueur pendant qu'on frappe son remplaçant : `findCurrent`
 * rendrait l'actif et ne verrait jamais le brouillon.
 */
@CommandHandler(MintMandateCommand)
export class MintMandateHandler implements ICommandHandler<MintMandateCommand, string> {
  constructor(
    private readonly mandates: PaymentMandateRepository,
    private readonly creditors: CreditorReader,
    private readonly clock: Clock,
    private readonly secrets: SecretGenerator,
    private readonly accounts: CompanyBankAccountRepository,
    private readonly events: DomainEventPublisher,
    private readonly uow: UnitOfWork,
    private readonly ledger: FirstMandateLedger,
  ) {}

  async execute(command: MintMandateCommand): Promise<string> {
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
      "staff",
    );
    if (!outcome.minted) {
      throw new MandateDraftAlreadyExistsError(outcome.draft.reference);
    }
    return outcome.mandateId;
  }
}
