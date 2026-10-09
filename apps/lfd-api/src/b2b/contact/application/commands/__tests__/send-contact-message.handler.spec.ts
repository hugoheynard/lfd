import type { ContactMessagePayload } from "@lfd/contracts";

import { RecordingPublisher } from "../../../../../platform/events/__tests__/recording-publisher.js";
import { FixedIdGenerator } from "../../../../../platform/id/fixed-id-generator.js";
import { FixedClock } from "../../../../../platform/time/fixed-clock.js";
import { CustomerRequestReceivedEvent } from "../../../domain/customer-request.events.js";
import type { RequestReason } from "../../../domain/request-reason.js";
import {
  CustomerRequestIncompleteError,
  RequestReasonNotFoundError,
  RequestReasonUnavailableError,
} from "../../../domain/errors/contact-errors.js";
import { AT, CONTACT_SETTINGS, reason } from "../../../domain/__tests__/request-fixtures.js";
import { SendContactMessageCommand } from "../send-contact-message.command.js";
import { SendContactMessageHandler } from "../send-contact-message.handler.js";
import { FixedAudiences, MemoryReasons, MemoryRequests } from "./contact-doubles.js";

const IP = "203.0.113.x";

const PAYLOAD: ContactMessagePayload = {
  reasonId: "r_pro",
  name: "Jean Martin",
  email: "jean@exemple.fr",
  phone: "",
  message: "Bonjour, je voudrais un tarif.",
  lfd_trap: "",
};

const PRO = { userId: "u1", companyId: "c_active" };

function setup(...reasons: RequestReason[]): {
  handler: SendContactMessageHandler;
  messages: MemoryRequests;
  events: RecordingPublisher;
} {
  const messages = new MemoryRequests();
  const events = new RecordingPublisher();
  const handler = new SendContactMessageHandler(
    new MemoryReasons(...reasons),
    messages,
    new FixedIdGenerator("msg"),
    new FixedClock(AT),
    events,
    new FixedAudiences(),
  );
  return { handler, messages, events };
}

describe("SendContactMessageHandler — « Nous écrire »", () => {
  it("range le message, puis publie sa réception vers l'adresse de l'motif", async () => {
    const { handler, messages, events } = setup(reason());
    await handler.execute(new SendContactMessageCommand(PAYLOAD, PRO, IP));

    expect(messages.saved).toHaveLength(1);
    expect(messages.saved[0]?.toPersistence()).toMatchObject({
      id: "msg_000001",
      reason: { id: "r_pro", labelFr: "Devenir client pro", priority: "urgent" },
      details: { kind: "contact" },
      userId: "u1",
      companyId: "c_active",
    });
    expect(events.published).toHaveLength(1);
    const received = events.published[0];
    expect(received).toBeInstanceOf(CustomerRequestReceivedEvent);
    expect(received).toMatchObject({ recipientEmail: "commercial@lfc.fr" });
    // Pas journalisé : la charge porterait des données qui s'anonymisent.
    expect(events.traced).toHaveLength(0);
  });

  it("fige la priorité de l'motif : la changer ensuite ne requalifie pas le message", async () => {
    const pro = reason();
    const { handler, messages } = setup(pro);
    await handler.execute(new SendContactMessageCommand(PAYLOAD, PRO, IP));
    pro.revise({ ...CONTACT_SETTINGS, priority: "low" }, AT);
    expect(messages.saved[0]?.toPersistence().reason.priority).toBe("urgent");
  });

  it("un client connecté : sa personne et sa société sont rangées avec le message", async () => {
    const { handler, messages } = setup(reason());
    await handler.execute(new SendContactMessageCommand(PAYLOAD, PRO, IP));
    expect(messages.saved[0]?.toPersistence()).toMatchObject({
      userId: "u1",
      companyId: "c_active",
      audience: "b2b",
    });
  });

  it("champ piège rempli : accepté en apparence, rien rangé ni publié", async () => {
    const { handler, messages, events } = setup(reason());
    await expect(
      handler.execute(new SendContactMessageCommand({ ...PAYLOAD, lfd_trap: "spam" }, null, IP)),
    ).resolves.toBeUndefined();
    expect(messages.saved).toHaveLength(0);
    expect(events.published).toHaveLength(0);
  });

  it("un humain rapide n'est plus écarté : aucun délai minimal", async () => {
    // Régression (revue du 2026-10-09) : le délai déclaré par le client faisait
    // perdre en silence le message d'un client connecté, pré-rempli.
    const { handler, messages } = setup(reason());
    await handler.execute(new SendContactMessageCommand(PAYLOAD, PRO, IP));
    expect(messages.saved).toHaveLength(1);
  });

  it("le piège passe AVANT l'motif : un robot n'apprend pas qu'un motif n'existe pas", async () => {
    const { handler } = setup();
    await expect(
      handler.execute(new SendContactMessageCommand({ ...PAYLOAD, lfd_trap: "x" }, null, IP)),
    ).resolves.toBeUndefined();
  });

  it("refuse un motif inconnu", async () => {
    const { handler } = setup();
    await expect(handler.execute(new SendContactMessageCommand(PAYLOAD, PRO, IP))).rejects.toThrow(
      RequestReasonNotFoundError,
    );
  });

  it("le public se déduit : un visiteur est `b2c`, un motif pro lui est refusé", async () => {
    const { handler, messages } = setup(reason());
    await expect(handler.execute(new SendContactMessageCommand(PAYLOAD, null, IP))).rejects.toThrow(
      RequestReasonUnavailableError,
    );
    expect(messages.saved).toHaveLength(0);
  });

  it("un client connecté hors société active est `b2c` : l'motif pro lui est refusé", async () => {
    const { handler } = setup(reason());
    await expect(
      handler.execute(
        new SendContactMessageCommand(PAYLOAD, { userId: "u2", companyId: null }, IP),
      ),
    ).rejects.toThrow(RequestReasonUnavailableError);
  });

  it("refuse un motif désactivé, ou archivé", async () => {
    const archived = reason({ id: "r_old" });
    archived.archive(AT);
    const { handler } = setup(reason({ active: false }), archived);
    await expect(handler.execute(new SendContactMessageCommand(PAYLOAD, PRO, IP))).rejects.toThrow(
      RequestReasonUnavailableError,
    );
    await expect(
      handler.execute(new SendContactMessageCommand({ ...PAYLOAD, reasonId: "r_old" }, PRO, IP)),
    ).rejects.toThrow(RequestReasonUnavailableError);
  });

  it("refuse un message vide : rien rangé, rien publié", async () => {
    const { handler, messages, events } = setup(reason());
    await expect(
      handler.execute(new SendContactMessageCommand({ ...PAYLOAD, message: "  " }, PRO, IP)),
    ).rejects.toThrow(CustomerRequestIncompleteError);
    expect(messages.saved).toHaveLength(0);
    expect(events.published).toHaveLength(0);
  });
});

describe("SendContactMessageHandler — le motif doit être du formulaire « Nous écrire »", () => {
  it("refuse un motif `order_problem`, même actif et visible (§6.5)", async () => {
    const problem = reason({ kind: "order_problem" });
    const { handler, messages } = setup(problem);
    await expect(handler.execute(new SendContactMessageCommand(PAYLOAD, PRO, IP))).rejects.toThrow(
      RequestReasonUnavailableError,
    );
    expect(messages.saved).toHaveLength(0);
  });
});
