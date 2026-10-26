import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../../platform/events/domain-event-publisher.js";
import { IdGenerator } from "../../../../platform/id/id-generator.js";
import { Clock } from "../../../../platform/time/clock.js";
import { CompanyLifecycleReader } from "../../../account/domain/ports/company-lifecycle.reader.js";
import { CompanyNameReader } from "../../../account/domain/ports/company-name.reader.js";
import { StaffDirectory } from "../../../account/domain/ports/staff-directory.js";
import { authorOf } from "../../../feature-access/application/feature-access-author.js";
import {
  OrderOpeningExemption,
  type CompanyCandidate,
  type ExemptionStamp,
} from "../../domain/order-opening-exemption.js";
import { OrderOpeningExemptionGrantedEvent } from "../../domain/order-opening-exemption.events.js";
import { ActiveOrderOpeningExemptions } from "../../domain/ports/active-order-opening-exemptions.reader.js";
import { OrderOpeningExemptionRepository } from "../../domain/ports/order-opening-exemption.repository.js";
import { GrantOrderOpeningExemptionCommand } from "./grant-order-opening-exemption.command.js";

/**
 * Accorde une exemption. Le doublon se cherche DANS la transaction, parmi les
 * actives ; deux ajouts simultanés se départagent par l'index unique partiel
 * de la table (le second rend un 409).
 */
@CommandHandler(GrantOrderOpeningExemptionCommand)
export class GrantOrderOpeningExemptionHandler implements ICommandHandler<
  GrantOrderOpeningExemptionCommand,
  string
> {
  constructor(
    private readonly active: ActiveOrderOpeningExemptions,
    private readonly exemptions: OrderOpeningExemptionRepository,
    private readonly names: CompanyNameReader,
    private readonly lifecycles: CompanyLifecycleReader,
    private readonly staff: StaffDirectory,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
    private readonly events: DomainEventPublisher,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(command: GrantOrderOpeningExemptionCommand): Promise<string> {
    const stamp: ExemptionStamp = {
      at: this.clock.now(),
      author: await authorOf(this.staff, command.staffUserId),
    };
    return this.uow.run(async () => {
      const exemption = await this.compose(command, stamp);
      await this.exemptions.save(exemption);
      await this.events.publishTraced(new OrderOpeningExemptionGrantedEvent(exemption));
      return exemption.id;
    });
  }

  private async compose(
    command: GrantOrderOpeningExemptionCommand,
    stamp: ExemptionStamp,
  ): Promise<OrderOpeningExemption> {
    const { payload } = command;
    const id = this.ids.next();
    const active = await this.active.active();
    if (payload.kind === "email") {
      return OrderOpeningExemption.grantToEmail({ id, email: payload.email, active, stamp });
    }
    return OrderOpeningExemption.grantToCompany({
      id,
      companyId: payload.companyId,
      company: await this.candidate(payload.companyId),
      active,
      stamp,
    });
  }

  private async candidate(companyId: string): Promise<CompanyCandidate | null> {
    // Séquentiel, jamais `Promise.all` : on est sous transaction, et une
    // connexion de transaction ne sert qu'une requête à la fois.
    const name = await this.names.nameOf(companyId);
    const status = await this.lifecycles.statusOf(companyId);
    return name === null || status === null ? null : { name, status };
  }
}
