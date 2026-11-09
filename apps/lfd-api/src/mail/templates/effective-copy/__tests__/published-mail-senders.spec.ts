import type { MailSenderIdentity } from "@lfd/mail-blocks";

import { senderEntryFor, type PublishedMailSendersByNature } from "../published-mail-senders.js";

const SERVICE: MailSenderIdentity = {
  senderName: "La Folie Coffee",
  fromAddress: "bonjour@lfc.test",
  replyToAddress: "contact@lfc.test",
};
const OFFERS: MailSenderIdentity = { ...SERVICE, fromAddress: "offres@news.lfc.test" };

describe("senderEntryFor (U5)", () => {
  it("un e-mail marketing part sous l'identité marketing de son espace", () => {
    const senders: PublishedMailSendersByNature = {
      transactional: { lfc: { kind: "servable", identity: SERVICE } },
      marketing: { lfc: { kind: "servable", identity: OFFERS } },
    };
    expect(senderEntryFor(senders, "lfc", "marketing")).toEqual({
      kind: "servable",
      identity: OFFERS,
    });
    expect(senderEntryFor(senders, "lfc", "transactional")).toEqual({
      kind: "servable",
      identity: SERVICE,
    });
  });

  /** Le sous-domaine marketing est un geste DNS pas encore fait : les offres partent du service. */
  it("tant que l'identité marketing n'est pas réglée, il part sous la transactionnelle", () => {
    const senders: PublishedMailSendersByNature = {
      transactional: { lfc: { kind: "servable", identity: SERVICE } },
      marketing: {},
    };
    expect(senderEntryFor(senders, "lfc", "marketing")).toEqual({
      kind: "servable",
      identity: SERVICE,
    });
  });

  it("une identité marketing illisible ne se replie pas en silence sur la transactionnelle", () => {
    const senders: PublishedMailSendersByNature = {
      transactional: { lfc: { kind: "servable", identity: SERVICE } },
      marketing: { lfc: { kind: "unreadable" } },
    };
    expect(senderEntryFor(senders, "lfc", "marketing")).toEqual({ kind: "unreadable" });
  });

  it("une identité marketing ne signe jamais un e-mail transactionnel", () => {
    const senders: PublishedMailSendersByNature = {
      transactional: {},
      marketing: { lfc: { kind: "servable", identity: OFFERS } },
    };
    expect(senderEntryFor(senders, "lfc", "transactional")).toBeUndefined();
  });
});
