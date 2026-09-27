import { createHmac } from "node:crypto";

import type { MailerConfig } from "../../../config/app-config.js";
import { FixedClock } from "../../../time/fixed-clock.js";
import {
  MailJournal,
  type MailOutcome,
  type MailSendRecord,
} from "../../journal/mail-journal.port.js";
import { ReceiveResendEventCommand } from "../receive-resend-event.command.js";
import { ReceiveResendEventHandler } from "../receive-resend-event.handler.js";
import type { SvixHeaders } from "../svix-signature.js";

const SECRET = "whsec_MfKQ9r8GKYqrTwjUPD8ILPZIo2LaLaSw";
// L'horloge est figée sur cette même valeur : la date n'est comparée qu'à la fixture.
const NOW = new Date(1_755_600_000_000);
const BODY =
  '{"type":"email.bounced","data":{"email_id":"re_1","bounce":{"message":"boîte pleine"}}}';

/** Signe comme Svix le ferait — sinon le test ne prouve que sa propre logique. */
function signed(body = BODY): SvixHeaders {
  const timestamp = String(Math.floor(NOW.getTime() / 1000));
  const id = "msg_2AbC";
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

class JournalDouble extends MailJournal {
  readonly seen = new Set<string>();
  readonly outcomes: MailOutcome[] = [];
  recordSend(_record: MailSendRecord): Promise<void> {
    return Promise.resolve();
  }
  recordOutcome(outcome: MailOutcome): Promise<void> {
    this.outcomes.push(outcome);
    return Promise.resolve();
  }
  rememberEvent(provider: string, externalId: string): Promise<boolean> {
    const key = `${provider}:${externalId}`;
    const fresh = !this.seen.has(key);
    this.seen.add(key);
    return Promise.resolve(fresh);
  }
}

function handler(
  journal: JournalDouble,
  secret: string | null = SECRET,
): ReceiveResendEventHandler {
  return new ReceiveResendEventHandler(config(secret), journal, new FixedClock(NOW));
}

describe("ReceiveResendEventHandler", () => {
  it("note ce qu'est devenu l'e-mail quand la signature est prouvée", async () => {
    const journal = new JournalDouble();

    const receipt = await handler(journal).execute(new ReceiveResendEventCommand(signed(), BODY));

    expect(receipt).toBe("accepted");
    expect(journal.outcomes).toEqual([
      { providerId: "re_1", status: "bounced", detail: "boîte pleine", at: NOW },
    ]);
  });

  it("refuse sans rien écrire quand la signature ne prouve rien", async () => {
    const journal = new JournalDouble();
    const forged = { ...signed(), signature: "v1,Zm9yZ2Vk" };

    const receipt = await handler(journal).execute(new ReceiveResendEventCommand(forged, BODY));

    expect(receipt).toBe("refused");
    expect(journal.seen.size).toBe(0);
  });

  it("refuse tout quand le secret n'est pas configuré", async () => {
    const journal = new JournalDouble();

    const receipt = await handler(journal, null).execute(
      new ReceiveResendEventCommand(signed(), BODY),
    );

    expect(receipt).toBe("refused");
  });

  it("ne compte qu'une fois un événement que Svix réessaie", async () => {
    const journal = new JournalDouble();
    const receive = handler(journal);

    await receive.execute(new ReceiveResendEventCommand(signed(), BODY));
    const again = await receive.execute(new ReceiveResendEventCommand(signed(), BODY));

    expect(again).toBe("accepted");
    expect(journal.outcomes).toHaveLength(1);
  });

  it("acquitte un événement illisible sans le noter", async () => {
    const journal = new JournalDouble();
    const garbage = "pas du json";

    const receipt = await handler(journal).execute(
      new ReceiveResendEventCommand(signed(garbage), garbage),
    );

    expect(receipt).toBe("accepted");
    expect(journal.outcomes).toEqual([]);
  });
});
