import {
  imageBlocksOf,
  startingMailDocument,
  imageCopyKey,
  type ImageBlock,
  type ImageFraming,
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
import {
  MailImageOriginNotAdmittedError,
  MailImageStorageUnavailableError,
} from "../../../images/domain/errors/mail-image.errors.js";
import {
  MailDocumentImageNotCopiedError,
  MailDocumentImageRefusedError,
  MailDocumentImageUnavailableError,
  MailDocumentRefusedError,
} from "../../domain/mail-document-errors.js";
import { MailTemplateDocument } from "../../domain/mail-template-document.js";
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

/** S5d (plan `plan-editeur-par-blocs.md`, § 19) : publier copie les images. */

const TEMPLATE = SUBJECT.mail;
const DECLARATION: MailTemplateDeclaration = {
  modelBlocks: ["title", "body", "footer"],
  locales: ["fr"],
  charter: "lfc",
};
const STARTING = startingMailDocument(TEMPLATE, DECLARATION);
const STAFF = "fiche-colette";
const SRC = "https://media.lfc.test/products/pain.png";
const OTHER = "https://media.lfc.test/products/brioche.png";
const COPY = `${RecordingDocumentImages.COPY_BASE}pain.png`;

function image(id: string, src: string, alt = "Un pain"): ImageBlock {
  return { id, kind: "image", src, alt: { fr: alt } };
}

function documentWith(...images: readonly ImageBlock[]): MailDocument {
  return { template: TEMPLATE, blocks: [...STARTING.blocks, ...images] };
}

/** Une unité de travail qui sait si un travail est en cours. */
class WatchedUnitOfWork extends DirectUnitOfWork {
  inside = false;

  override async run<T>(work: () => Promise<T>): Promise<T> {
    this.inside = true;
    try {
      return await work();
    } finally {
      this.inside = false;
    }
  }
}

/** La copie doublée, qui note si elle a été appelée dans la transaction. */
class WatchedImages extends RecordingDocumentImages {
  readonly insideAtCopy: boolean[] = [];

  constructor(
    private readonly uow: WatchedUnitOfWork,
    refused: ReadonlyMap<string, Error>,
  ) {
    super(refused);
  }

  override copy(sourceUrl: string, framing: ImageFraming | null): Promise<string> {
    this.insideAtCopy.push(this.uow.inside);
    return super.copy(sourceUrl, framing);
  }
}

function world(refused: ReadonlyMap<string, Error> = new Map()) {
  const documents = new InMemoryMailDocuments();
  const catalogue = new FixedCatalogue([entryOf(TEMPLATE, DECLARATION)]);
  const events = new RecordingPublisher();
  const clock = new FixedClock(new Date(0));
  const uow = new WatchedUnitOfWork();
  const images = new WatchedImages(uow, refused);
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
  return {
    documents,
    images,
    draft: (document: MailDocument) =>
      save.execute(new SaveMailDocumentDraftCommand(TEMPLATE, document, 0, STAFF)),
    publish: () => publish.execute(new PublishMailDocumentCommand(TEMPLATE, 1, STAFF)),
  };
}

const publishedOf = (w: ReturnType<typeof world>) =>
  w.documents.rows.get(TEMPLATE)?.published?.document ?? null;

describe("publier un document qui porte des images", () => {
  it("copie chaque adresse une fois, et la version publiée pointe vers les copies", async () => {
    const w = world();
    await w.draft(documentWith(image("i1", SRC), image("i2", SRC), image("i3", OTHER)));

    await w.publish();

    expect(w.images.calls).toEqual([SRC, OTHER]);
    const published = publishedOf(w);
    expect(published === null ? [] : imageBlocksOf(published).map((i) => i.copySrc)).toEqual([
      COPY,
      COPY,
      `${RecordingDocumentImages.COPY_BASE}brioche.png`,
    ]);
  });

  it("copie hors de la transaction", async () => {
    const w = world();
    await w.draft(documentWith(image("i1", SRC)));

    await w.publish();

    expect(w.images.insideAtCopy).toEqual([false]);
  });

  it("un brouillon refusé l'est avant toute copie", async () => {
    const w = world();
    await w.draft(documentWith(image("i1", SRC, "")));

    await expect(w.publish()).rejects.toBeInstanceOf(MailDocumentRefusedError);
    expect(w.images.calls).toEqual([]);
  });

  it("une image refusée par la copie refuse la publication en la désignant, et rien n'est publié", async () => {
    const w = world(
      new Map([[OTHER, new MailImageOriginNotAdmittedError("https://media.lfc.test", "X")]]),
    );
    await w.draft(documentWith(image("i1", SRC), image("i2", OTHER, "Une brioche")));

    const refusal: unknown = await w.publish().catch((error: unknown) => error);

    expect(refusal).toBeInstanceOf(MailDocumentImageRefusedError);
    expect(refusal).toMatchObject({
      image: { blockId: "i2", rank: 2 },
      message: expect.stringContaining("la 2ᵉ image (« Une brioche »)") as unknown,
    });
    expect(publishedOf(w)).toBeNull();
    expect(w.documents.rows.get(TEMPLATE)?.draft?.document).toEqual(
      documentWith(image("i1", SRC), image("i2", OTHER, "Une brioche")),
    );
  });

  it("un stockage en panne est une erreur technique qui désigne l'image", async () => {
    const w = world(new Map([[SRC, new MailImageStorageUnavailableError("R2_MAIL_* manquants")]]));
    await w.draft(documentWith(image("i1", SRC)));

    await expect(w.publish()).rejects.toBeInstanceOf(MailDocumentImageUnavailableError);
    expect(publishedOf(w)).toBeNull();
  });
});

describe("publier une image cadrée (§ 19, « Format et point focal »)", () => {
  it("deux formats de la même image font deux copies, chacune à son bloc, cadrage gardé", async () => {
    const w = world();
    const square: ImageBlock = { ...image("i2", SRC), format: "1:1", focal: { x: 0.2, y: 0.4 } };
    const original: ImageBlock = { ...image("i3", SRC), format: "original" };
    await w.draft(documentWith(image("i1", SRC), square, original));

    await w.publish();

    expect(w.images.calls).toEqual([SRC, SRC]);
    expect(w.images.framings).toEqual([null, { format: "1:1", focal: { x: 0.2, y: 0.4 } }]);
    const published = publishedOf(w);
    expect(published === null ? [] : imageBlocksOf(published)).toEqual([
      { ...image("i1", SRC), copySrc: COPY },
      { ...square, copySrc: `${COPY}-1x1` },
      { ...original, copySrc: COPY },
    ]);
  });

  it("un format sans point focal se recadre au centre", async () => {
    const w = world();
    await w.draft(documentWith({ ...image("i1", SRC), format: "2:1" }));

    await w.publish();

    expect(w.images.framings).toEqual([{ format: "2:1", focal: { x: 0.5, y: 0.5 } }]);
  });
});

describe("MailTemplateDocument.publish — l'invariant des copies", () => {
  it("refuse une image cadrée dont seule la version d'origine est copiée", () => {
    const document = MailTemplateDocument.untouched(TEMPLATE);
    const stamp = { at: new Date(0), staffId: STAFF };
    const square: ImageBlock = { ...image("i1", SRC), format: "1:1" };
    document.saveDraft(documentWith(square), DECLARATION, 0, stamp);

    expect(() => document.publish(DECLARATION, 1, stamp, new Map([[SRC, COPY]]))).toThrow(
      MailDocumentImageNotCopiedError,
    );
    expect(
      document.publish(DECLARATION, 1, stamp, new Map([[imageCopyKey(square), COPY]]))?.document,
    ).toEqual(documentWith({ ...square, copySrc: COPY }));
  });

  it("refuse de publier une image sans sa copie", () => {
    const document = MailTemplateDocument.untouched(TEMPLATE);
    const stamp = { at: new Date(0), staffId: STAFF };
    document.saveDraft(documentWith(image("i1", SRC)), DECLARATION, 0, stamp);

    expect(() => document.publish(DECLARATION, 1, stamp, new Map())).toThrow(
      MailDocumentImageNotCopiedError,
    );
    expect(document.publish(DECLARATION, 1, stamp, new Map([[SRC, COPY]]))?.document).toEqual(
      documentWith({ ...image("i1", SRC), copySrc: COPY }),
    );
  });
});
