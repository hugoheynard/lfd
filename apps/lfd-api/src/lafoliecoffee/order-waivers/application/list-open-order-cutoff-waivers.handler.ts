import { instantToLocal, type OpenOrderCutoffWaiverView } from "@lfd/contracts";
import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";

import { Clock } from "../../../platform/time/clock.js";
import {
  StaffAuthorDirectory,
  type StaffAuthors,
} from "../../../staff/directory/domain/staff-author-directory.js";
import {
  OpenOrderCutoffWaiverReader,
  type OpenCutoffWaiverEntry,
} from "../domain/open-order-cutoff-waiver.reader.js";
import { ListOpenOrderCutoffWaiversQuery } from "./list-open-order-cutoff-waivers.query.js";

/**
 * La liste transverse des dérogations, à partir du jour de Paris : une
 * dérogation d'hier ne peut plus rien ouvrir, elle n'a plus rien à dire ici
 * (le journal la garde). Les auteurs sont nommés en une lecture pour toute la
 * liste ; une fiche inconnue rend `null`, jamais un nom inventé.
 */
@QueryHandler(ListOpenOrderCutoffWaiversQuery)
export class ListOpenOrderCutoffWaiversHandler implements IQueryHandler<
  ListOpenOrderCutoffWaiversQuery,
  readonly OpenOrderCutoffWaiverView[]
> {
  constructor(
    private readonly waivers: OpenOrderCutoffWaiverReader,
    private readonly authors: StaffAuthorDirectory,
    private readonly clock: Clock,
  ) {}

  async execute(): Promise<readonly OpenOrderCutoffWaiverView[]> {
    const today = instantToLocal(this.clock.now()).day;
    const entries = await this.waivers.listFrom(today);
    const authors = await this.authors.identify(entries.map((entry) => entry.grantedByStaffId));
    return entries.map((entry) => toView(entry, authors));
  }
}

function toView(entry: OpenCutoffWaiverEntry, authors: StaffAuthors): OpenOrderCutoffWaiverView {
  return {
    id: entry.id,
    companyId: entry.companyId,
    companyName: entry.companyName,
    fulfillmentDate: entry.fulfillmentDate,
    reason: entry.reason,
    grantedByStaffId: entry.grantedByStaffId,
    grantedByName: authors.nameOf(entry.grantedByStaffId),
    grantedAt: entry.grantedAt.toISOString(),
    usedByOrderId: entry.usedByOrderId,
  };
}
