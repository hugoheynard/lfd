import {
  startingMailDocument,
  type MailDocument,
  type MailTemplateDeclaration,
} from "@lfd/mail-blocks";

import { DirectUnitOfWork } from "../../../../platform/database/__tests__/direct-unit-of-work.js";
import { RecordingPublisher } from "../../../../platform/events/__tests__/recording-publisher.js";
import { FixedClock } from "../../../../platform/time/fixed-clock.js";
import {
  InMemoryAdminReader,
  InMemoryMailCopy,
  InMemoryReleases,
  RecordingCache,
} from "../../../copy/application/__tests__/mail-copy-doubles.js";
import {
  MANIFEST,
  QR_FIRST,
  SUBJECT,
  stamp,
} from "../../../copy/domain/__tests__/mail-copy-fixtures.js";
import {
  MailDocumentRefusedError,
  UnknownMailTemplateError,
} from "../../domain/mail-document-errors.js";
import { PublishMailDocumentCommand } from "../commands/publish-mail-document.command.js";
import { PublishMailDocumentHandler } from "../commands/publish-mail-document.handler.js";
import { SaveMailDocumentDraftCommand } from "../commands/save-mail-document-draft.command.js";
import { SaveMailDocumentDraftHandler } from "../commands/save-mail-document-draft.handler.js";
import { GetMailDocumentHistoryHandler } from "../queries/get-mail-document-history.handler.js";
import { GetMailDocumentHistoryQuery } from "../queries/get-mail-document-history.query.js";
import { GetMailTemplateHandler } from "../queries/get-mail-template.handler.js";
import { GetMailTemplateQuery } from "../queries/get-mail-template.query.js";
import { ListMailTemplatesHandler } from "../queries/list-mail-templates.handler.js";
import { PreviewMailDocumentHandler } from "../queries/preview-mail-document.handler.js";
import { PreviewMailDocumentQuery } from "../queries/preview-mail-document.query.js";
import {
  FixedCatalogue,
  InMemoryMailDocumentReader,
  InMemoryMailDocuments,
  RecordingDocumentRenderer,
  entryOf,
} from "./mail-document-doubles.js";

const TEMPLATE = SUBJECT.mail;
const DECLARATION: MailTemplateDeclaration = {
  modelBlocks: ["title", "body", "image", "footer"],
  locales: ["fr", "en", "it"],
  charter: "lfc",
};
const FRENCH_ONLY = "customer.company-attached";
const STAFF = "fiche-colette";
const AT = new Date(0);
const STARTING = startingMailDocument(TEMPLATE, DECLARATION);
const REVERSED: MailDocument = { template: TEMPLATE, blocks: [...STARTING.blocks].reverse() };

function world() {
  const texts = new InMemoryMailCopy();
  const documents = new InMemoryMailDocuments();
  const reader = new InMemoryMailDocumentReader(documents);
  const copy = new InMemoryAdminReader(texts);
  const renderer = new RecordingDocumentRenderer();
  const catalogue = new FixedCatalogue([
    entryOf(TEMPLATE, DECLARATION),
    entryOf(FRENCH_ONLY, { modelBlocks: ["title", "footer"], locales: ["fr"], charter: "lfc" }),
  ]);
  const clock = new FixedClock(AT);
  const uow = new DirectUnitOfWork();
  const events = new RecordingPublisher();
  return {
    texts,
    documents,
    renderer,
    save: new SaveMailDocumentDraftHandler(documents, catalogue, events, clock, uow),
    publish: new PublishMailDocumentHandler(
      documents,
      new InMemoryReleases(texts),
      catalogue,
      MANIFEST,
      new RecordingCache(),
      events,
      clock,
      uow,
    ),
    list: new ListMailTemplatesHandler(catalogue, reader),
    read: new GetMailTemplateHandler(catalogue, reader, copy, MANIFEST),
    history: new GetMailDocumentHistoryHandler(catalogue, reader),
    preview: new PreviewMailDocumentHandler(catalogue, reader, copy, MANIFEST, renderer),
  };
}

describe("ouvrir un e-mail", () => {
  it("rend le document de départ, ses phrases et son cas, sans rien écrire", async () => {
    const w = world();
    const view = await w.read.execute(new GetMailTemplateQuery(TEMPLATE));
    expect(view).toMatchObject({
      template: TEMPLATE,
      document: STARTING,
      source: "starting",
      revision: 0,
      published: null,
      draft: null,
      cases: [{ id: "specimen", label: "Exemple" }],
    });
    expect(view.phrases.map((phrase) => phrase.path)).toEqual(["subject", "kicker"]);
    expect(view.phrases[0]?.locales.fr).toMatchObject({
      default: SUBJECT.defaults.fr,
      revision: 0,
    });
    expect(w.documents.rows.size).toBe(0);
  });

  /** Le document de départ est l'ordre publié de l'ancienne table, quand il y en a un (§ 3). */
  it("part de l'ordre publié de l'ancienne table", async () => {
    const w = world();
    w.texts.orders.set(TEMPLATE, {
      mail: TEMPLATE,
      revision: 1,
      draft: { state: "unchanged" },
      drafted: null,
      publishedOrder: QR_FIRST,
      published: stamp(AT),
    });
    const view = await w.read.execute(new GetMailTemplateQuery(TEMPLATE));
    expect(view.document.blocks.map((block) => block.id)).toEqual([
      "model:image",
      "model:title",
      "model:body",
      "model:footer",
    ]);
  });

  it("rend le brouillon quand il y en a un, avec sa révision", async () => {
    const w = world();
    await w.save.execute(new SaveMailDocumentDraftCommand(TEMPLATE, REVERSED, 0, STAFF));
    expect(await w.read.execute(new GetMailTemplateQuery(TEMPLATE))).toMatchObject({
      document: REVERSED,
      source: "draft",
      revision: 1,
      draft: { at: AT.toISOString(), staffId: STAFF },
    });
  });

  it("refuse un e-mail hors du registre", async () => {
    await expect(world().read.execute(new GetMailTemplateQuery("inconnu"))).rejects.toBeInstanceOf(
      UnknownMailTemplateError,
    );
  });
});

describe("la liste et l'historique", () => {
  it("liste chaque e-mail du registre avec son état", async () => {
    const w = world();
    await w.save.execute(new SaveMailDocumentDraftCommand(TEMPLATE, REVERSED, 0, STAFF));
    await w.publish.execute(new PublishMailDocumentCommand(TEMPLATE, 1, STAFF));
    const { mails } = await w.list.execute();
    expect(mails).toEqual([
      expect.objectContaining({
        template: TEMPLATE,
        published: { version: 1, at: AT.toISOString(), staffId: STAFF },
        hasDraft: false,
      }),
      expect.objectContaining({ template: FRENCH_ONLY, published: null, locales: ["fr"] }),
    ]);
  });

  it("rend les versions, la plus récente d'abord, et celle qui part", async () => {
    const w = world();
    await w.save.execute(new SaveMailDocumentDraftCommand(TEMPLATE, REVERSED, 0, STAFF));
    await w.publish.execute(new PublishMailDocumentCommand(TEMPLATE, 1, STAFF));
    await w.save.execute(new SaveMailDocumentDraftCommand(TEMPLATE, STARTING, 2, STAFF));
    await w.publish.execute(new PublishMailDocumentCommand(TEMPLATE, 3, STAFF));
    const history = await w.history.execute(new GetMailDocumentHistoryQuery(TEMPLATE));
    expect(history.versions.map(({ version, current }) => ({ version, current }))).toEqual([
      { version: 2, current: true },
      { version: 1, current: false },
    ]);
    expect(history.retracted).toBeNull();
  });
});

describe("l'aperçu fidèle", () => {
  it("rend le document donné, sinon celui que l'éditeur ouvrirait, sans rien écrire", async () => {
    const w = world();
    await w.preview.execute(new PreviewMailDocumentQuery(TEMPLATE, "en", "draft", REVERSED));
    await w.preview.execute(new PreviewMailDocumentQuery(TEMPLATE, "fr", "published", null));
    expect(w.renderer.calls.map(({ locale, document }) => ({ locale, document }))).toEqual([
      { locale: "en", document: REVERSED },
      { locale: "fr", document: STARTING },
    ]);
    expect(w.documents.rows.size).toBe(0);
  });

  it("rend un e-mail français seul en français, quelle que soit la langue demandée", async () => {
    const w = world();
    const view = await w.preview.execute(
      new PreviewMailDocumentQuery(FRENCH_ONLY, "it", "draft", null),
    );
    expect(view.locale).toBe("fr");
  });

  it("refuse un document qui enfreint une règle de forme", async () => {
    await expect(
      world().preview.execute(
        new PreviewMailDocumentQuery(TEMPLATE, "fr", "draft", { template: TEMPLATE, blocks: [] }),
      ),
    ).rejects.toBeInstanceOf(MailDocumentRefusedError);
  });
});
