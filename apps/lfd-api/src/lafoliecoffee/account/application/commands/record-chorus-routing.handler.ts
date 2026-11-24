import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { Clock } from "../../../../platform/time/clock.js";
import { DomainEventPublisher } from "../../../../platform/events/domain-event-publisher.js";
import { CompanyNotFoundError } from "../../domain/errors/account-errors.js";
import { companyNamed } from "../../domain/events/journal-names.js";
import { ChorusRoutingRecordedEvent } from "../../domain/events/staff-acts.event.js";
import { ChorusRoutingRepository } from "../../domain/ports/chorus-routing.repository.js";
import { CompanyRepository } from "../../domain/ports/company.repository.js";
import { PayerLiveMercurialeReader } from "../../domain/ports/payer-live-mercuriale.reader.js";
import { PayerUninvoicedOrdersReader } from "../../domain/ports/payer-uninvoiced-orders.reader.js";
import { StaffDirectory } from "../../domain/ports/staff-directory.js";
import {
  ensureCommitmentTimingAccepted,
  type CommitmentTimingFacts,
} from "../../domain/services/commitment-timing-rule.js";
import type { ChorusRouting } from "../../domain/value-objects/chorus-routing.js";
import { RecordChorusRoutingCommand } from "./record-chorus-routing.command.js";

/**
 * Pose la fiche Chorus Pro d'une société. C'est la société qui décide si elle
 * peut en avoir une (`Company.recordChorusRouting` refuse une forme non
 * publique) ; la fiche, elle, se range à part, une ligne par société.
 *
 * Le relevé et son fait au journal partent ensemble. Reposer le même relevé
 * n'écrit rien : la parole de l'agent qui l'a relevé
 * le premier reste la sienne.
 *
 * @throws {CompanyNotFoundError} la société n'existe pas.
 * @throws {ChorusRoutingNotPublicError} sa forme juridique n'est pas publique.
 * @throws {InvalidChorusRoutingError} la fiche est mal formée.
 * @throws voir `ensureCommitmentTimingAccepted` — le moment de l'engagement.
 */
@CommandHandler(RecordChorusRoutingCommand)
export class RecordChorusRoutingHandler implements ICommandHandler<
  RecordChorusRoutingCommand,
  void
> {
  constructor(
    private readonly companies: CompanyRepository,
    private readonly routings: ChorusRoutingRepository,
    private readonly staff: StaffDirectory,
    private readonly events: DomainEventPublisher,
    private readonly uow: UnitOfWork,
    private readonly mercuriales: PayerLiveMercurialeReader,
    private readonly uninvoiced: PayerUninvoicedOrdersReader,
    private readonly clock: Clock,
  ) {}

  async execute(command: RecordChorusRoutingCommand): Promise<void> {
    const company = await this.companies.load(command.companyId);
    if (company === null) {
      throw new CompanyNotFoundError(command.companyId);
    }
    const agent = await this.staff.identify(command.staffUserId);
    const routing = company.recordChorusRouting(command.payload, {
      staffUserId: command.staffUserId,
      name: agent?.name ?? "",
      role: agent?.role ?? "",
    });
    const current = await this.routings.load(command.companyId);
    if (current !== null && current.sameReadingAs(routing)) {
      return;
    }
    ensureCommitmentTimingAccepted(
      command.companyId,
      routing,
      current,
      await this.timingFacts(command.companyId, routing, current),
    );
    await this.uow.run(async () => {
      await this.routings.save(command.companyId, routing);
      await this.events.publishTraced(
        new ChorusRoutingRecordedEvent(companyNamed(command.companyId, company), {
          commitmentRequired: routing.commitmentRequired,
          serviceCodeRequired: routing.serviceCodeRequired,
          defaultServiceCode: routing.defaultServiceCode,
          commitmentTiming: routing.commitmentTiming,
          checkedOn: routing.checkedOn,
        }),
      );
    });
  }

  /** Les faits du payeur, lus seulement quand le mode change. */
  private async timingFacts(
    companyId: string,
    routing: ChorusRouting,
    current: ChorusRouting | null,
  ): Promise<CommitmentTimingFacts> {
    if (!routing.changesTimingFrom(current)) {
      return { liveMercuriale: false, uninvoicedOrders: false };
    }
    return {
      liveMercuriale: routing.onPeriodQuote
        ? await this.mercuriales.hasLiveMercuriale(companyId, this.clock.now())
        : false,
      uninvoicedOrders: await this.uninvoiced.hasUninvoicedOrders(companyId),
    };
  }
}
