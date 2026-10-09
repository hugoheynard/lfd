import { DirectUnitOfWork } from "../../../../../platform/database/__tests__/direct-unit-of-work.js";
import { RecordingPublisher } from "../../../../../platform/events/__tests__/recording-publisher.js";
import { FixedClock } from "../../../../../platform/time/fixed-clock.js";
import { ContactMessage } from "../../../domain/contact-message.js";
import {
  ContactMessageAlreadyHandledError,
  ContactMessageNotFoundError,
} from "../../../domain/errors/contact-errors.js";
import { MarkContactMessageHandledCommand } from "../mark-contact-message-handled.command.js";
import { MarkContactMessageHandledHandler } from "../mark-contact-message-handled.handler.js";
import { Directory, MemoryMessages } from "./contact-doubles.js";

const AT = new Date(0);
const LATER = new Date(60_000);

function received(): ContactMessage {
  return ContactMessage.receive({
    id: "m1",
    subject: { id: "s1", labelFr: "Devenir client pro", priority: "medium" },
    audience: "b2c",
    author: { name: "Jean", email: "jean@exemple.fr", phone: "" },
    body: "Bonjour",
    userId: null,
    companyId: null,
    at: AT,
  });
}

function handler(
  messages: MemoryMessages,
  events: RecordingPublisher,
): MarkContactMessageHandledHandler {
  return new MarkContactMessageHandledHandler(
    messages,
    new Directory({ name: "Camille Durand", role: "admin" }),
    new FixedClock(LATER),
    events,
    new DirectUnitOfWork(),
  );
}

describe("MarkContactMessageHandledHandler", () => {
  it("charge, marque traité avec l'auteur figé, enregistre, journalise", async () => {
    const messages = new MemoryMessages(received());
    const events = new RecordingPublisher();
    await handler(messages, events).execute(new MarkContactMessageHandledCommand("m1", "staff_1"));

    expect(messages.saved[0]?.toPersistence().handling).toEqual({
      at: LATER,
      by: { staffUserId: "staff_1", name: "Camille Durand", role: "admin" },
    });
    expect(events.factTypes()).toEqual(["contact_message.handled"]);
  });

  it("refuse un second traitement : rien enregistré, rien journalisé", async () => {
    const message = received();
    message.markHandled({ staffUserId: "staff_2", name: "Léa", role: "commercial" }, AT);
    const messages = new MemoryMessages(message);
    const events = new RecordingPublisher();
    await expect(
      handler(messages, events).execute(new MarkContactMessageHandledCommand("m1", "staff_1")),
    ).rejects.toThrow(ContactMessageAlreadyHandledError);
    expect(messages.saved).toHaveLength(0);
    expect(events.traced).toHaveLength(0);
  });

  it("refuse un message inconnu", async () => {
    await expect(
      handler(new MemoryMessages(), new RecordingPublisher()).execute(
        new MarkContactMessageHandledCommand("m404", "staff_1"),
      ),
    ).rejects.toThrow(ContactMessageNotFoundError);
  });
});
