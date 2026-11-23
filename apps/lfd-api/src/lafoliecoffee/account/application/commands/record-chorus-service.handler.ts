import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../../platform/events/domain-event-publisher.js";
import { Clock } from "../../../../platform/time/clock.js";
import type { Company } from "../../domain/entities/company.js";
import { CompanyNotFoundError } from "../../domain/errors/account-errors.js";
import { companyNamed } from "../../domain/events/journal-names.js";
import { ChorusServiceRecordedEvent } from "../../domain/events/staff-acts.event.js";
import { ChorusServiceRepository } from "../../domain/ports/chorus-service.repository.js";
import { CompanyFollowsReader } from "../../domain/ports/company-follows.reader.js";
import { CompanyRepository } from "../../domain/ports/company.repository.js";
import { StaffDirectory } from "../../domain/ports/staff-directory.js";
import {
  ChorusService,
  type ChorusServicePayer,
} from "../../domain/value-objects/chorus-service.js";
import { RecordChorusServiceCommand } from "./record-chorus-service.command.js";

/**
 * Pose la fiche du service Chorus d'une société. Le payeur est celui
 * d'**aujourd'hui** — le principal dont elle suit la facturation, sinon
 * elle-même — et c'est la fiche qui juge s'il l'admet
 * (`ChorusService.record`).
 *
 * La fiche et son fait au journal partent ensemble. Reposer la même fiche
 * n'écrit rien : la parole de l'agent qui l'a posée la première reste la
 * sienne.
 *
 * @throws {CompanyNotFoundError} la société, ou son payeur, n'existe pas.
 * @throws {ChorusServicePayerNotPublicError} le payeur n'est pas public.
 * @throws {ChorusServiceCodeOnSolePayerError} un code sur un payeur seul.
 * @throws {InvalidChorusServiceError} la fiche est mal formée.
 */
@CommandHandler(RecordChorusServiceCommand)
export class RecordChorusServiceHandler implements ICommandHandler<
  RecordChorusServiceCommand,
  void
> {
  constructor(
    private readonly companies: CompanyRepository,
    private readonly follows: CompanyFollowsReader,
    private readonly services: ChorusServiceRepository,
    private readonly staff: StaffDirectory,
    private readonly clock: Clock,
    private readonly events: DomainEventPublisher,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(command: RecordChorusServiceCommand): Promise<void> {
    const company = await this.companies.load(command.companyId);
    if (company === null) {
      throw new CompanyNotFoundError(command.companyId);
    }
    const now = this.clock.now();
    const payer = await this.payerOf(command.companyId, company, now);
    const agent = await this.staff.identify(command.staffUserId);
    const service = ChorusService.record(command.companyId, payer, command.payload, now, {
      staffUserId: command.staffUserId,
      name: agent?.name ?? "",
      role: agent?.role ?? "",
    });
    const current = await this.services.load(command.companyId);
    if (current !== null && current.sameAs(service)) {
      return;
    }
    await this.uow.run(async () => {
      await this.services.save(command.companyId, service);
      await this.events.publishTraced(
        new ChorusServiceRecordedEvent(companyNamed(command.companyId, company), {
          payerCompanyId: service.payerCompanyId,
          serviceCode: service.serviceCode,
          commitmentNumber: service.currentCommitment?.number ?? "",
          commitmentEndsOn: service.currentCommitment?.endsOn ?? null,
        }),
      );
    });
  }

  /** Le principal dont la société suit la facturation à `now`, sinon elle-même. */
  private async payerOf(
    companyId: string,
    company: Company,
    now: Date,
  ): Promise<ChorusServicePayer> {
    const billing = await this.follows.followsAt(companyId, "billing", now);
    if (billing === null) {
      return { companyId, isPublic: company.isPublic };
    }
    const parent = await this.companies.load(billing.parentId);
    if (parent === null) {
      throw new CompanyNotFoundError(billing.parentId);
    }
    return { companyId: billing.parentId, isPublic: parent.isPublic };
  }
}
