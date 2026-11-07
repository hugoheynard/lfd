import { AppConfig, type MailerConfig } from "../../../../platform/config/app-config.js";
import { SendingDomainsUnavailableError } from "../../domain/mail-sender-errors.js";
import { GetMailSenderHandler } from "../queries/get-mail-sender.handler.js";
import { GetMailSenderQuery } from "../queries/get-mail-sender.query.js";
import {
  FixedSendingDomains,
  InMemoryMailSenderReader,
  InMemoryMailSenders,
} from "./mail-sender-doubles.js";

/** La vraie configuration, dont seuls les réglages d'envoi sont fixés. */
class Settings extends AppConfig {
  override mailerConfig(): MailerConfig {
    return {
      ...super.mailerConfig(),
      fromAddress: "no-reply@lafoliecoffee.info",
      replyTo: "contact@lafoliecoffee.info",
    };
  }
}

function handler(domains: readonly string[] | Error = ["lafoliecoffee.info"]) {
  const senders = new InMemoryMailSenders();
  return {
    senders,
    query: new GetMailSenderHandler(
      new InMemoryMailSenderReader(senders),
      new FixedSendingDomains(domains),
      new Settings(),
    ),
  };
}

describe("GetMailSenderHandler (C3)", () => {
  it("un espace sans identité dit qu'il part sous l'identité par défaut", async () => {
    const view = await handler().query.execute(new GetMailSenderQuery("lfd"));
    expect(view).toEqual({
      space: "lfd",
      identity: null,
      fallback: {
        fromAddress: "no-reply@lafoliecoffee.info",
        replyToAddress: "contact@lafoliecoffee.info",
      },
      revision: 0,
      changed: null,
      verifiedDomains: ["lafoliecoffee.info"],
    });
  });

  it("rend l'identité rangée et son auteur", async () => {
    const h = handler();
    const identity = { senderName: "LFD", fromAddress: "a@lfd.test", replyToAddress: null };
    h.senders.rows.set("lfd", {
      space: "lfd",
      revision: 2,
      identity,
      changed: { at: new Date(0), staffId: "fiche-colette" },
    });
    const view = await h.query.execute(new GetMailSenderQuery("lfd"));
    expect(view).toMatchObject({
      identity,
      revision: 2,
      changed: { at: "1970-01-01T00:00:00.000Z", staffId: "fiche-colette" },
    });
  });

  it("des domaines illisibles n'empêchent pas d'ouvrir la page", async () => {
    const view = await handler(new SendingDomainsUnavailableError("pas de clé.")).query.execute(
      new GetMailSenderQuery("lfc"),
    );
    expect(view.verifiedDomains).toBeNull();
  });
});
