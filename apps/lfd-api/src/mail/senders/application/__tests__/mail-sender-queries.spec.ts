import { AppConfig, type MailerConfig } from "../../../../platform/config/app-config.js";
import {
  MailSenderNatureNotOfferedError,
  SendingDomainsUnavailableError,
} from "../../domain/mail-sender-errors.js";
import { GetMailSenderHandler } from "../queries/get-mail-sender.handler.js";
import { GetMailSenderQuery } from "../queries/get-mail-sender.query.js";
import {
  FixedSendingDomains,
  InMemoryMailSenderReader,
  InMemoryMailSenders,
  senderKey,
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
    const view = await handler().query.execute(new GetMailSenderQuery("lfd", "transactional"));
    expect(view).toEqual({
      space: "lfd",
      nature: "transactional",
      identity: null,
      fallback: {
        fromAddress: "no-reply@lafoliecoffee.info",
        replyToAddress: "contact@lafoliecoffee.info",
        source: "configuration",
      },
      revision: 0,
      changed: null,
      verifiedDomains: ["lafoliecoffee.info"],
    });
  });

  it("rend l'identité rangée et son auteur", async () => {
    const h = handler();
    const identity = { senderName: "LFD", fromAddress: "a@lfd.test", replyToAddress: null };
    h.senders.rows.set(senderKey("lfd", "transactional"), {
      space: "lfd",
      nature: "transactional",
      revision: 2,
      identity,
      changed: { at: new Date(0), staffId: "fiche-colette" },
    });
    const view = await h.query.execute(new GetMailSenderQuery("lfd", "transactional"));
    expect(view).toMatchObject({
      identity,
      revision: 2,
      changed: { at: "1970-01-01T00:00:00.000Z", staffId: "fiche-colette" },
    });
  });

  it("des domaines illisibles n'empêchent pas d'ouvrir la page", async () => {
    const view = await handler(new SendingDomainsUnavailableError("pas de clé.")).query.execute(
      new GetMailSenderQuery("lfc", "transactional"),
    );
    expect(view.verifiedDomains).toBeNull();
  });

  /** Lot U5 : le sous-domaine marketing n'est pas encore posé — l'écran dit d'où partent les offres. */
  it("une identité marketing pas encore réglée part de l'identité transactionnelle de l'espace", async () => {
    const h = handler();
    h.senders.rows.set(senderKey("lfc", "transactional"), {
      space: "lfc",
      nature: "transactional",
      revision: 1,
      identity: {
        senderName: "La Folie Coffee",
        fromAddress: "bonjour@lafoliecoffee.info",
        replyToAddress: "contact@lafoliecoffee.info",
      },
      changed: { at: new Date(0), staffId: "fiche-colette" },
    });
    const view = await h.query.execute(new GetMailSenderQuery("lfc", "marketing"));
    expect(view).toMatchObject({
      nature: "marketing",
      identity: null,
      revision: 0,
      fallback: {
        fromAddress: '"La Folie Coffee" <bonjour@lafoliecoffee.info>',
        replyToAddress: "contact@lafoliecoffee.info",
        source: "transactional",
      },
    });
  });

  it("sans transactionnelle non plus, la marketing part de la configuration", async () => {
    const view = await handler().query.execute(new GetMailSenderQuery("lfc", "marketing"));
    expect(view.fallback).toEqual({
      fromAddress: "no-reply@lafoliecoffee.info",
      replyToAddress: "contact@lafoliecoffee.info",
      source: "configuration",
    });
  });

  it("l'espace de l'équipe n'a pas d'identité marketing à lire", async () => {
    await expect(
      handler().query.execute(new GetMailSenderQuery("lfd", "marketing")),
    ).rejects.toThrow(MailSenderNatureNotOfferedError);
  });
});
