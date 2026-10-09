import type { ContactMessagePayload, CustomerAudience } from "@lfd/contracts";

import { RecordingPublisher } from "../../../../../platform/events/__tests__/recording-publisher.js";
import { FixedIdGenerator } from "../../../../../platform/id/fixed-id-generator.js";
import { FixedClock } from "../../../../../platform/time/fixed-clock.js";
import { ContactMessageReceivedEvent } from "../../../domain/contact-message.events.js";
import { ContactSubject } from "../../../domain/contact-subject.js";
import {
  ContactMessageIncompleteError,
  ContactSubjectNotFoundError,
  ContactSubjectUnavailableError,
} from "../../../domain/errors/contact-errors.js";
import { SendContactMessageCommand } from "../send-contact-message.command.js";
import { SendContactMessageHandler } from "../send-contact-message.handler.js";
import { ContactSenderAudience } from "../../../domain/ports/contact-sender-audience.js";
import { MemoryMessages, MemorySubjects } from "./contact-doubles.js";

const AT = new Date(0);
const IP = "203.0.113.x";

function subject(
  overrides: Partial<Parameters<typeof ContactSubject.create>[0]> = {},
): ContactSubject {
  return ContactSubject.create({
    id: "s_pro",
    label: { fr: "Devenir client pro", en: "", it: "" },
    recipientEmail: "commercial@lfc.fr",
    position: 0,
    active: true,
    audience: "b2b",
    priority: "urgent",
    at: AT,
    ...overrides,
  });
}

const PAYLOAD: ContactMessagePayload = {
  subjectId: "s_pro",
  name: "Jean Martin",
  email: "jean@exemple.fr",
  phone: "",
  message: "Bonjour, je voudrais un tarif.",
  lfd_trap: "",
};

/** Le public déduit : `b2b` pour la société `c_active`, `b2c` sinon. */
class FixedAudiences extends ContactSenderAudience {
  readonly asked: (string | null)[] = [];
  of(companyId: string | null): Promise<CustomerAudience> {
    this.asked.push(companyId);
    return Promise.resolve(companyId === "c_active" ? "b2b" : "b2c");
  }
}

const PRO = { userId: "u1", companyId: "c_active" };

function setup(...subjects: ContactSubject[]): {
  handler: SendContactMessageHandler;
  messages: MemoryMessages;
  events: RecordingPublisher;
} {
  const messages = new MemoryMessages();
  const events = new RecordingPublisher();
  const handler = new SendContactMessageHandler(
    new MemorySubjects(...subjects),
    messages,
    new FixedIdGenerator("msg"),
    new FixedClock(AT),
    events,
    new FixedAudiences(),
  );
  return { handler, messages, events };
}

describe("SendContactMessageHandler — « Nous écrire »", () => {
  it("range le message, puis publie sa réception vers l'adresse de l'objet", async () => {
    const { handler, messages, events } = setup(subject());
    await handler.execute(new SendContactMessageCommand(PAYLOAD, PRO, IP));

    expect(messages.saved).toHaveLength(1);
    expect(messages.saved[0]?.toPersistence()).toMatchObject({
      id: "msg_000001",
      subjectLabel: "Devenir client pro",
      priority: "urgent",
      userId: "u1",
      companyId: "c_active",
    });
    expect(events.published).toHaveLength(1);
    const received = events.published[0];
    expect(received).toBeInstanceOf(ContactMessageReceivedEvent);
    expect(received).toMatchObject({ recipientEmail: "commercial@lfc.fr" });
    // Pas journalisé : la charge porterait des données qui s'anonymisent.
    expect(events.traced).toHaveLength(0);
  });

  it("fige la priorité de l'objet : la changer ensuite ne requalifie pas le message", async () => {
    const pro = subject();
    const { handler, messages } = setup(pro);
    await handler.execute(new SendContactMessageCommand(PAYLOAD, PRO, IP));
    pro.revise(
      {
        label: { fr: "Devenir client pro", en: "", it: "" },
        recipientEmail: "commercial@lfc.fr",
        position: 0,
        active: true,
        audience: "b2b",
        priority: "low",
      },
      AT,
    );
    expect(messages.saved[0]?.toPersistence().priority).toBe("urgent");
  });

  it("un client connecté : sa personne et sa société sont rangées avec le message", async () => {
    const { handler, messages } = setup(subject());
    await handler.execute(new SendContactMessageCommand(PAYLOAD, PRO, IP));
    expect(messages.saved[0]?.toPersistence()).toMatchObject({
      userId: "u1",
      companyId: "c_active",
      audience: "b2b",
    });
  });

  it("champ piège rempli : accepté en apparence, rien rangé ni publié", async () => {
    const { handler, messages, events } = setup(subject());
    await expect(
      handler.execute(new SendContactMessageCommand({ ...PAYLOAD, lfd_trap: "spam" }, null, IP)),
    ).resolves.toBeUndefined();
    expect(messages.saved).toHaveLength(0);
    expect(events.published).toHaveLength(0);
  });

  it("un humain rapide n'est plus écarté : aucun délai minimal", async () => {
    // Régression (revue du 2026-10-09) : le délai déclaré par le client faisait
    // perdre en silence le message d'un client connecté, pré-rempli.
    const { handler, messages } = setup(subject());
    await handler.execute(new SendContactMessageCommand(PAYLOAD, PRO, IP));
    expect(messages.saved).toHaveLength(1);
  });

  it("le piège passe AVANT l'objet : un robot n'apprend pas qu'un objet n'existe pas", async () => {
    const { handler } = setup();
    await expect(
      handler.execute(new SendContactMessageCommand({ ...PAYLOAD, lfd_trap: "x" }, null, IP)),
    ).resolves.toBeUndefined();
  });

  it("refuse un objet inconnu", async () => {
    const { handler } = setup();
    await expect(handler.execute(new SendContactMessageCommand(PAYLOAD, PRO, IP))).rejects.toThrow(
      ContactSubjectNotFoundError,
    );
  });

  it("le public se déduit : un visiteur est `b2c`, un objet pro lui est refusé", async () => {
    const { handler, messages } = setup(subject());
    await expect(handler.execute(new SendContactMessageCommand(PAYLOAD, null, IP))).rejects.toThrow(
      ContactSubjectUnavailableError,
    );
    expect(messages.saved).toHaveLength(0);
  });

  it("un client connecté hors société active est `b2c` : l'objet pro lui est refusé", async () => {
    const { handler } = setup(subject());
    await expect(
      handler.execute(
        new SendContactMessageCommand(PAYLOAD, { userId: "u2", companyId: null }, IP),
      ),
    ).rejects.toThrow(ContactSubjectUnavailableError);
  });

  it("refuse un objet désactivé, ou archivé", async () => {
    const archived = subject({ id: "s_old" });
    archived.archive(AT);
    const { handler } = setup(subject({ active: false }), archived);
    await expect(handler.execute(new SendContactMessageCommand(PAYLOAD, PRO, IP))).rejects.toThrow(
      ContactSubjectUnavailableError,
    );
    await expect(
      handler.execute(new SendContactMessageCommand({ ...PAYLOAD, subjectId: "s_old" }, PRO, IP)),
    ).rejects.toThrow(ContactSubjectUnavailableError);
  });

  it("refuse un message vide : rien rangé, rien publié", async () => {
    const { handler, messages, events } = setup(subject());
    await expect(
      handler.execute(new SendContactMessageCommand({ ...PAYLOAD, message: "  " }, PRO, IP)),
    ).rejects.toThrow(ContactMessageIncompleteError);
    expect(messages.saved).toHaveLength(0);
    expect(events.published).toHaveLength(0);
  });
});
