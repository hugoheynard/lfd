import { DirectUnitOfWork } from "../../../../platform/database/__tests__/direct-unit-of-work.js";
import { RecordingPublisher } from "../../../../platform/events/__tests__/recording-publisher.js";
import { inMemoryIntents } from "../../../../platform/intent/__tests__/in-memory-gesture-intent.ledger.js";
import { FixedClock } from "../../../../platform/time/fixed-clock.js";
import {
  FixedStaffContacts,
  InMemoryMailCopy,
  InMemoryReleases,
  RecordingCache,
} from "../../../copy/application/__tests__/mail-copy-doubles.js";
import { TrialRecipientMissingError } from "../../../copy/domain/mail-copy-errors.js";
import { UnknownMailSpaceError } from "../../../charters/domain/mail-charter-errors.js";
import {
  MailSenderChangedError,
  MailSenderRefusedError,
  MailSenderTrialRefusedError,
  SendingDomainsUnavailableError,
  SenderDomainNotVerifiedError,
} from "../../domain/mail-sender-errors.js";
import { ChangeMailSenderCommand } from "../commands/change-mail-sender.command.js";
import { ChangeMailSenderHandler } from "../commands/change-mail-sender.handler.js";
import {
  FixedSendingDomains,
  InMemoryMailSenders,
  RecordingSenderTrial,
} from "./mail-sender-doubles.js";

const STAFF = "fiche-colette";
const INTENT = "5b1d3c9e-1f0a-4b7e-8c21-7e4f0a9d2c11";
const COLETTE = {
  staffUserId: STAFF,
  firstName: "Colette",
  lastName: "Martin",
  email: "colette@lfd.test",
  jobTitle: "",
  active: true,
};
const IDENTITY = {
  senderName: "La Folie Douce",
  fromAddress: "no-reply@lfd-backoffice.com",
  replyToAddress: null,
};
const VERIFIED = ["lafoliecoffee.info", "lfd-backoffice.com"];

function world(
  options: {
    domains?: readonly string[] | Error;
    refusal?: Error | null;
    contacts?: (typeof COLETTE)[];
  } = {},
) {
  const senders = new InMemoryMailSenders();
  const texts = new InMemoryMailCopy();
  const trial = new RecordingSenderTrial(options.refusal ?? null);
  const events = new RecordingPublisher();
  const cache = new RecordingCache();
  const domains = new FixedSendingDomains(options.domains ?? VERIFIED);
  const handler = new ChangeMailSenderHandler(
    senders,
    domains,
    trial,
    new FixedStaffContacts(options.contacts ?? [COLETTE]),
    new InMemoryReleases(texts),
    cache,
    events,
    new FixedClock(new Date(0)),
    new DirectUnitOfWork(),
    inMemoryIntents(),
  );
  return { senders, texts, trial, events, cache, domains, handler };
}

function command(
  overrides: Partial<{ space: string; expectedRevision: number; intentKey: string }> = {},
) {
  return new ChangeMailSenderCommand(
    overrides.space ?? "lfd",
    IDENTITY,
    overrides.expectedRevision ?? 0,
    STAFF,
    overrides.intentKey ?? INTENT,
  );
}

describe("ChangeMailSenderHandler (C3)", () => {
  it("envoie l'essai à l'auteur sous l'identité, puis l'enregistre, journalise et oublie le cache", async () => {
    const w = world();
    await w.handler.execute(command());

    expect(w.trial.sent).toEqual([
      { space: "lfd", identity: IDENTITY, to: "colette@lfd.test", intentKey: INTENT },
    ]);
    expect(w.senders.rows.get("lfd")).toMatchObject({ revision: 1, identity: IDENTITY });
    expect(w.texts.version).toBe(1);
    expect(
      w.events.traced.map((event) => event.journalFact()).map((fact) => [fact.type, fact.payload]),
    ).toEqual([
      [
        "mail_copy.sender_changed",
        {
          subjectLabel: "La Folie Douce — équipe",
          space: "lfd",
          revision: 1,
          senderName: "La Folie Douce",
          fromDomain: "lfd-backoffice.com",
          publicationVersion: 1,
        },
      ],
    ]);
    expect(w.cache.forgotten).toBe(1);
  });

  it("refuse nommément un domaine non vérifié : aucun essai, rien d'enregistré", async () => {
    const w = world({ domains: ["lafoliecoffee.info"] });
    await expect(w.handler.execute(command())).rejects.toThrow(SenderDomainNotVerifiedError);
    expect(w.trial.sent).toEqual([]);
    expect(w.senders.rows.size).toBe(0);
    expect(w.events.factTypes()).toEqual([]);
  });

  it("un essai refusé par Resend n'enregistre rien", async () => {
    const refusal = new MailSenderTrialRefusedError("lfd", new Error("domaine refusé"));
    const w = world({ refusal });
    await expect(w.handler.execute(command())).rejects.toBe(refusal);
    expect(w.senders.rows.size).toBe(0);
    expect(w.texts.version).toBe(0);
    expect(w.events.factTypes()).toEqual([]);
    expect(w.cache.forgotten).toBe(0);
  });

  it("des domaines illisibles n'enregistrent rien et n'envoient rien", async () => {
    const w = world({ domains: new SendingDomainsUnavailableError("Resend est injoignable.") });
    await expect(w.handler.execute(command())).rejects.toThrow(SendingDomainsUnavailableError);
    expect(w.trial.sent).toEqual([]);
  });

  it("refuse une révision dépassée avant de lire Resend", async () => {
    const w = world();
    await expect(w.handler.execute(command({ expectedRevision: 2 }))).rejects.toThrow(
      MailSenderChangedError,
    );
    expect(w.domains.reads).toBe(0);
  });

  it("refuse une identité mal formée sans envoyer d'essai", async () => {
    const w = world();
    const bad = new ChangeMailSenderCommand(
      "lfd",
      { ...IDENTITY, fromAddress: "pas-une-adresse" },
      0,
      STAFF,
      INTENT,
    );
    await expect(w.handler.execute(bad)).rejects.toThrow(MailSenderRefusedError);
    expect(w.trial.sent).toEqual([]);
  });

  it("refuse un espace inconnu — `internal` compris", async () => {
    const w = world();
    await expect(w.handler.execute(command({ space: "internal" }))).rejects.toThrow(
      UnknownMailSpaceError,
    );
  });

  it("refuse sans adresse active sur la fiche de l'auteur : l'essai ne part jamais vers un tiers", async () => {
    const w = world({ contacts: [{ ...COLETTE, active: false }] });
    await expect(w.handler.execute(command())).rejects.toThrow(TrialRecipientMissingError);
    expect(w.trial.sent).toEqual([]);
  });

  it("un double clic (même intention) n'envoie qu'un essai", async () => {
    const w = world();
    await w.handler.execute(command());
    await w.handler.execute(command());
    expect(w.trial.sent).toHaveLength(1);
    expect(w.senders.rows.get("lfd")?.revision).toBe(1);
  });
});
