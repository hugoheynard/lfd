import { DirectUnitOfWork } from "../../../../platform/database/__tests__/direct-unit-of-work.js";
import { RecordingPublisher } from "../../../../platform/events/__tests__/recording-publisher.js";
import { FixedIdGenerator } from "../../../../platform/id/fixed-id-generator.js";
import { FixedClock } from "../../../../platform/time/fixed-clock.js";
import { MAIL_CONSULTATIONS_PER_HOUR } from "../../domain/entities/staff-mail-consultations.js";
import {
  MailConsultationLimitReachedError,
  MailSendNotFoundError,
} from "../../domain/errors/mail-sends.errors.js";
import { RevealMailRecipientCommand } from "../commands/reveal-mail-recipient.command.js";
import { RevealMailRecipientHandler } from "../commands/reveal-mail-recipient.handler.js";
import { FixedSendSubjects, InMemoryConsultations } from "./mail-sends-doubles.js";

const NOW = new Date(Date.UTC(2026, 0, 1, 12));
const SUBJECTS = new Map([["send_1", { template: "customer.order-ready", space: "lfc" }]]);

function world() {
  const consultations = new InMemoryConsultations();
  const events = new RecordingPublisher();
  const clock = new FixedClock(NOW);
  const handler = new RevealMailRecipientHandler(
    new FixedSendSubjects(SUBJECTS),
    consultations,
    events,
    new FixedIdGenerator("rev"),
    clock,
    new DirectUnitOfWork(),
  );
  return { consultations, events, clock, handler };
}

describe("RevealMailRecipientHandler (décision 7)", () => {
  it("range la révélation et publie le fait, sans adresse", async () => {
    const w = world();

    await w.handler.execute(new RevealMailRecipientCommand("send_1", "colette"));

    expect(w.consultations.reveals).toEqual([
      { id: "rev_000001", sendId: "send_1", staffId: "colette", at: NOW },
    ]);
    const facts = w.events.traced.map((event) => event.journalFact());
    expect(facts).toEqual([
      {
        type: "mail.recipient_revealed",
        subjectType: "mail_send",
        subjectId: "send_1",
        payload: {
          subjectLabel: "customer.order-ready",
          mail: "customer.order-ready",
          space: "lfc",
        },
      },
    ]);
    expect(JSON.stringify(facts)).not.toContain("@");
  });

  it("404 nommé pour un envoi inconnu : rien de rangé, rien de publié", async () => {
    const w = world();
    await expect(
      w.handler.execute(new RevealMailRecipientCommand("absent", "colette")),
    ).rejects.toThrow(MailSendNotFoundError);
    expect(w.consultations.reveals).toEqual([]);
    expect(w.events.factTypes()).toEqual([]);
  });

  it("refuse au-delà de 30 consultations dans l'heure, recherches comprises", async () => {
    const w = world();
    w.consultations.searches.set("colette", 10);
    for (let index = 0; index < MAIL_CONSULTATIONS_PER_HOUR - 10; index += 1) {
      await w.handler.execute(new RevealMailRecipientCommand("send_1", "colette"));
    }

    await expect(
      w.handler.execute(new RevealMailRecipientCommand("send_1", "colette")),
    ).rejects.toThrow(MailConsultationLimitReachedError);
    expect(w.consultations.reveals).toHaveLength(MAIL_CONSULTATIONS_PER_HOUR - 10);
    expect(w.events.factTypes()).toHaveLength(MAIL_CONSULTATIONS_PER_HOUR - 10);
  });

  it("le plafond est par personne, et glisse avec l'heure", async () => {
    const w = world();
    for (let index = 0; index < MAIL_CONSULTATIONS_PER_HOUR; index += 1) {
      await w.handler.execute(new RevealMailRecipientCommand("send_1", "colette"));
    }

    await expect(
      w.handler.execute(new RevealMailRecipientCommand("send_1", "bruno")),
    ).resolves.toBeUndefined();
    w.clock.advanceMs(60 * 60_000 + 1);
    await expect(
      w.handler.execute(new RevealMailRecipientCommand("send_1", "colette")),
    ).resolves.toBeUndefined();
  });
});
