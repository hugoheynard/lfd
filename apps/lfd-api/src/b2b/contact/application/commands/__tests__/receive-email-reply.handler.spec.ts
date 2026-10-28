import type { ReceivedMail } from "@lfd/mailer";

import { RecordingPublisher } from "../../../../../platform/events/__tests__/recording-publisher.js";
import { FixedIdGenerator } from "../../../../../platform/id/fixed-id-generator.js";
import { InboundMailReader } from "../../../../../platform/mailer/inbound/inbound-mail.reader.js";
import { FixedClock } from "../../../../../platform/time/fixed-clock.js";
import { CustomerEmailReplyReceived } from "../../../domain/email-reply.events.js";
import { SystemReasonMissingError } from "../../../domain/errors/email-reply-errors.js";
import {
  EmailSenderAccountReader,
  type PresumedAccount,
} from "../../../domain/ports/email-sender-account.reader.js";
import {
  PresumedOrderReader,
  type PresumedOrder,
} from "../../../domain/ports/presumed-order.reader.js";
import { RecentEmailRepliesReader } from "../../../domain/ports/recent-email-replies.reader.js";
import { RequestReason } from "../../../domain/request-reason.js";
import { ReceiveEmailReplyCommand } from "../receive-email-reply.command.js";
import { ReceiveEmailReplyHandler } from "../receive-email-reply.handler.js";
import { FixedAudiences, MemoryReasons, MemoryRequests } from "./contact-doubles.js";

/** Un instant sans calendrier : seule l'heure glissante compte, relative à lui. */
const NOW = new Date(10 * 60 * 60 * 1000);
const HOUR_MS = 60 * 60 * 1000;

const MAIL: ReceivedMail = {
  id: "in_1",
  from: "Jean Martin <jean@exemple.fr>",
  subject: "Re: Votre commande ORD-12 est prête",
  text: "Merci !\n> Votre commande est prête",
  html: null,
  headers: {},
  attachments: [],
};

/** Resend doublé : le message tel qu'il le rend, ou une panne. */
class ScriptedMails extends InboundMailReader {
  constructor(private readonly mail: ReceivedMail | Error) {
    super();
  }

  read(): Promise<ReceivedMail> {
    return this.mail instanceof Error ? Promise.reject(this.mail) : Promise.resolve(this.mail);
  }
}

/** Le compte de chaque adresse ; `ambiguous` n'en désigne aucun, comme l'adaptateur. */
class Accounts extends EmailSenderAccountReader {
  constructor(private readonly known: Readonly<Record<string, string>>) {
    super();
  }

  presumedOf(email: string): Promise<PresumedAccount | null> {
    const userId = this.known[email];
    return Promise.resolve(userId === undefined ? null : { userId });
  }
}

/** Les commandes visibles, par numéro puis par compte. */
class Orders extends PresumedOrderReader {
  readonly asked: string[] = [];

  constructor(
    private readonly visible: Readonly<Record<string, PresumedOrder & { owner: string }>>,
  ) {
    super();
  }

  visibleByNumber(number: string, userId: string): Promise<PresumedOrder | null> {
    this.asked.push(`${number}:${userId}`);
    const order = this.visible[number];
    return Promise.resolve(
      order?.owner === userId
        ? { id: order.id, number: order.number, companyId: order.companyId }
        : null,
    );
  }
}

/** Les réponses déjà rangées depuis l'instant demandé. */
class Recent extends RecentEmailRepliesReader {
  readonly since: Date[] = [];

  constructor(private readonly count: number) {
    super();
  }

  countFromSince(_email: string, since: Date): Promise<number> {
    this.since.push(since);
    return Promise.resolve(this.count);
  }
}

function systemReason(): RequestReason {
  return RequestReason.rehydrate({
    id: "system_email_reply",
    kind: "email_reply",
    label: { fr: "Réponse à un e-mail", en: "", it: "" },
    recipientEmail: "reponses@reponses.lafoliecoffee.info",
    position: 0,
    active: true,
    audience: "both",
    priority: "medium",
    archivedAt: null,
    createdAt: NOW,
    updatedAt: NOW,
  });
}

interface Setup {
  readonly mail?: ReceivedMail | Error;
  readonly recent?: number;
  readonly accounts?: Readonly<Record<string, string>>;
  readonly reasons?: MemoryReasons;
  readonly requests?: MemoryRequests;
}

function setup(options: Setup = {}) {
  const requests = options.requests ?? new MemoryRequests();
  const events = new RecordingPublisher();
  const orders = new Orders({
    "ORD-12": { id: "o12", number: "ORD-12", companyId: "c_active", owner: "u1" },
  });
  const recent = new Recent(options.recent ?? 0);
  const handler = new ReceiveEmailReplyHandler(
    new ScriptedMails(options.mail ?? MAIL),
    options.reasons ?? new MemoryReasons(systemReason()),
    requests,
    recent,
    new Accounts(options.accounts ?? { "jean@exemple.fr": "u1" }),
    orders,
    new FixedAudiences(),
    new FixedIdGenerator("req"),
    new FixedClock(NOW),
    events,
  );
  const receive = () => handler.execute(new ReceiveEmailReplyCommand("in_1"));
  return { receive, requests, events, orders, recent };
}

describe("ReceiveEmailReplyHandler — une réponse d'un client à un e-mail", () => {
  it("range une demande `email_reply`, compte, société et commande présumés", async () => {
    const { receive, requests, events } = setup();
    await receive();

    expect(requests.saved).toHaveLength(1);
    expect(requests.saved[0]?.toPersistence()).toMatchObject({
      id: "req_000001",
      reason: { id: "system_email_reply", labelFr: "Réponse à un e-mail" },
      audience: "b2b",
      author: { name: "Jean Martin", email: "jean@exemple.fr" },
      body: "Merci !",
      userId: "u1",
      companyId: "c_active",
      receivedAt: NOW,
      details: { kind: "email_reply", messageId: "in_1", order: { id: "o12", number: "ORD-12" } },
    });
    expect(events.published).toHaveLength(1);
    expect(events.published[0]).toBeInstanceOf(CustomerEmailReplyReceived);
  });

  it("compte les réponses de la même adresse sur l'heure glissante", async () => {
    const { receive, recent } = setup();
    await receive();
    expect(recent.since).toEqual([new Date(NOW.getTime() - HOUR_MS)]);
  });

  it("idempotente : un rejeu du même message ne range rien et ne sonne pas", async () => {
    const requests = new MemoryRequests();
    const first = setup({ requests });
    await first.receive();
    const again = setup({ requests });
    await again.receive();

    expect(requests.saved).toHaveLength(1);
    expect(again.events.published).toEqual([]);
  });

  it("une adresse inconnue ou ambiguë ne rattache à personne, ni à aucune commande", async () => {
    const { receive, requests, orders } = setup({ accounts: {} });
    await receive();

    expect(requests.saved[0]?.toPersistence()).toMatchObject({
      userId: null,
      companyId: null,
      audience: "b2c",
      details: { order: null },
    });
    expect(orders.asked).toEqual([]);
  });

  it("une commande citée que ce compte ne voit pas n'est pas rattachée", async () => {
    const { receive, requests, orders } = setup({ accounts: { "jean@exemple.fr": "u_autre" } });
    await receive();

    expect(orders.asked).toEqual(["ORD-12:u_autre"]);
    expect(requests.saved[0]?.toPersistence()).toMatchObject({
      userId: "u_autre",
      companyId: null,
      details: { order: null },
    });
  });

  it.each([
    ["une réponse automatique", { ...MAIL, headers: { "Auto-Submitted": "auto-replied" } }],
    ["une liste de diffusion", { ...MAIL, headers: { Precedence: "list" } }],
    ["une adresse illisible", { ...MAIL, from: "Jean Martin" }],
  ])("écarte %s : rien rangé, rien publié", async (_label, mail) => {
    const { receive, requests, events } = setup({ mail });
    await receive();

    expect(requests.saved).toEqual([]);
    expect(events.published).toEqual([]);
  });

  it("au-delà de dix messages dans l'heure pour une adresse, les suivants sont écartés", async () => {
    const atLimit = setup({ recent: 10 });
    await atLimit.receive();
    expect(atLimit.requests.saved).toEqual([]);

    const below = setup({ recent: 9 });
    await below.receive();
    expect(below.requests.saved).toHaveLength(1);
  });

  it("un message illisible chez Resend remonte : le webhook échoue, Resend rejoue", async () => {
    const { receive, requests } = setup({ mail: new RangeError("Resend injoignable") });

    await expect(receive()).rejects.toThrow("Resend injoignable");
    expect(requests.saved).toEqual([]);
  });

  it("sans motif système en base, l'échec remonte plutôt que de perdre la réponse", async () => {
    const { receive } = setup({ reasons: new MemoryReasons() });
    await expect(receive()).rejects.toBeInstanceOf(SystemReasonMissingError);
  });

  it("dit à la cloche combien de réponses la même adresse a déjà envoyées dans l'heure", async () => {
    const { receive, events } = setup({ recent: 3 });
    await receive();

    expect(events.published[0]).toMatchObject({ earlierFromSenderWithinHour: 3 });
  });
});
