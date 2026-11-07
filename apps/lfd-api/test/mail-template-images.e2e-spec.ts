/**
 * E2E du **cadrage des images d'e-mail** (plan
 * `documentation/editeur-de-contenu/plan-editeur-par-blocs.md`, § 19,
 * « Format et point focal ») : la publication recadre la copie au format
 * autour du point focal, deux formats de la même image font deux copies,
 * l'aperçu d'un brouillon signale le cadrage à l'écran, un point focal hors
 * de l'image est refusé à l'enregistrement.
 *
 * Comme `mail-templates.e2e-spec.ts`, les deux frontières sortantes de la
 * copie sont doublées (téléchargement, stockage R2) ; le recadrage, lui, est
 * le vrai (`sharp`), sur une vraie image fabriquée par le test.
 */
import type {
  ImageBlock,
  MailDocument,
  MailDocumentBlockPreviewView,
  MailEditorView,
} from "@lfd/mail-blocks";
import sharp from "sharp";

import {
  MAIL_IMAGE_ADMISSION,
  type MailImageAdmission,
} from "../src/mail/images/application/mail-image-admission.js";
import {
  type DownloadLimits,
  MailImageDownloader,
} from "../src/mail/images/domain/ports/mail-image.downloader.js";
import {
  type MailImageCopy,
  MailImageStore,
} from "../src/mail/images/domain/ports/mail-image.store.js";
import { jsonBody } from "./e2e-harness.js";
import { mailCopyScene } from "./mail-copy-scene.js";

const MEDIA_ORIGIN = "https://media.lfc.test";
const MAIL_IMAGES = "https://mail-images.lfc.test";
const SOURCE = `${MEDIA_ORIGIN}/products/vitrine.png`;

/** Le téléchargement doublé : une vraie image PNG de 400 × 100, fabriquée une fois. */
class RealPngDownloader extends MailImageDownloader {
  readonly urls: string[] = [];
  private png: Promise<Buffer> | null = null;

  download(url: URL, _limits: DownloadLimits): Promise<Buffer> {
    this.urls.push(url.href);
    this.png ??= sharp({
      create: { width: 400, height: 100, channels: 3, background: "#c8a165" },
    })
      .png()
      .toBuffer();
    return this.png;
  }
}

/** Le stockage doublé, adressé par le contenu comme R2 ; il garde les octets. */
class MemoryMailImages extends MailImageStore {
  readonly objects = new Map<string, Buffer>();

  put(bytes: Buffer, _contentType: string): Promise<MailImageCopy> {
    const url = `${MAIL_IMAGES}/templates/${bytes.toString("hex").slice(0, 64)}.png`;
    this.objects.set(url, bytes);
    return Promise.resolve({ url });
  }
}

const downloader = new RealPngDownloader();
const mailImages = new MemoryMailImages();
const admission: MailImageAdmission = {
  origins: [MEDIA_ORIGIN],
  originsVariable: "MAIL_IMAGE_ORIGINS",
  publicBaseUrl: MAIL_IMAGES,
};

const { staff } = mailCopyScene([
  { token: MailImageDownloader, value: downloader },
  { token: MailImageStore, value: mailImages },
  { token: MAIL_IMAGE_ADMISSION, value: admission },
]);
const EDITOR = "/admin/mail-templates";
const RESET = "customer.password-reset";

async function open(): Promise<MailEditorView> {
  return jsonBody<MailEditorView>(await staff().get(`${EDITOR}/${RESET}`).expect(200));
}

function withImages(starting: MailDocument, ...images: readonly ImageBlock[]): MailDocument {
  return { template: starting.template, blocks: [...starting.blocks, ...images] };
}

const ORIGINAL: ImageBlock = {
  id: "entiere",
  kind: "image",
  src: SOURCE,
  alt: { fr: "La vitrine" },
};
const SQUARE: ImageBlock = {
  ...ORIGINAL,
  id: "carree",
  format: "1:1",
  focal: { x: 0.9, y: 0.5 },
};

beforeEach(() => {
  downloader.urls.length = 0;
  mailImages.objects.clear();
});

describe("le cadrage d'une image d'e-mail (§ 19)", () => {
  it("publie deux copies de la même image en deux formats ; la carrée est recadrée", async () => {
    const view = await open();
    await staff()
      .put(`${EDITOR}/${RESET}/draft`)
      .send({ document: withImages(view.document, ORIGINAL, SQUARE), expectedRevision: 0 })
      .expect(204);
    await staff().post(`${EDITOR}/${RESET}/publications`).send({ expectedRevision: 1 }).expect(201);

    const published = (await open()).document.blocks;
    const srcOf = (id: string) =>
      published.flatMap((block) =>
        block.id === id && block.kind === "image" ? [block.copySrc ?? ""] : [],
      )[0];
    const original = srcOf("entiere") ?? "";
    const square = srcOf("carree") ?? "";
    expect(original).not.toBe(square);
    expect(published).toContainEqual(expect.objectContaining({ id: "carree", src: SOURCE }));
    expect(published).toContainEqual(
      expect.objectContaining({ id: "carree", format: "1:1", focal: { x: 0.9, y: 0.5 } }),
    );
    const squareMeta = await sharp(mailImages.objects.get(square)).metadata();
    expect([squareMeta.width, squareMeta.height, squareMeta.format]).toEqual([100, 100, "png"]);
    const originalMeta = await sharp(mailImages.objects.get(original)).metadata();
    expect([originalMeta.width, originalMeta.height]).toEqual([400, 100]);
  });

  it("republier après un changement de format recopie depuis la source ; sans changement, rien", async () => {
    const view = await open();
    await staff()
      .put(`${EDITOR}/${RESET}/draft`)
      .send({ document: withImages(view.document, SQUARE), expectedRevision: 0 })
      .expect(204);
    await staff().post(`${EDITOR}/${RESET}/publications`).send({ expectedRevision: 1 }).expect(201);
    const first = await open();
    await staff()
      .put(`${EDITOR}/${RESET}/draft`)
      .send({ document: first.document, expectedRevision: first.revision })
      .expect(204);
    await staff()
      .post(`${EDITOR}/${RESET}/publications`)
      .send({ expectedRevision: first.revision + 1 })
      .expect(201);
    expect(downloader.urls).toEqual([SOURCE]);

    const second = await open();
    const wide = second.document.blocks.map((block) =>
      block.id === "carree" && block.kind === "image"
        ? { ...block, format: "2:1" as const }
        : block,
    );
    await staff()
      .put(`${EDITOR}/${RESET}/draft`)
      .send({ document: { ...second.document, blocks: wide }, expectedRevision: second.revision })
      .expect(204);
    await staff()
      .post(`${EDITOR}/${RESET}/publications`)
      .send({ expectedRevision: second.revision + 1 })
      .expect(201);

    expect(downloader.urls).toEqual([SOURCE, SOURCE]);
    const third = (await open()).document.blocks.find((block) => block.id === "carree");
    const copy = third?.kind === "image" ? (third.copySrc ?? "") : "";
    const meta = await sharp(mailImages.objects.get(copy)).metadata();
    expect([meta.width, meta.height]).toEqual([200, 100]);
  });

  it("l'aperçu d'un brouillon montre la source et signale le cadrage à l'écran", async () => {
    const view = await open();
    const preview = jsonBody<MailDocumentBlockPreviewView>(
      await staff()
        .post(`${EDITOR}/${RESET}/block-previews`)
        .send({ document: withImages(view.document, SQUARE), locale: "fr", source: "draft" })
        .expect(200),
    );
    const fragment = preview.blocks.find((block) => block.blockId === "carree")?.html ?? "";
    expect(fragment).toContain(`src="${SOURCE}"`);
    expect(fragment).toContain(
      'data-image-format="1:1" data-image-focal-x="0.9" data-image-focal-y="0.5"',
    );
    expect(downloader.urls).toEqual([]);
  });

  it("refuse un point focal hors de l'image dès l'enregistrement (400)", async () => {
    const view = await open();
    const refusal = await staff()
      .put(`${EDITOR}/${RESET}/draft`)
      .send({
        document: withImages(view.document, { ...SQUARE, focal: { x: 1.5, y: 0.5 } }),
        expectedRevision: 0,
      })
      .expect(400);
    expect(JSON.stringify(refusal.body)).toContain("point focal");
  });
});
