import { DirectUnitOfWork } from "../../../../platform/database/__tests__/direct-unit-of-work.js";
import { FixedClock } from "../../../../platform/time/fixed-clock.js";
import { SaveMailCopyDraftCommand } from "../../../copy/application/commands/save-mail-copy-draft.command.js";
import { SaveMailCopyDraftHandler } from "../../../copy/application/commands/save-mail-copy-draft.handler.js";
import { mailCopyAdminView } from "../../../copy/application/mail-copy-admin-view.js";
import {
  InMemoryAdminReader,
  InMemoryMailCopy,
} from "../../../copy/application/__tests__/mail-copy-doubles.js";
import {
  KICKER,
  ORDER_PLACED_LAYOUT,
  SUBJECT,
} from "../../../copy/domain/__tests__/mail-copy-fixtures.js";
import {
  MailCopyManifest,
  type MailCopyManifestEntry,
} from "../../../copy/domain/mail-copy-manifest.js";
import { GetMailTemplatePhrasesHandler } from "../queries/get-mail-template-phrases.handler.js";
import { GetMailTemplatePhrasesQuery } from "../queries/get-mail-template-phrases.query.js";
import { ListMailTemplatesHandler } from "../queries/list-mail-templates.handler.js";
import {
  FixedCatalogue,
  InMemoryMailDocumentReader,
  InMemoryMailDocuments,
  entryOf,
} from "./mail-document-doubles.js";

/**
 * Lot S5e (plan § 21) : ce que l'écran des textes sert de chaque phrase — son
 * bloc ou son cadre, sa variante, ses signaux, les orphelines et les textes
 * hors carte — l'éditeur le sert sous `mail_templates`, tiré de la même vue.
 */

const TEMPLATE = SUBJECT.mail;
const STAFF = "fiche-colette";
const PAID: MailCopyManifestEntry = {
  mail: TEMPLATE,
  path: "title.paid",
  defaults: { fr: "Merci", en: "Thanks", it: "Grazie" },
  allowed: [],
  required: [],
};
/** Au dictionnaire, mais dans aucune section ni aucun cadre : hors carte. */
const LOOSE: MailCopyManifestEntry = { ...PAID, path: "outro" };
/** Connu du code d'hier seulement : sa ligne devient orpheline. */
const FORMER: MailCopyManifestEntry = { ...PAID, path: "former" };
const MAILS = [{ mail: TEMPLATE, family: "order" as const, followsLocale: true }];

function manifestOf(entries: readonly MailCopyManifestEntry[]): MailCopyManifest {
  return MailCopyManifest.of(entries, MAILS, [ORDER_PLACED_LAYOUT]);
}

const TODAY = manifestOf([SUBJECT, KICKER, PAID, LOOSE]);
const YESTERDAY = manifestOf([
  SUBJECT,
  KICKER,
  { ...PAID, defaults: { ...PAID.defaults, fr: "Merci beaucoup" } },
  LOOSE,
  FORMER,
]);

function world() {
  const texts = new InMemoryMailCopy();
  const copy = new InMemoryAdminReader(texts);
  const catalogue = new FixedCatalogue([
    entryOf(TEMPLATE, {
      modelBlocks: ["title", "footer"],
      locales: ["fr"],
      charter: "lfc",
      nature: "transactional",
    }),
  ]);
  const writeAt = (at: number) =>
    new SaveMailCopyDraftHandler(
      texts,
      YESTERDAY,
      new FixedClock(new Date(at)),
      new DirectUnitOfWork(),
    );
  return {
    texts,
    copy,
    writeAt,
    phrases: new GetMailTemplatePhrasesHandler(catalogue, copy, TODAY),
    list: new ListMailTemplatesHandler(
      catalogue,
      new InMemoryMailDocumentReader(new InMemoryMailDocuments()),
      copy,
      TODAY,
    ),
  };
}

describe("le rangement des phrases d'un e-mail", () => {
  it("range chaque phrase sous son cadre ou son bloc, avec sa variante, et laisse le reste hors carte", async () => {
    const view = await world().phrases.execute(new GetMailTemplatePhrasesQuery(TEMPLATE));
    const byPath = new Map(view.phrases.map((phrase) => [phrase.path, phrase]));
    expect(byPath.get("subject")).toMatchObject({
      place: { kind: "frame", frame: "subject" },
      variant: null,
    });
    expect(byPath.get("kicker")?.place).toEqual({ kind: "frame", frame: "header" });
    expect(byPath.get("title.paid")).toMatchObject({
      place: { kind: "block", block: "title" },
      variant: "Commande payée par carte",
    });
    expect(byPath.get("outro")).toMatchObject({ place: null, variant: null });
    expect(view.orphans).toEqual([]);
  });
});

describe("les signaux et les orphelines, comme l'écran des textes", () => {
  it("sert la traduction en retard et le texte d'origine changé, tels que la vue des textes les calcule", async () => {
    const w = world();
    await w
      .writeAt(1)
      .execute(new SaveMailCopyDraftCommand(TEMPLATE, "title.paid", "en", "Thank you", 0, STAFF));
    await w
      .writeAt(2)
      .execute(new SaveMailCopyDraftCommand(TEMPLATE, "title.paid", "fr", "Merci !", 0, STAFF));

    const view = await w.phrases.execute(new GetMailTemplatePhrasesQuery(TEMPLATE));
    const paid = view.phrases.find((phrase) => phrase.path === "title.paid");
    expect(paid?.staleTranslations).toEqual(["en", "it"]);
    expect(paid?.locales.fr.defaultChangedSince).toEqual({ previousDefault: "Merci beaucoup" });
    expect(paid?.locales.en.defaultChangedSince).toBeNull();

    const reference = mailCopyAdminView(
      TODAY,
      await w.copy.entries(),
      await w.copy.publication(),
    ).mails[0]?.texts.find((text) => text.path === "title.paid");
    expect(paid?.staleTranslations).toEqual(reference?.staleTranslations);
    expect(paid?.locales.fr.defaultChangedSince).toEqual(reference?.locales.fr.defaultChangedSince);
  });

  it("sert à part la phrase que le code ne connaît plus, sans rangement", async () => {
    const w = world();
    await w
      .writeAt(1)
      .execute(new SaveMailCopyDraftCommand(TEMPLATE, "former", "fr", "Adieu", 0, STAFF));

    const view = await w.phrases.execute(new GetMailTemplatePhrasesQuery(TEMPLATE));
    expect(view.phrases.map((phrase) => phrase.path)).not.toContain("former");
    expect(view.orphans).toEqual([
      expect.objectContaining({ path: "former", place: null, variant: null }),
    ]);
    expect(view.orphans[0]?.locales.fr).toMatchObject({ default: null, draftText: "Adieu" });
  });
});

describe("la liste des e-mails", () => {
  it("compte ce qui attend la publication de tous les e-mails, comme l'écran des textes", async () => {
    const w = world();
    expect((await w.list.execute()).copyPendingCount).toBe(0);
    await w
      .writeAt(1)
      .execute(new SaveMailCopyDraftCommand(TEMPLATE, "subject", "fr", "Commande {ref}", 0, STAFF));
    expect((await w.list.execute()).copyPendingCount).toBe(1);
  });
});
