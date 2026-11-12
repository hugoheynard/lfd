import { inMemoryIntents } from "../../../../platform/intent/__tests__/in-memory-gesture-intent.ledger.js";
import {
  InsideUnitOfWork,
  SealingIntentLedger,
} from "../../../../platform/intent/__tests__/sealing-intent-ledger.js";
import type { JournaledEvent } from "../../../../platform/journal/journal-fact.js";
import { RecordingPublisher } from "../../../../platform/events/__tests__/recording-publisher.js";
import { MANIFEST, SUBJECT, stamp } from "../../domain/__tests__/mail-copy-fixtures.js";
import { TrialRecipientMissingError, UnknownMailError } from "../../domain/mail-copy-errors.js";
import { SendMailCopyTrialCommand } from "../commands/send-mail-copy-trial.command.js";
import { SendMailCopyTrialHandler } from "../commands/send-mail-copy-trial.handler.js";
import { GetMailCopyPreviewHandler } from "../queries/get-mail-copy-preview.handler.js";
import { GetMailCopyPreviewQuery } from "../queries/get-mail-copy-preview.query.js";
import {
  FixedStaffContacts,
  InMemoryAdminReader,
  InMemoryMailCopy,
  RecordingRenderer,
  RecordingTrialSender,
} from "./mail-copy-doubles.js";

const AT = new Date(0);
const INTENT = "0b7f6f0e-8a52-4c1e-9d43-0d8e5f0a1b2c";
const COLETTE = {
  staffUserId: "fiche-colette",
  firstName: "Colette",
  lastName: "Martin",
  email: "colette@lfc.test",
  jobTitle: "",
  active: true,
};

/** Un texte publié, dont le brouillon attend : les deux sources diffèrent. */
/** Le fait de l'essai ne s'écrit pas : la transaction tombe. */
class FailingPublisher extends RecordingPublisher {
  override publishTraced(_event: JournaledEvent): Promise<void> {
    return Promise.reject(new Error("journal en panne"));
  }
}

function world(contacts = [COLETTE], events: RecordingPublisher = new RecordingPublisher()) {
  const texts = new InMemoryMailCopy();
  texts.rows.set(`${SUBJECT.mail}|${SUBJECT.path}|fr`, {
    mail: SUBJECT.mail,
    path: SUBJECT.path,
    locale: "fr",
    revision: 2,
    draft: { state: "set", text: "Brouillon {ref}" },
    drafted: stamp(AT),
    publishedText: "Publié {ref}",
    published: stamp(AT),
    draftDefault: null,
    publishedDefault: null,
  });
  const reader = new InMemoryAdminReader(texts);
  const renderer = new RecordingRenderer();
  const sender = new RecordingTrialSender();
  const uow = new InsideUnitOfWork();
  const ledger = new SealingIntentLedger(() => uow.inside);
  return {
    renderer,
    sender,
    events,
    ledger,
    preview: new GetMailCopyPreviewHandler(reader, MANIFEST, renderer),
    trial: new SendMailCopyTrialHandler(
      reader,
      MANIFEST,
      new FixedStaffContacts(contacts),
      sender,
      events,
      uow,
      inMemoryIntents(ledger),
    ),
  };
}

describe("l'aperçu d'un e-mail (C6)", () => {
  it("rend le brouillon ou le publié, selon la source, sans rien publier", async () => {
    const w = world();
    const draft = await w.preview.execute(new GetMailCopyPreviewQuery(SUBJECT.mail, "fr", "draft"));
    const published = await w.preview.execute(
      new GetMailCopyPreviewQuery(SUBJECT.mail, "fr", "published"),
    );

    expect(draft).toMatchObject({ mail: SUBJECT.mail, locale: "fr", source: "draft" });
    expect(w.renderer.calls.map((call) => call.texts)).toEqual([
      { [SUBJECT.mail]: { subject: "Brouillon {ref}" } },
      { [SUBJECT.mail]: { subject: "Publié {ref}" } },
    ]);
    expect(published.html).toBe("<p>exemple</p>");
    expect(w.events.traced).toHaveLength(0);
  });

  it("refuse en 404 un e-mail hors du registre", async () => {
    await expect(
      world().preview.execute(new GetMailCopyPreviewQuery("pas.un.mail", "fr", "draft")),
    ).rejects.toBeInstanceOf(UnknownMailError);
  });
});

describe("« M'envoyer un essai » (C6)", () => {
  it("part à l'adresse de la fiche de l'appelant, puis se trace", async () => {
    const w = world();
    await w.trial.execute(
      new SendMailCopyTrialCommand(SUBJECT.mail, "fr", "draft", "fiche-colette", INTENT),
    );

    expect(w.sender.sent).toEqual([
      {
        to: "colette@lfc.test",
        mail: SUBJECT.mail,
        locale: "fr",
        texts: { [SUBJECT.mail]: { subject: "Brouillon {ref}" } },
        order: null,
        intentKey: INTENT,
      },
    ]);
    expect(w.events.factTypes()).toEqual(["mail_copy.trial_sent"]);
    expect(w.events.traced[0]?.journalFact()).toMatchObject({
      subjectId: SUBJECT.mail,
      payload: { mail: SUBJECT.mail, locale: "fr", source: "draft" },
    });
  });

  it("refuse une fiche suspendue ou sans adresse, sans rien envoyer", async () => {
    for (const contacts of [[], [{ ...COLETTE, active: false }], [{ ...COLETTE, email: " " }]]) {
      const w = world(contacts);
      await expect(
        w.trial.execute(
          new SendMailCopyTrialCommand(SUBJECT.mail, "fr", "draft", "fiche-colette", INTENT),
        ),
      ).rejects.toBeInstanceOf(TrialRecipientMissingError);
      expect(w.sender.sent).toEqual([]);
    }
  });

  /** Régression (revue de S2, cas 4) : un double clic envoyait deux essais. */
  it("un double clic de même intention n'envoie qu'un essai", async () => {
    const w = world();
    const command = new SendMailCopyTrialCommand(
      SUBJECT.mail,
      "fr",
      "draft",
      "fiche-colette",
      INTENT,
    );
    await w.trial.execute(command);
    await w.trial.execute(command);

    expect(w.sender.sent).toHaveLength(1);
    expect(w.events.traced).toHaveLength(1);
  });

  it("un envoi en échec ne se trace pas", async () => {
    const w = world();
    w.sender.failure = new Error("transport en panne");
    await expect(
      w.trial.execute(
        new SendMailCopyTrialCommand(SUBJECT.mail, "fr", "published", "fiche-colette", INTENT),
      ),
    ).rejects.toThrow("transport en panne");
    expect(w.events.traced).toHaveLength(0);
  });

  it("refuse un e-mail hors du registre", async () => {
    await expect(
      world().trial.execute(
        new SendMailCopyTrialCommand("pas.un.mail", "fr", "draft", "fiche-colette", INTENT),
      ),
    ).rejects.toBeInstanceOf(UnknownMailError);
  });
});

describe("« M'envoyer un essai » — une fois par intention, scellée avec sa trace", () => {
  const trial = (): SendMailCopyTrialCommand =>
    new SendMailCopyTrialCommand(SUBJECT.mail, "fr", "draft", "fiche-colette", INTENT);

  // Régression : l'intention était résolue après la transaction ; une panne
  // entre les deux laissait expirer le bail, et le rejeu refaisait le geste.
  it("l'intention est résolue DANS la transaction de la trace", async () => {
    const w = world();
    await w.trial.execute(trial());
    expect(w.ledger.resolutions).toEqual(["in tx"]);
  });

  it("un scellement refusé fait échouer le geste et rend la clé", async () => {
    const w = world();
    w.ledger.refuseNextSeal = new Error("registre indisponible");

    await expect(w.trial.execute(trial())).rejects.toThrow("registre indisponible");
    await w.trial.execute(trial());
    expect(w.ledger.resolutions).toEqual(["in tx", "in tx"]);
  });

  it("une trace qui ne s'écrit pas ne scelle rien", async () => {
    const w = world([COLETTE], new FailingPublisher());

    await expect(w.trial.execute(trial())).rejects.toThrow("journal en panne");
    expect(w.ledger.resolutions).toEqual([]);
  });

  it("rejouée après un succès : ni envoi ni trace de plus", async () => {
    const w = world();
    await w.trial.execute(trial());
    await w.trial.execute(trial());

    expect(w.sender.sent).toHaveLength(1);
    expect(w.events.traced).toHaveLength(1);
    expect(w.ledger.resolutions).toEqual(["in tx"]);
  });
});
