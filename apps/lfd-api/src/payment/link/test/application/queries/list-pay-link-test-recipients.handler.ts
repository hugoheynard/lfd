import type { PayLinkTestRecipient } from "@lfd/contracts";
import { type IQueryHandler, QueryHandler } from "@nestjs/cqrs";

import { ReachableStaff } from "../../../../../staff/directory/domain/staff-contacts.js";
import { ListPayLinkTestRecipientsQuery } from "./list-pay-link-test-recipients.query.js";

/**
 * Les destinataires possibles d'un essai, lus par la lecture publiée de
 * l'annuaire (`ReachableStaff` : fiches non suspendues qui ont une adresse).
 * L'adresse est écartée ici même : elle ne sort jamais vers l'écran, et
 * l'envoi la relit au bloc `mail`. Sous `pay_link_test:read`, sans dépendre
 * du droit des destinataires des avis.
 */
@QueryHandler(ListPayLinkTestRecipientsQuery)
export class ListPayLinkTestRecipientsHandler implements IQueryHandler<
  ListPayLinkTestRecipientsQuery,
  readonly PayLinkTestRecipient[]
> {
  constructor(private readonly staff: ReachableStaff) {}

  async execute(): Promise<readonly PayLinkTestRecipient[]> {
    return (await this.staff.list()).map((member) => ({
      staffUserId: member.staffUserId,
      label: `${member.firstName} ${member.lastName}`.trim(),
    }));
  }
}
