import { createHmac } from "node:crypto";

import type { MailerConfig } from "../../../../platform/config/app-config.js";
import { FixedIdGenerator } from "../../../../platform/id/fixed-id-generator.js";
import {
  InboundMailSink,
  type InboundMailNotice,
} from "../../../../platform/mailer/inbound/inbound-mail.sink.js";
import { InboundSinkMissingError } from "../../../../platform/mailer/inbound/inbound-sink-missing.error.js";
import {
  MailJournal,
  type MailOutcome,
  type MailSendRecord,
} from "../../../../platform/mailer/journal/mail-journal.port.js";
import type { SvixHeaders } from "../../../../platform/mailer/webhook/svix-signature.js";
import { FixedClock } from "../../../../platform/time/fixed-clock.js";
import { mailScene } from "../../../requests/application/__tests__/mail-doubles.js";
import type { MailDeliveryEvent } from "../../domain/entities/mail-delivery-event.js";
import { MailDeliveryEventLog } from "../../domain/ports/mail-delivery-event.log.js";
import { ReceiveResendEventCommand } from "../receive-resend-event.command.js";
import { ReceiveResendEventHandler } from "../receive-resend-event.handler.js";

const SECRET = "whsec_MfKQ9r8GKYqrTwjUPD8ILPZIo2LaLaSw";
// L'horloge est figée sur cette même valeur : la date n'est comparée qu'à la fixture.
const NOW = new Date(1_755_600_000_000);
/** Le texte du fournisseur cite l'adresse : il ne doit être rangé nulle part. */
const PROVIDER_TEXT = "550 5.1.1 cliente@exemple.test: Recipient address rejected";

function event(type: string, extra: object = {}): string {
  return JSON.stringify({
    type,
    created_at: new Date(NOW.getTime() - 1000).toISOString(),
    data: { email_id: "re_1", ...extra },
  });
}

const BODY = event("email.bounced", {
  bounce: { message: PROVIDER_TEXT, type: "Permanent", subType: "General" },
});
const DELIVERED = event("email.delivered");

/** Signe comme Svix le ferait — sinon le test ne prouve que sa propre logique. */
function signed(body = BODY, id = "msg_2AbC"): SvixHeaders {
  const timestamp = String(Math.floor(NOW.getTime() / 1000));
  const key = Buffer.from(SECRET.replace("whsec_", ""), "base64");
  const mac = createHmac("sha256", key).update(`${id}.${timestamp}.${body}`).digest("base64");
  return { id, timestamp, signature: `v1,${mac}` };
}

function config(webhookSecret: string | null): { mailerConfig(): MailerConfig } {
  return {
    mailerConfig: () => ({
      apiKey: null,
      fromAddress: "atelier@example.test",
      replyTo: null,
      staffInbox: null,
      webhookSecret,
    }),
  };
}

/** Le journal `ops.mail_send`, toujours écrit en T1 (décision 5). */
class JournalDouble extends MailJournal {
  readonly outcomes: MailOutcome[] = [];
  recordSend(_record: MailSendRecord): Promise<void> {
    return Promise.resolve();
  }
  recordOutcome(outcome: MailOutcome): Promise<void> {
    this.outcomes.push(outcome);
    return Promise.resolve();
  }
  rememberEvent(): Promise<boolean> {
    return Promise.resolve(true);
  }
}

/** La table `mail_delivery_event` : l'unicité du `svixId`, et ce qui y a été rangé. */
class EventLogDouble extends MailDeliveryEventLog {
  readonly stored: MailDeliveryEvent[] = [];
  constructor(private readonly onStore: (event: MailDeliveryEvent) => void) {
    super();
  }
  addIfAbsent(event: MailDeliveryEvent): Promise<boolean> {
    if (this.stored.some((one) => one.snapshot().svixId === event.snapshot().svixId)) {
      return Promise.resolve(false);
    }
    this.stored.push(event);
    this.onStore(event);
    return Promise.resolve(true);
  }
}

/** Le rangement des e-mails reçus : il note, ou refuse tant que `failures` > 0. */
class SinkDouble extends InboundMailSink {
  readonly accepted: InboundMailNotice[] = [];
  failures = 0;

  accept(notice: InboundMailNotice): Promise<void> {
    if (this.failures > 0) {
      this.failures -= 1;
      return Promise.reject(new RangeError("base indisponible"));
    }
    this.accepted.push(notice);
    return Promise.resolve();
  }
}

/** Le bloc monté sur ses doubles, et le webhook branché dessus. */
function world(options: { secret?: string | null; sink?: InboundMailSink | null } = {}) {
  const scene = mailScene();
  const journal = new JournalDouble();
  const log = new EventLogDouble((stored) =>
    scene.deliveries.record(stored.providerId, stored.report()),
  );
  const receive = new ReceiveResendEventHandler(
    config(options.secret === undefined ? SECRET : options.secret),
    log,
    scene.applier,
    journal,
    new FixedIdGenerator("evt"),
    new FixedClock(NOW),
    options.sink ?? null,
  );
  const post = (body: string, id?: string) =>
    receive.execute(new ReceiveResendEventCommand(signed(body, id), body));
  return { scene, journal, log, receive, post };
}

const SUSPENDED = {
  template: "staff.access-suspended",
  to: "Equipe@Example.test",
  data: { firstName: "Ada" },
  idempotencyKey: "staff.suspended:s1",
} as const;

/** Une demande envoyée : le double du fournisseur rend `re_1`. */
async function sentMail(scene: ReturnType<typeof mailScene>): Promise<void> {
  await scene.port.sendAndAwaitReceipt(SUSPENDED);
}

const requestOf = (scene: ReturnType<typeof mailScene>) =>
  scene.requests.rows.get(SUSPENDED.idempotencyKey)?.snapshot();

const RECEIVED = '{"type":"email.received","data":{"email_id":"in_1","from":"x@y.fr"}}';

describe("ReceiveResendEventHandler — le mur", () => {
  it("refuse sans rien ranger quand la signature ne prouve rien", async () => {
    const { log, receive } = world();
    const forged = { ...signed(), signature: "v1,Zm9yZ2Vk" };

    const receipt = await receive.execute(new ReceiveResendEventCommand(forged, BODY));

    expect(receipt).toBe("refused");
    expect(log.stored).toEqual([]);
  });

  it("refuse tout quand le secret n'est pas configuré", async () => {
    const { post, log } = world({ secret: null });

    expect(await post(BODY)).toBe("refused");
    expect(log.stored).toEqual([]);
  });
});

describe("ReceiveResendEventHandler — ranger, puis appliquer", () => {
  it("range le retour et l'applique à la demande connue, avec son genre", async () => {
    const { scene, journal, log, post } = world();
    await sentMail(scene);

    expect(await post(BODY)).toBe("accepted");

    expect(log.stored).toHaveLength(1);
    expect(requestOf(scene)).toMatchObject({
      status: "sent",
      delivery: "bounced",
      deliveryKind: "Permanent/General",
      deliveryAt: new Date(NOW.getTime() - 1000),
    });
    // `ops.mail_send` reste écrite en T1 (décision 5) — avec le genre, plus le texte.
    expect(journal.outcomes).toEqual([
      {
        providerId: "re_1",
        status: "bounced",
        detail: "Permanent/General",
        at: new Date(NOW.getTime() - 1000),
      },
    ]);
  });

  it("ne range jamais le texte du fournisseur (`bounce.message`)", async () => {
    const { scene, journal, log, post } = world();
    await sentMail(scene);

    await post(BODY);

    const everything = JSON.stringify([log.stored.map((one) => one.snapshot()), journal.outcomes]);
    expect(everything).not.toContain("exemple.test");
    expect(everything).not.toContain("Recipient");
    expect(JSON.stringify(requestOf(scene))).not.toContain("Recipient");
  });

  /** Bloquant 1 de vitruve : un rebond arrivé avant l'écriture de l'envoi était perdu. */
  it("un `bounced` reçu AVANT que l'envoi soit rangé s'applique à sa pose", async () => {
    const { scene, log, post } = world();

    expect(await post(BODY)).toBe("accepted");
    expect(log.stored).toHaveLength(1);
    expect(scene.requests.rows.size).toBe(0);

    await sentMail(scene);

    expect(requestOf(scene)).toMatchObject({ providerId: "re_1", delivery: "bounced" });
  });

  it("un webhook rejoué n'est rangé et compté qu'une fois", async () => {
    const { scene, journal, log, post } = world();
    await sentMail(scene);

    await post(BODY, "msg_same");
    expect(await post(BODY, "msg_same")).toBe("accepted");

    expect(log.stored).toHaveLength(1);
    expect(journal.outcomes).toHaveLength(1);
  });

  it("un `delivered` arrivé après un `bounced` ne l'efface pas", async () => {
    const { scene, log, post } = world();
    await sentMail(scene);

    await post(BODY, "msg_1");
    await post(DELIVERED, "msg_2");

    expect(log.stored).toHaveLength(2);
    expect(requestOf(scene)).toMatchObject({
      delivery: "bounced",
      deliveryKind: "Permanent/General",
    });
  });

  it.each([
    ["un JSON illisible", "pas du json"],
    ["un type inconnu", event("email.whatever")],
    ["sans identifiant", JSON.stringify({ type: "email.bounced", data: {} })],
    ["`email.sent`, qui redit l'acceptation", event("email.sent")],
    ["`email.opened`, qui ne nous regarde pas", event("email.opened")],
    ["`email.clicked`", event("email.clicked")],
  ])("acquitte %s sans rien ranger ni écrire", async (_label, body) => {
    const { journal, log, post } = world();

    expect(await post(body)).toBe("accepted");

    expect(log.stored).toEqual([]);
    expect(journal.outcomes).toEqual([]);
  });

  it("un retour sans demande connue est rangé et attend", async () => {
    const { scene, log, post } = world();

    expect(await post(DELIVERED)).toBe("accepted");

    expect(log.stored.map((one) => one.snapshot().providerId)).toEqual(["re_1"]);
    expect(scene.requests.rows.size).toBe(0);
  });
});

describe("ReceiveResendEventHandler — un e-mail REÇU (`email.received`)", () => {
  it("est remis au rangement, sans rien ranger au suivi", async () => {
    const sink = new SinkDouble();
    const { log, post } = world({ sink });

    expect(await post(RECEIVED)).toBe("accepted");

    expect(sink.accepted).toEqual([{ emailId: "in_1" }]);
    expect(log.stored).toEqual([]);
  });

  /**
   * Régression prévenue (vitruve, 2026-10-28) : le `svix-id` consommé AVANT le
   * rangement faisait ignorer le rejeu d'un rangement échoué — la réponse du
   * client était perdue.
   */
  it("un rangement qui échoue remonte, et le rejeu de Resend range le message", async () => {
    const sink = new SinkDouble();
    sink.failures = 1;
    const { post } = world({ sink });

    await expect(post(RECEIVED)).rejects.toThrow("base indisponible");
    await post(RECEIVED);

    expect(sink.accepted).toEqual([{ emailId: "in_1" }]);
  });

  it("sans rangement relié, il échoue plutôt que d'être acquitté et perdu", async () => {
    await expect(world().post(RECEIVED)).rejects.toBeInstanceOf(InboundSinkMissingError);
  });
});
