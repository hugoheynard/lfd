import type { SupportRequestView } from "@lfd/contracts";

import { AppConfig, type MailerConfig } from "../../../../../platform/config/app-config.js";
import { SupportRequestReader } from "../../../domain/ports/support-request.reader.js";

/** La boîte de l'équipe posée — ou absente (`null`) — sans lire le `.env`. */
export class Settings extends AppConfig {
  constructor(private readonly inbox: string | null) {
    super();
  }
  override mailerConfig(): MailerConfig {
    return { ...super.mailerConfig(), staffInbox: this.inbox };
  }
}

export class OneRequest extends SupportRequestReader {
  constructor(private readonly stored: SupportRequestView | null) {
    super();
  }
  find(id: string): Promise<SupportRequestView | null> {
    return Promise.resolve(this.stored?.id === id ? this.stored : null);
  }
}

/** Les dates ne sont comparées qu'entre elles ou à leur mise en forme, jamais à l'horloge. */
export const REQUEST: SupportRequestView = {
  id: "sr_1",
  companyId: "c1",
  requestedByUserId: "user_1",
  channel: "phone",
  purpose: "billing",
  phoneNumber: "06 12 34 56 78",
  asap: true,
  scheduledDate: null,
  slot: null,
  message: "Une facture en double",
  handledAt: null,
  createdAt: "2026-06-01T08:00:00.000Z",
};
