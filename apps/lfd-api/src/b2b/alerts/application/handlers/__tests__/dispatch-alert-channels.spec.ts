import { ALERT_KINDS, type AlertKind, type AlertRule } from "@lfd/contracts";

import {
  OpenableUnitOfWork,
  RecordingMailRequests,
} from "../../../../../mail/channels/requests/__tests__/recording-mail-requests.js";
import { AppConfig, type MailerConfig } from "../../../../../platform/config/app-config.js";
import {
  type StaffNotice,
  StaffNotifier,
} from "../../../../../staff/notifications/domain/ports/staff-notifier.js";
import { ALERT_KIND_TITLES } from "../../../domain/alert-labels.js";
import type { AlertDraft } from "../../../domain/evaluate-order.js";
import type { AlertContext } from "../../../domain/ports/alert-channels.js";
import { DispatchAlertChannels } from "../dispatch-alert-channels.service.js";

/** La vraie configuration, dont seuls les deux réglages lus sont fixés. */
class Settings extends AppConfig {
  constructor(
    private readonly inbox: string | null,
    private readonly base: string | null,
  ) {
    super();
  }
  override mailerConfig(): MailerConfig {
    return { ...super.mailerConfig(), staffInbox: this.inbox };
  }
  override adminBaseUrl(): string | null {
    return this.base;
  }
}

class RecordingNotifier extends StaffNotifier {
  readonly notices: StaffNotice[] = [];
  notify(notices: readonly StaffNotice[]): Promise<void> {
    this.notices.push(...notices);
    return Promise.resolve();
  }
}

const KIND: AlertKind = "product.first_order";

const DRAFT: AlertDraft = {
  kind: KIND,
  findings: [
    {
      sku: "PAIN-1",
      productName: "Pain de campagne",
      quantity: 4,
      baseline: null,
      deviationPercent: null,
      message: "Première commande de Pain de campagne",
    },
  ],
};

const CONTEXT: AlertContext = {
  companyId: "co_1",
  companyName: "Chalet des Alpes",
  orderNumber: "CMD-0042",
  occurredAt: new Date(0),
};

function rules(staffEmail: boolean, staffInApp = false): ReadonlyMap<AlertKind, AlertRule> {
  const defaults = ALERT_KINDS[KIND].defaults;
  return new Map([
    [KIND, { ...defaults, delivery: { ...defaults.delivery, staffEmail, staffInApp } }],
  ]);
}

function setup(inbox: string | null = "equipe@lfc.fr") {
  const uow = new OpenableUnitOfWork();
  const mails = new RecordingMailRequests(uow);
  const notifier = new RecordingNotifier();
  const channels = new DispatchAlertChannels(
    notifier,
    mails,
    uow,
    new Settings(inbox, "https://bo.lfc.fr"),
  );
  return { mails, notifier, channels };
}

/*
 * Les canaux d'une alerte de compte, lot S2h (`plan-service-e-mails.md`) :
 * l'e-mail se DEMANDE au bloc `mail`, dans sa propre unité de travail — le
 * double refuse `request` hors transaction —, et un refus ne remonte jamais.
 */
describe("DispatchAlertChannels — le canal e-mail", () => {
  it("demande l'e-mail au bloc, dans une unité de travail, clé par sorte et par commande", async () => {
    const { mails, channels } = setup();

    await channels.dispatch([DRAFT], rules(true), CONTEXT);

    expect(mails.sentNow).toEqual([]);
    expect(mails.requested).toEqual([
      {
        brand: "lfc",
        to: "equipe@lfc.fr",
        template: "staff.account-alert",
        data: {
          companyName: "Chalet des Alpes",
          ruleLabel: ALERT_KIND_TITLES[KIND],
          orderNumber: "CMD-0042",
          findings: ["Première commande de Pain de campagne"],
          accountUrl: "https://bo.lfc.fr/comptes-clients/co_1/alertes",
        },
        idempotencyKey: "mail:product.first_order:CMD-0042",
      },
    ]);
  });

  it("canal e-mail coupé par la règle : rien n'est demandé", async () => {
    const { mails, channels } = setup();
    await channels.dispatch([DRAFT], rules(false), CONTEXT);
    expect(mails.requested).toEqual([]);
  });

  it("sans boîte d'équipe configurée : rien n'est demandé", async () => {
    const { mails, channels } = setup(null);
    await channels.dispatch([DRAFT], rules(true), CONTEXT);
    expect(mails.requested).toEqual([]);
  });

  it("une demande refusée ne remonte pas, et la cloche sonne quand même", async () => {
    const { mails, notifier, channels } = setup();
    mails.failWith = new Error("base indisponible");

    await expect(channels.dispatch([DRAFT], rules(true, true), CONTEXT)).resolves.toBeUndefined();

    expect(mails.requested).toEqual([]);
    expect(notifier.notices).toHaveLength(1);
  });
});
