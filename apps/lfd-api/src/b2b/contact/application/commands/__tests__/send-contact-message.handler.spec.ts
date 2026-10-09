import { CONTACT_MIN_FILL_MS, type ContactMessagePayload } from "@lfd/contracts";

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
import { MemoryMessages, MemorySubjects } from "./contact-doubles.js";

const AT = new Date(0);

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
  audience: "b2b",
  name: "Jean Martin",
  email: "jean@exemple.fr",
  phone: "",
  message: "Bonjour, je voudrais un tarif.",
  website: "",
  elapsedMs: CONTACT_MIN_FILL_MS + 5_000,
};

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
  );
  return { handler, messages, events };
}

describe("SendContactMessageHandler — « Nous écrire »", () => {
  it("range le message, puis publie sa réception vers l'adresse de l'objet", async () => {
    const { handler, messages, events } = setup(subject());
    await handler.execute(new SendContactMessageCommand(PAYLOAD, null));

    expect(messages.saved).toHaveLength(1);
    expect(messages.saved[0]?.toPersistence()).toMatchObject({
      id: "msg_000001",
      subjectLabel: "Devenir client pro",
      priority: "urgent",
      userId: null,
      companyId: null,
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
    await handler.execute(new SendContactMessageCommand(PAYLOAD, null));
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
    await handler.execute(
      new SendContactMessageCommand(PAYLOAD, { userId: "u1", companyId: "c1" }),
    );
    expect(messages.saved[0]?.toPersistence()).toMatchObject({ userId: "u1", companyId: "c1" });
  });

  it("champ piège rempli : accepté en apparence, rien rangé ni publié", async () => {
    const { handler, messages, events } = setup(subject());
    await expect(
      handler.execute(new SendContactMessageCommand({ ...PAYLOAD, website: "spam" }, null)),
    ).resolves.toBeUndefined();
    expect(messages.saved).toHaveLength(0);
    expect(events.published).toHaveLength(0);
  });

  it("saisie trop rapide : accepté en apparence, rien rangé ni publié", async () => {
    const { handler, messages, events } = setup(subject());
    await handler.execute(
      new SendContactMessageCommand({ ...PAYLOAD, elapsedMs: CONTACT_MIN_FILL_MS - 1 }, null),
    );
    expect(messages.saved).toHaveLength(0);
    expect(events.published).toHaveLength(0);
  });

  it("le piège passe AVANT l'objet : un robot n'apprend pas qu'un objet n'existe pas", async () => {
    const { handler } = setup();
    await expect(
      handler.execute(new SendContactMessageCommand({ ...PAYLOAD, website: "x" }, null)),
    ).resolves.toBeUndefined();
  });

  it("refuse un objet inconnu", async () => {
    const { handler } = setup();
    await expect(handler.execute(new SendContactMessageCommand(PAYLOAD, null))).rejects.toThrow(
      ContactSubjectNotFoundError,
    );
  });

  it("refuse un objet d'un autre public", async () => {
    const { handler, messages } = setup(subject());
    await expect(
      handler.execute(new SendContactMessageCommand({ ...PAYLOAD, audience: "b2c" }, null)),
    ).rejects.toThrow(ContactSubjectUnavailableError);
    expect(messages.saved).toHaveLength(0);
  });

  it("refuse un objet désactivé, ou archivé", async () => {
    const archived = subject({ id: "s_old" });
    archived.archive(AT);
    const { handler } = setup(subject({ active: false }), archived);
    await expect(handler.execute(new SendContactMessageCommand(PAYLOAD, null))).rejects.toThrow(
      ContactSubjectUnavailableError,
    );
    await expect(
      handler.execute(new SendContactMessageCommand({ ...PAYLOAD, subjectId: "s_old" }, null)),
    ).rejects.toThrow(ContactSubjectUnavailableError);
  });

  it("refuse un message vide : rien rangé, rien publié", async () => {
    const { handler, messages, events } = setup(subject());
    await expect(
      handler.execute(new SendContactMessageCommand({ ...PAYLOAD, message: "  " }, null)),
    ).rejects.toThrow(ContactMessageIncompleteError);
    expect(messages.saved).toHaveLength(0);
    expect(events.published).toHaveLength(0);
  });
});
