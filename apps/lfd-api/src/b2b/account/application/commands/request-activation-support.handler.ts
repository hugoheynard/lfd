import { CommandHandler, EventBus, type ICommandHandler } from "@nestjs/cqrs";

import { Clock } from "../../../../platform/time/clock.js";
import { SupportRequestedEvent } from "../../domain/events/support-requested.event.js";

import { OpenSupportRequestExistsError } from "../../domain/errors/account-errors.js";
import { MembershipReader } from "../../domain/ports/membership.reader.js";
import { SupportRequestRepository } from "../../domain/ports/support-request.repository.js";
import { ensureCompanyMember } from "../../domain/services/company-access.js";
import { RequestActivationSupportCommand } from "./request-activation-support.command.js";

/**
 * Enregistre une demande de support à l'activation.
 *
 * Le mur ne s'applique que si le client **désigne** une société : il faut en être
 * membre. Sans société, la demande porte sur la personne — c'est le cas d'un
 * prospect qui n'a rien encore déclaré, et c'est précisément qui on veut capter.
 */
@CommandHandler(RequestActivationSupportCommand)
export class RequestActivationSupportHandler implements ICommandHandler<
  RequestActivationSupportCommand,
  string
> {
  constructor(
    private readonly memberships: MembershipReader,
    private readonly support: SupportRequestRepository,
    private readonly events: EventBus,
    private readonly clock: Clock,
  ) {}

  async execute(command: RequestActivationSupportCommand): Promise<string> {
    const { companyId } = command.payload;
    if (companyId !== null) {
      const role = await this.memberships.roleOf(command.actorUserId, companyId);
      ensureCompanyMember(role, companyId);
    }

    // Une seule demande ouverte à la fois : par société quand il y en a une, par
    // PERSONNE sinon — sans quoi un prospect sans entreprise déposerait autant de
    // rappels qu'il a de clics.
    const scope = { companyId, requestedByUserId: command.actorUserId };
    if (await this.support.hasOpenRequest(scope)) {
      throw new OpenSupportRequestExistsError(companyId ?? command.actorUserId);
    }

    const id = await this.support.record(command.actorUserId, command.payload);
    // Publié APRÈS l'écriture : le journal est une projection, jamais une
    // condition de la transaction métier.
    this.events.publish(
      new SupportRequestedEvent(
        id,
        companyId,
        command.actorUserId,
        command.payload.channel,
        this.clock.now(),
      ),
    );
    return id;
  }
}
