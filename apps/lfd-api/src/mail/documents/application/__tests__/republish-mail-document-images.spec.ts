import {
  imageBlocksOf,
  startingMailDocument,
  type ImageBlock,
  type MailDocument,
  type MailTemplateDeclaration,
} from "@lfd/mail-blocks";

import { DirectUnitOfWork } from "../../../../platform/database/__tests__/direct-unit-of-work.js";
import { RecordingPublisher } from "../../../../platform/events/__tests__/recording-publisher.js";
import { FixedClock } from "../../../../platform/time/fixed-clock.js";
import {
  InMemoryMailCopy,
  InMemoryReleases,
  RecordingCache,
} from "../../../copy/application/__tests__/mail-copy-doubles.js";
import { MANIFEST, SUBJECT } from "../../../copy/domain/__tests__/mail-copy-fixtures.js";
import { PublishMailDocumentCommand } from "../commands/publish-mail-document.command.js";
import { PublishMailDocumentHandler } from "../commands/publish-mail-document.handler.js";
import { SaveMailDocumentDraftCommand } from "../commands/save-mail-document-draft.command.js";
import { SaveMailDocumentDraftHandler } from "../commands/save-mail-document-draft.handler.js";
import {
  FixedCatalogue,
  InMemoryMailDocuments,
  RecordingDocumentImages,
  entryOf,
} from "./mail-document-doubles.js";

/**
 * Republier une image (§ 19, « Format et point focal ») : le document garde
 * la SOURCE en `src`, la copie en `copySrc`. Régression : quand la copie
 * remplaçait `src`, changer le cadrage puis republier ne recadrait plus
 * rien — la copie d'une copie du bloc est rendue telle quelle.
 */

const TEMPLATE = SUBJECT.mail;
const DECLARATION: MailTemplateDeclaration = {
  modelBlocks: ["title", "body", "footer"],
  locales: ["fr"],
  charter: "lfc",
};
const STARTING = startingMailDocument(TEMPLATE, DECLARATION);
const STAFF = "fiche-colette";
const SRC = "https://media.lfc.test/products/pain.png";
const BASE = RecordingDocumentImages.COPY_BASE;
const SQUARE: ImageBlock = {
  id: "i1",
  kind: "image",
  src: SRC,
  alt: { fr: "Un pain" },
  format: "1:1",
};

function documentWith(...images: readonly ImageBlock[]): MailDocument {
  return { template: TEMPLATE, blocks: [...STARTING.blocks, ...images] };
}

function world() {
  const documents = new InMemoryMailDocuments();
  const catalogue = new FixedCatalogue([entryOf(TEMPLATE, DECLARATION)]);
  const events = new RecordingPublisher();
  const clock = new FixedClock(new Date(0));
  const uow = new DirectUnitOfWork();
  const images = new RecordingDocumentImages();
  const releases = new InMemoryReleases(new InMemoryMailCopy());
  const save = new SaveMailDocumentDraftHandler(documents, catalogue, events, clock, uow);
  const publish = new PublishMailDocumentHandler(
    documents,
    releases,
    catalogue,
    MANIFEST,
    new RecordingCache(),
    events,
    clock,
    uow,
    images,
  );
  const revision = () => documents.rows.get(TEMPLATE)?.revision ?? 0;
  /** Enregistre puis publie, chacun à la révision courante — le geste de l'écran. */
  const publishDocument = async (document: MailDocument) => {
    await save.execute(new SaveMailDocumentDraftCommand(TEMPLATE, document, revision(), STAFF));
    await publish.execute(new PublishMailDocumentCommand(TEMPLATE, revision(), STAFF));
  };
  const published = () => {
    const document = documents.rows.get(TEMPLATE)?.published?.document;
    return document === undefined ? [] : imageBlocksOf(document);
  };
  return { documents, images, publishDocument, published };
}

describe("republier une image cadrée", () => {
  it("la version publiée garde la source en src, et la copie en copySrc", async () => {
    const w = world();
    await w.publishDocument(documentWith(SQUARE));
    expect(w.published()).toEqual([{ ...SQUARE, copySrc: `${BASE}pain.png-1x1` }]);
  });

  it("changer le format puis republier recopie DEPUIS LA SOURCE, au nouveau cadrage", async () => {
    const w = world();
    await w.publishDocument(documentWith(SQUARE));
    const [first] = w.published();
    await w.publishDocument(documentWith({ ...(first ?? SQUARE), format: "3:2" }));

    expect(w.images.calls).toEqual([SRC, SRC]);
    expect(w.images.framings.at(-1)).toEqual({ format: "3:2", focal: { x: 0.5, y: 0.5 } });
    expect(w.published()).toEqual([{ ...SQUARE, format: "3:2", copySrc: `${BASE}pain.png-3x2` }]);
  });

  it("changer le point focal puis republier fait aussi une nouvelle copie", async () => {
    const w = world();
    await w.publishDocument(documentWith(SQUARE));
    await w.publishDocument(documentWith({ ...SQUARE, focal: { x: 0.1, y: 0.9 } }));

    expect(w.images.framings).toEqual([
      { format: "1:1", focal: { x: 0.5, y: 0.5 } },
      { format: "1:1", focal: { x: 0.1, y: 0.9 } },
    ]);
  });

  it("republier sans changer l'image ne recopie rien, et garde la même copie", async () => {
    const w = world();
    await w.publishDocument(documentWith(SQUARE));
    const [first] = w.published();
    await w.publishDocument(
      documentWith(first ?? SQUARE, { ...SQUARE, id: "i2", alt: { fr: "Le même" } }),
    );

    expect(w.images.calls).toEqual([SRC]);
    expect(w.published().map((image) => image.copySrc)).toEqual([
      `${BASE}pain.png-1x1`,
      `${BASE}pain.png-1x1`,
    ]);
  });

  it("une version publiée avant copySrc (la copie dans src) se republie sans rien perdre", async () => {
    const w = world();
    const legacyCopy = `${BASE}pain.png`;
    const legacy: ImageBlock = { id: "i1", kind: "image", src: legacyCopy, alt: { fr: "Un pain" } };
    await w.publishDocument(documentWith(legacy));
    // La copie du vrai `MailImageCopier` rend telle quelle une adresse du bloc ;
    // le double rend la même adresse pour le même nom de fichier.
    expect(w.published()).toEqual([{ ...legacy, copySrc: legacyCopy }]);
  });
});
