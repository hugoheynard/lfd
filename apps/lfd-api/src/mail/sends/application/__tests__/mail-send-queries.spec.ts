import { FixedClock } from "../../../../platform/time/fixed-clock.js";
import {
  InvalidMailSendPeriodError,
  MailRecipientNotRevealedError,
  MailSendNotFoundError,
} from "../../domain/errors/mail-sends.errors.js";
import { decodeMailSendCursor } from "../mail-send-cursor.js";
import { GetMailRecipientHandler } from "../queries/get-mail-recipient.handler.js";
import { GetMailRecipientQuery } from "../queries/get-mail-recipient.query.js";
import { GetMailSendHandler } from "../queries/get-mail-send.handler.js";
import { GetMailSendQuery } from "../queries/get-mail-send.query.js";
import { ListMailSendsHandler } from "../queries/list-mail-sends.handler.js";
import { type MailSendCriteria, ListMailSendsQuery } from "../queries/list-mail-sends.query.js";
import {
  FixedMailSendReader,
  FixedProbeTemplates,
  FixedRecipientReader,
  InMemoryConsultations,
  InMemoryRevealLedger,
  record,
} from "./mail-sends-doubles.js";

const PROBE = "ops.deploy-check";

function criteria(overrides: Partial<MailSendCriteria> = {}): MailSendCriteria {
  return {
    space: null,
    template: null,
    state: null,
    delivery: null,
    from: null,
    to: null,
    scope: "regular",
    cursor: null,
    limit: 2,
    ...overrides,
  };
}

describe("ListMailSendsHandler", () => {
  it("masque l'adresse et sert les états en codes anglais", async () => {
    const reader = new FixedMailSendReader([
      record({ id: "a", status: "sent", providerId: null }),
      record({ id: "b", status: "failed", sentAt: null, providerId: null }),
    ]);
    const handler = new ListMailSendsHandler(reader, new FixedProbeTemplates([PROBE]));

    const view = await handler.execute(new ListMailSendsQuery(criteria()));

    expect(
      view.items.map((item) => [item.recipient, item.state, item.delivery, item.problem]),
    ).toEqual([
      ["c•••@halles.fr", "accepted", "dry_run", false],
      ["c•••@halles.fr", "failed", null, true],
    ]);
    expect(JSON.stringify(view)).not.toContain("colette@halles.fr");
    expect(view.nextCursor).toBeNull();
  });

  it("écarte la sonde de la liste ordinaire, et la liste seule sur demande", async () => {
    const reader = new FixedMailSendReader([]);
    const handler = new ListMailSendsHandler(reader, new FixedProbeTemplates([PROBE]));

    await handler.execute(new ListMailSendsQuery(criteria()));
    await handler.execute(new ListMailSendsQuery(criteria({ scope: "probes" })));

    expect(
      reader.calls.map((call) => [call.filter.onlyTemplates, call.filter.exceptTemplates]),
    ).toEqual([
      [null, [PROBE]],
      [[PROBE], []],
    ]);
  });

  it("traduit l'état servi en état de la base pour filtrer", async () => {
    const reader = new FixedMailSendReader([]);
    const handler = new ListMailSendsHandler(reader, new FixedProbeTemplates([]));

    await handler.execute(
      new ListMailSendsQuery(criteria({ state: "accepted", delivery: "dry_run" })),
    );

    expect(reader.calls[0]?.filter).toMatchObject({ status: "sent", delivery: "dry_run" });
  });

  it("lit une ligne de plus pour savoir s'il en reste, et rend le curseur de la dernière servie", async () => {
    const rows = [
      record({ id: "a", status: "failed" }),
      record({ id: "b", delivery: "delayed" }),
      record({ id: "c" }),
    ];
    const reader = new FixedMailSendReader(rows);
    const handler = new ListMailSendsHandler(reader, new FixedProbeTemplates([]));

    const view = await handler.execute(new ListMailSendsQuery(criteria({ limit: 2 })));

    expect(reader.calls[0]?.limit).toBe(3);
    expect(view.items.map((item) => item.id)).toEqual(["a", "b"]);
    expect(view.nextCursor).not.toBeNull();
    expect(decodeMailSendCursor(view.nextCursor ?? "")).toEqual({
      rank: 2,
      requestedAt: rows[1]?.requestedAt,
      id: "b",
    });
  });

  it("repart de la position du curseur", async () => {
    const reader = new FixedMailSendReader([
      record({ id: "a" }),
      record({ id: "b" }),
      record({ id: "c" }),
    ]);
    const handler = new ListMailSendsHandler(reader, new FixedProbeTemplates([]));
    const first = await handler.execute(new ListMailSendsQuery(criteria({ limit: 1 })));

    await handler.execute(new ListMailSendsQuery(criteria({ limit: 1, cursor: first.nextCursor })));

    expect(reader.calls[1]?.after).toMatchObject({ id: "a", rank: 3 });
  });

  it("refuse une période qui commence après sa fin", async () => {
    const handler = new ListMailSendsHandler(
      new FixedMailSendReader([]),
      new FixedProbeTemplates([]),
    );
    const later = new Date(Date.UTC(2026, 0, 2));
    const earlier = new Date(Date.UTC(2026, 0, 1));

    await expect(
      handler.execute(new ListMailSendsQuery(criteria({ from: later, to: earlier }))),
    ).rejects.toThrow(InvalidMailSendPeriodError);
  });
});

describe("GetMailSendHandler", () => {
  it("rend le détail masqué, ses étapes, sans raison d'échec", async () => {
    const handler = new GetMailSendHandler(
      new FixedMailSendReader([
        record({
          delivery: "bounced",
          deliveryAt: new Date(Date.UTC(2026, 0, 1, 9)),
          deliveryKind: "Permanent/Suppressed",
        }),
      ]),
    );

    const view = await handler.execute(new GetMailSendQuery("send_1"));

    expect(view).toMatchObject({
      recipient: "c•••@halles.fr",
      state: "accepted",
      delivery: "bounced",
      deliveryKind: "Permanent/Suppressed",
      documentVersion: 3,
      attempts: 1,
      problem: true,
    });
    expect(view.steps.map((step) => step.step)).toEqual([
      "requested",
      "first_attempt",
      "accepted",
      "bounced",
    ]);
    expect(Object.keys(view)).not.toContain("failureReason");
  });

  it("404 nommé pour un envoi inconnu", async () => {
    const handler = new GetMailSendHandler(new FixedMailSendReader([]));
    await expect(handler.execute(new GetMailSendQuery("absent"))).rejects.toThrow(
      MailSendNotFoundError,
    );
  });
});

describe("GetMailRecipientHandler", () => {
  const NOW = new Date(Date.UTC(2026, 0, 1, 12));
  const RECIPIENTS = new Map([
    ["send_1", { recipient: "colette@halles.fr", failureReason: "Resend : boîte pleine" }],
  ]);

  function world() {
    const consultations = new InMemoryConsultations();
    const clock = new FixedClock(NOW);
    const recipients = new FixedRecipientReader(RECIPIENTS);
    const handler = new GetMailRecipientHandler(
      new InMemoryRevealLedger(consultations),
      recipients,
      clock,
    );
    return { consultations, clock, recipients, handler };
  }

  it("rend l'adresse et la raison à qui a révélé l'envoi il y a moins de 5 minutes", async () => {
    const w = world();
    w.consultations.reveals.push({ id: "r", sendId: "send_1", staffId: "colette", at: NOW });
    w.clock.advanceMs(4 * 60_000);

    await expect(
      w.handler.execute(new GetMailRecipientQuery("send_1", "colette")),
    ).resolves.toEqual({
      id: "send_1",
      recipient: "colette@halles.fr",
      failureReason: "Resend : boîte pleine",
      revealedUntil: new Date(NOW.getTime() + 5 * 60_000).toISOString(),
    });
  });

  it("403 sans révélation, et l'adresse n'est même pas lue", async () => {
    const w = world();
    await expect(w.handler.execute(new GetMailRecipientQuery("send_1", "colette"))).rejects.toThrow(
      MailRecipientNotRevealedError,
    );
    expect(w.recipients.reads).toEqual([]);
  });

  it("403 après 5 minutes", async () => {
    const w = world();
    w.consultations.reveals.push({ id: "r", sendId: "send_1", staffId: "colette", at: NOW });
    w.clock.advanceMs(5 * 60_000);
    await expect(w.handler.execute(new GetMailRecipientQuery("send_1", "colette"))).rejects.toThrow(
      MailRecipientNotRevealedError,
    );
  });

  it("403 pour un collègue : la révélation est à son auteur seul", async () => {
    const w = world();
    w.consultations.reveals.push({ id: "r", sendId: "send_1", staffId: "colette", at: NOW });
    await expect(w.handler.execute(new GetMailRecipientQuery("send_1", "bruno"))).rejects.toThrow(
      MailRecipientNotRevealedError,
    );
  });

  it("403 pour un autre envoi que celui révélé", async () => {
    const w = world();
    w.consultations.reveals.push({ id: "r", sendId: "send_2", staffId: "colette", at: NOW });
    await expect(w.handler.execute(new GetMailRecipientQuery("send_1", "colette"))).rejects.toThrow(
      MailRecipientNotRevealedError,
    );
  });
});
