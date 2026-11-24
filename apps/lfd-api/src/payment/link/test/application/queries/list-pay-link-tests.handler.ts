import type { PayLinkTestView } from "@lfd/contracts";
import { type IQueryHandler, QueryHandler } from "@nestjs/cqrs";

import { Clock } from "../../../../../platform/time/clock.js";
import { StaffAuthorDirectory } from "../../../../../staff/directory/domain/staff-author-directory.js";
import { PayLinks } from "../../../../channels/requests/pay-links.js";
import { movementSubjectKey } from "../../../../channels/subjects/index.js";
import type { PayLinkTest } from "../../domain/pay-link-test.js";
import { payLinkTestSubject } from "../../domain/pay-link-test-subject.js";
import { PayLinkTestReader } from "../../domain/ports/pay-link-test.reader.js";
import { ListPayLinkTestsQuery } from "./list-pay-link-tests.query.js";

/** Au plus cinq par jour : cent essais couvrent trois semaines au moins. */
const LIST_LIMIT = 100;

/**
 * Liste les essais : l'état (« expiré » calculé à l'horloge), les instants,
 * l'auteur nommé, et l'adresse à copier tant que l'essai se paie — lue en UNE
 * fois pour toute la page. Aucune adresse e-mail : la table n'en porte pas.
 */
@QueryHandler(ListPayLinkTestsQuery)
export class ListPayLinkTestsHandler implements IQueryHandler<
  ListPayLinkTestsQuery,
  readonly PayLinkTestView[]
> {
  constructor(
    private readonly reader: PayLinkTestReader,
    private readonly payLinks: PayLinks,
    private readonly authors: StaffAuthorDirectory,
    private readonly clock: Clock,
  ) {}

  async execute(): Promise<readonly PayLinkTestView[]> {
    const now = this.clock.now();
    const tests = await this.reader.recent(LIST_LIMIT);
    const payable = tests.filter((test) => test.isPayableAt(now));
    const [urls, authors] = await Promise.all([
      this.payLinks.urlsOf(payable.map((test) => payLinkTestSubject(test.id))),
      this.authors.identify(tests.map((test) => test.createdByStaffId)),
    ]);
    const urlBySubject = new Map(
      urls.map((entry) => [movementSubjectKey(entry.subject), entry.url]),
    );
    return tests.map((test) => ({
      id: test.id,
      state: test.isExpiredAt(now) ? "expired" : test.state,
      createdAt: test.createdAt.toISOString(),
      createdByLabel: authors.nameOf(test.createdByStaffId),
      paidAt: test.paidAt?.toISOString() ?? null,
      refundedAt: test.refundedAt?.toISOString() ?? null,
      url: urlOf(test, now, urlBySubject),
    }));
  }
}

function urlOf(test: PayLinkTest, now: Date, urls: ReadonlyMap<string, string>): string | null {
  if (!test.isPayableAt(now)) {
    return null;
  }
  return urls.get(movementSubjectKey(payLinkTestSubject(test.id))) ?? null;
}
