import type { MailReceipt, SendMailArgs } from "@lfd/mailer";

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
import type { B2bMails } from "../../../../platform/mailer/mail-templates.js";
import type { B2bMailer } from "../../../../platform/mailer/mailer.tokens.js";
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

export class RecordingMailer implements B2bMailer {
  readonly enabled = true;
  readonly sent: SendMailArgs<B2bMails>[] = [];
  send<K extends keyof B2bMails>(args: SendMailArgs<B2bMails, K>): Promise<MailReceipt> {
    this.sent.push(args);
    return Promise.resolve({ providerId: "re_1" });
  }
}
