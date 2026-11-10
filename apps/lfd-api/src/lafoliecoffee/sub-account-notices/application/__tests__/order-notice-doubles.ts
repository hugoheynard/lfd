import {
  AcceptedMembersReader,
  type AcceptedMember,
} from "../../../account/domain/ports/accepted-members.reader.js";
import { CompanyLifecycleReader } from "../../../account/domain/ports/company-lifecycle.reader.js";
import type { CompanyRole } from "../../../account/domain/value-objects/company-role.js";
import type { CompanyStatus } from "../../../account/domain/value-objects/company-status.js";
import {
  OrderNoticeSummaryReader,
  type OrderNoticeSummary,
} from "../../../orders/domain/ports/order-notice-summary.reader.js";
import {
  type RecordedMail,
  RecordingMail,
} from "../../../../mail/channels/requests/__tests__/recording-mail.js";
import { NoticeSendJournal } from "../../domain/ports/notice-send.journal.js";

/** Une commande du site `chalet`, principal `alpes` copié, au compte du principal. */
export function chaletOrder(overrides: Partial<OrderNoticeSummary> = {}): OrderNoticeSummary {
  return {
    orderId: "o1",
    orderNumber: "ORD-0001",
    companyId: "chalet",
    companyName: "Chalet Gentiane",
    principalCompanyId: "alpes",
    principalSeesAmount: true,
    billedCompanyId: "alpes",
    totalCents: 4_200,
    placedAt: new Date(Date.UTC(2030, 0, 1, 9)),
    requestedFor: "2030-01-02",
    placedByUserId: "housekeeper",
    settledAtPlacement: true,
    enteredByTeam: false,
    ...overrides,
  };
}

export class FixedOrderSummaries extends OrderNoticeSummaryReader {
  constructor(private readonly orders: readonly OrderNoticeSummary[]) {
    super();
  }

  summaryOf(orderId: string): Promise<OrderNoticeSummary | null> {
    return Promise.resolve(this.orders.find((order) => order.orderId === orderId) ?? null);
  }
}

export class FixedLifecycle extends CompanyLifecycleReader {
  constructor(private readonly statuses: ReadonlyMap<string, CompanyStatus>) {
    super();
  }

  statusOf(companyId: string): Promise<CompanyStatus | null> {
    return Promise.resolve(this.statuses.get(companyId) ?? null);
  }
}

/** Les membres ACCEPTÉS, par société — ce que l'adaptateur rend déjà filtré. */
export class FixedMembers extends AcceptedMembersReader {
  constructor(private readonly byCompany: ReadonlyMap<string, readonly AcceptedMember[]>) {
    super();
  }

  withRoles(companyId: string, roles: readonly CompanyRole[]): Promise<readonly AcceptedMember[]> {
    return Promise.resolve(
      (this.byCompany.get(companyId) ?? []).filter((member) => roles.includes(member.role)),
    );
  }
}

export class MemoryNoticeJournal extends NoticeSendJournal {
  readonly rows = new Set<string>();

  claim(eventId: string, userId: string): Promise<boolean> {
    const key = `${eventId}/${userId}`;
    if (this.rows.has(key)) {
      return Promise.resolve(false);
    }
    this.rows.add(key);
    return Promise.resolve(true);
  }
}

/**
 * La porte du bloc `mail`, doublée : les avis sont DEMANDÉS (lot S2h), dans la
 * transaction de la livraison que ces tests ne jouent pas. `sent` nomme ce
 * qui a été demandé, et seulement ça — un `sendAndAwaitReceipt` y serait une faute.
 */
export class RecordingNoticeMails extends RecordingMail {
  get sent(): readonly RecordedMail[] {
    if (this.awaitedReceipt.length > 0) {
      throw new TypeError("un avis au principal se demande, il ne s'envoie pas sur-le-champ");
    }
    return this.queued;
  }
}
