import { startingMailDocument, type MailTemplateDeclaration } from "@lfd/mail-blocks";

import { DirectUnitOfWork } from "../../../../platform/database/__tests__/direct-unit-of-work.js";
import { FixedClock } from "../../../../platform/time/fixed-clock.js";
import { SaveMailCopyDraftCommand } from "../../../copy/application/commands/save-mail-copy-draft.command.js";
import { SaveMailCopyDraftHandler } from "../../../copy/application/commands/save-mail-copy-draft.handler.js";
import {
  InMemoryAdminReader,
  InMemoryMailCopy,
} from "../../../copy/application/__tests__/mail-copy-doubles.js";
import {
  KICKER,
  ORDER_PLACED_LAYOUT,
  SUBJECT,
} from "../../../copy/domain/__tests__/mail-copy-fixtures.js";
import { MailCopyManifest } from "../../../copy/domain/mail-copy-manifest.js";
import {
  MailDocumentRefusedError,
  MailSituationNotSettableError,
  UnknownMailCaseError,
  UnknownMailTemplateError,
} from "../../domain/mail-document-errors.js";
import { PreviewMailDocumentBlocksHandler } from "../queries/preview-mail-document-blocks.handler.js";
import { PreviewMailDocumentBlocksQuery } from "../queries/preview-mail-document-blocks.query.js";
import { FixedCatalogue, RecordingBlockRenderer, entryOf } from "./mail-document-doubles.js";

/**
 * Lot S5f (plan § 22) : l'aperçu par blocs rend le document DE L'ÉCRAN, avec
 * les phrases de la source demandée et les variantes que `GET …/phrases` sert.
 */

const TEMPLATE = SUBJECT.mail;
const FRENCH_ONLY = "customer.company-attached";
const STAFF = "fiche-colette";
const DECLARATION: MailTemplateDeclaration = {
  modelBlocks: ["title", "body", "image", "footer"],
  locales: ["fr", "en", "it"],
  charter: "lfc",
  nature: "transactional",
};
const FRENCH: MailTemplateDeclaration = {
  modelBlocks: ["title", "footer"],
  locales: ["fr"],
  charter: "lfc",
  nature: "transactional",
};
const STARTING = startingMailDocument(TEMPLATE, DECLARATION);
/** La confirmation, son titre en deux variantes (`ORDER_PLACED_LAYOUT`). */
const MANIFEST = MailCopyManifest.of(
  [
    SUBJECT,
    KICKER,
    {
      mail: TEMPLATE,
      path: "title.paid",
      defaults: { fr: "Merci", en: "Thanks", it: "Grazie" },
      allowed: [],
      required: [],
    },
  ],
  [
    { mail: TEMPLATE, family: "order", followsLocale: true },
    { mail: FRENCH_ONLY, family: "account", followsLocale: false },
  ],
  [ORDER_PLACED_LAYOUT],
);

function world() {
  const texts = new InMemoryMailCopy();
  const renderer = new RecordingBlockRenderer();
  const catalogue = new FixedCatalogue([
    { ...entryOf(TEMPLATE, DECLARATION), situations: ["pickup", "delivery"] },
    entryOf(FRENCH_ONLY, FRENCH),
  ]);
  return {
    renderer,
    write: new SaveMailCopyDraftHandler(
      texts,
      MANIFEST,
      new FixedClock(new Date(0)),
      new DirectUnitOfWork(),
    ),
    blocks: new PreviewMailDocumentBlocksHandler(
      catalogue,
      new InMemoryAdminReader(texts),
      MANIFEST,
      renderer,
    ),
  };
}

describe("l'aperçu par blocs", () => {
  it("rend le document donné, un fragment par bloc, sans rien écrire", async () => {
    const w = world();
    const view = await w.blocks.execute(
      new PreviewMailDocumentBlocksQuery(TEMPLATE, "en", "draft", STARTING),
    );
    expect(view.template).toBe(TEMPLATE);
    expect(view.locale).toBe("en");
    expect(view.blocks.map((block) => block.blockId)).toEqual(
      STARTING.blocks.map((block) => block.id),
    );
    expect(w.renderer.calls[0]).toMatchObject({ caseId: "specimen", document: STARTING });
  });

  it("passe au rendu les variantes que GET …/phrases sert", async () => {
    const w = world();
    await w.blocks.execute(new PreviewMailDocumentBlocksQuery(TEMPLATE, "fr", "draft", STARTING));
    const variants = w.renderer.calls[0]?.variants;
    expect(variants?.get("title.paid")).toBe("Commande payée par carte");
    expect(variants?.get("subject")).toBeNull();
  });

  it("lit les phrases de la source demandée", async () => {
    const w = world();
    await w.write.execute(
      new SaveMailCopyDraftCommand(TEMPLATE, "title.paid", "fr", "Merci !", 0, STAFF),
    );
    await w.blocks.execute(new PreviewMailDocumentBlocksQuery(TEMPLATE, "fr", "draft", STARTING));
    await w.blocks.execute(
      new PreviewMailDocumentBlocksQuery(TEMPLATE, "fr", "published", STARTING),
    );
    expect(w.renderer.calls.map((call) => call.texts[TEMPLATE]?.["title.paid"])).toEqual([
      "Merci !",
      undefined,
    ]);
  });

  it("rend un e-mail français seul en français, quelle que soit la langue demandée", async () => {
    const view = await world().blocks.execute(
      new PreviewMailDocumentBlocksQuery(
        FRENCH_ONLY,
        "it",
        "draft",
        startingMailDocument(FRENCH_ONLY, FRENCH),
      ),
    );
    expect(view.locale).toBe("fr");
  });

  it("refuse un e-mail inconnu, un cas inconnu, un document hors des règles", async () => {
    const w = world();
    await expect(
      w.blocks.execute(new PreviewMailDocumentBlocksQuery("nope", "fr", "draft", STARTING)),
    ).rejects.toBeInstanceOf(UnknownMailTemplateError);
    await expect(
      w.blocks.execute(
        new PreviewMailDocumentBlocksQuery(TEMPLATE, "fr", "draft", STARTING, "inconnu"),
      ),
    ).rejects.toBeInstanceOf(UnknownMailCaseError);
    await expect(
      w.blocks.execute(
        new PreviewMailDocumentBlocksQuery(TEMPLATE, "fr", "draft", {
          template: TEMPLATE,
          blocks: [],
        }),
      ),
    ).rejects.toBeInstanceOf(MailDocumentRefusedError);
    expect(w.renderer.calls).toEqual([]);
  });

  it("rend le cas tel quel sans situation, et dit laquelle il a rendue", async () => {
    const w = world();
    const plain = await w.blocks.execute(
      new PreviewMailDocumentBlocksQuery(TEMPLATE, "fr", "draft", STARTING),
    );
    const delivered = await w.blocks.execute(
      new PreviewMailDocumentBlocksQuery(TEMPLATE, "fr", "draft", STARTING, "specimen", "delivery"),
    );
    expect(w.renderer.calls.map((call) => call.situation)).toEqual([null, "delivery"]);
    expect(plain.situation).toBeNull();
    expect(delivered.situation).toBe("delivery");
  });

  /** § 24 : une situation n'a de sens que pour un e-mail dont un bloc dépend du mode de retrait. */
  it("refuse une situation pour un e-mail qui n'en a pas, sans rien rendre", async () => {
    const w = world();
    await expect(
      w.blocks.execute(
        new PreviewMailDocumentBlocksQuery(
          FRENCH_ONLY,
          "fr",
          "draft",
          startingMailDocument(FRENCH_ONLY, FRENCH),
          "specimen",
          "pickup",
        ),
      ),
    ).rejects.toBeInstanceOf(MailSituationNotSettableError);
    expect(w.renderer.calls).toEqual([]);
  });
});
