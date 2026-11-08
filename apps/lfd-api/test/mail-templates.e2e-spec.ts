/**
 * E2E de **l'éditeur d'e-mails par blocs** (plan
 * `documentation/mail/plan-editeur-par-blocs.md`, lot S4c) :
 * ouvrir n'écrit rien, le brouillon à révision, « Publier » qui met en
 * service l'arrangement ET les phrases de l'e-mail, l'envoi qui suit le
 * document publié, l'historique, l'aperçu fidèle, et « revenir au modèle
 * d'origine ». Lot S4d : les phrases sous `mail_templates`, les cas de
 * l'aperçu, et « M'envoyer un essai » de l'éditeur. Lot S5d : le bloc image,
 * copié à la publication. Lot S5e : le rangement et les signaux des phrases,
 * la publication de tous les e-mails, l'essai sur les phrases publiées.
 * Lot S5f : l'aperçu par blocs du canevas, phrases et variables marquées.
 *
 * Les deux frontières sortantes de la copie d'image sont doublées — le
 * téléchargement (réseau) et le stockage R2 — et l'admission posée (origines
 * admises, adresse publique du stockage), comme `AppConfig` la lirait ; le
 * reste est le vrai chemin : admission de l'origine, reconnaissance des octets,
 * publication, envoi.
 */
import type {
  MailDocument,
  MailDocumentBlockPreviewView,
  MailDocumentHistoryView,
  MailDocumentPreviewView,
  MailDocumentPublicationView,
  MailEditorListView,
  MailEditorPhrasesView,
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
import { E2E_STAFF_EMAIL, jsonBody } from "./e2e-harness.js";
import { INTENT_KEY, freshIntent } from "./intent-key.js";
import { mailCopyScene, ORDER_PLACED } from "./mail-copy-scene.js";

const MEDIA_ORIGIN = "https://media.lfc.test";
/** Les copies du bloc : le dossier `mail/` du bucket des médias. */
const MAIL_IMAGES = `${MEDIA_ORIGIN}/mail`;
/**
 * Une VRAIE image PNG, petite : depuis le 2026-11-08, toute copie est décodée
 * pour être bornée en largeur — une simple signature PNG n'y suffit plus.
 */
const PNG = sharp({ create: { width: 40, height: 20, channels: 3, background: "#c8a165" } })
  .png()
  .toBuffer();

/** Le téléchargement doublé : des octets PNG, et la liste des adresses demandées. */
class PngDownloader extends MailImageDownloader {
  readonly urls: string[] = [];

  download(url: URL, _limits: DownloadLimits): Promise<Buffer> {
    this.urls.push(url.href);
    return PNG;
  }
}

/** Le stockage doublé, adressé par le contenu comme R2. */
class MemoryMailImages extends MailImageStore {
  readonly keys = new Set<string>();

  put(bytes: Buffer, _contentType: string): Promise<MailImageCopy> {
    const key = `templates/${bytes.toString("hex")}.png`;
    this.keys.add(key);
    return Promise.resolve({ url: `${MAIL_IMAGES}/${key}` });
  }
}

const downloader = new PngDownloader();
const mailImages = new MemoryMailImages();
const admission: MailImageAdmission = {
  origins: [MEDIA_ORIGIN],
  copiesBaseUrl: MAIL_IMAGES,
};

const scene = mailCopyScene([
  { token: MailImageDownloader, value: downloader },
  { token: MailImageStore, value: mailImages },
  { token: MAIL_IMAGE_ADMISSION, value: admission },
]);
const { staff, sendPasswordReset, transport } = scene;
const EDITOR = "/admin/mail-templates";
const RESET = "customer.password-reset";
const NOTICE = "Fermé le 1er mai";

async function open(template = RESET): Promise<MailEditorView> {
  return jsonBody<MailEditorView>(await staff().get(`${EDITOR}/${template}`).expect(200));
}

function arranged(starting: MailDocument): MailDocument {
  return {
    template: starting.template,
    blocks: [
      { id: "fermeture", kind: "callout", tone: "info", text: { fr: NOTICE } },
      ...starting.blocks,
    ],
  };
}

describe("ouvrir un e-mail", () => {
  it("liste les e-mails du registre et ouvre le document de départ sans rien écrire", async () => {
    const list = jsonBody<MailEditorListView>(await staff().get(EDITOR).expect(200));
    // 33 au registre (la confirmation d'inscription de C1, 2026-11-08), moins
    // la sonde de déploiement, hors de l'éditeur (2026-11-07).
    expect(list.mails).toHaveLength(32);
    expect(list.mails.map((mail) => mail.template)).not.toContain("ops.deploy-check");
    const view = await open();
    expect(view).toMatchObject({ source: "starting", revision: 0, published: null });
    expect(view.phrases.length).toBeGreaterThan(0);
    expect((await open()).revision).toBe(0);
  });

  /** R1 (§ 24) : les ressources de l'e-mail, chacune avec sa fiche, servies à la lecture. */
  it("sert les ressources de l'e-mail : valeurs, liens, blocs de données", async () => {
    const view = await open(ORDER_PLACED);
    expect(view.resources?.values).toContainEqual(
      expect.objectContaining({
        name: "ref",
        label: "Référence de commande",
        example: "EXEMPLE-0001",
      }),
    );
    expect(view.resources?.links.map((link) => [link.slot, link.label])).toEqual([
      ["cta", "Liste de ses commandes"],
    ]);
    expect(view.resources?.dataBlocks.map((block) => block.block)).toEqual([
      "summary",
      "image",
      "itinerary",
    ]);
    const mandate = await open("customer.mandate-to-sign");
    expect(mandate.resources?.values.find((value) => value.name === "ref")?.label).toBe(
      "Référence du mandat (RUM)",
    );
  });

  it("refuse un e-mail hors du registre (404)", async () => {
    await staff().get(`${EDITOR}/pas.un.e-mail`).expect(404);
  });

  it("refuse d'ouvrir la sonde de déploiement : un contrôle technique, pas un e-mail à rédiger (404)", async () => {
    const refused = await staff().get(`${EDITOR}/ops.deploy-check`).expect(404);
    expect(JSON.stringify(refused.body)).toContain("MAIL_TEMPLATE_UNKNOWN");
    await staff().get(`${EDITOR}/ops.deploy-check/phrases`).expect(404);
  });
});

describe("enregistrer, publier, envoyer", () => {
  it("le brouillon (204), la révision dépassée (409), le document invalide (400)", async () => {
    const view = await open();
    const document = arranged(view.document);
    await staff()
      .put(`${EDITOR}/${RESET}/draft`)
      .send({ document, expectedRevision: 0 })
      .expect(204);
    await staff()
      .put(`${EDITOR}/${RESET}/draft`)
      .send({ document, expectedRevision: 0 })
      .expect(409);
    await staff()
      .put(`${EDITOR}/${RESET}/draft`)
      .send({ document: { template: RESET, blocks: [] }, expectedRevision: 1 })
      .expect(400);
    expect(await open()).toMatchObject({ source: "draft", revision: 1, document });
  });

  it("un courriel envoyé APRÈS publication suit le document publié ; l'historique le garde", async () => {
    const view = await open();
    await staff()
      .put(`${EDITOR}/${RESET}/draft`)
      .send({ document: arranged(view.document), expectedRevision: 0 })
      .expect(204);
    expect((await sendPasswordReset())?.html).not.toContain(NOTICE);

    await staff().post(`${EDITOR}/${RESET}/publications`).send({ expectedRevision: 1 }).expect(201);
    expect((await sendPasswordReset())?.html).toContain(NOTICE);

    const history = jsonBody<MailDocumentHistoryView>(
      await staff().get(`${EDITOR}/${RESET}/history`).expect(200),
    );
    expect(history.versions).toMatchObject([{ version: 1, current: true }]);
  });

  it("refuse de publier quand rien n'attend pour cet e-mail (409)", async () => {
    await staff().post(`${EDITOR}/${RESET}/publications`).send({ expectedRevision: 0 }).expect(409);
  });
});

describe("l'aperçu fidèle et le retour au modèle d'origine", () => {
  it("rend le document demandé, sans repère et sans rien écrire", async () => {
    const view = await open();
    const preview = jsonBody<MailDocumentPreviewView>(
      await staff()
        .post(`${EDITOR}/${RESET}/previews`)
        .send({ locale: "fr", source: "draft", document: arranged(view.document) })
        .expect(200),
    );
    expect(preview.html).toContain(NOTICE);
    expect(preview.html).not.toContain("data-mail-section");
    expect((await open()).revision).toBe(0);
  });

  it("« Revenir au modèle d'origine » retire le publié : l'envoi suivant repart comme avant", async () => {
    const view = await open();
    await staff()
      .put(`${EDITOR}/${RESET}/draft`)
      .send({ document: arranged(view.document), expectedRevision: 0 })
      .expect(204);
    await staff().post(`${EDITOR}/${RESET}/publications`).send({ expectedRevision: 1 }).expect(201);
    await staff().post(`${EDITOR}/${RESET}/reverts`).send({ expectedRevision: 2 }).expect(201);

    expect((await sendPasswordReset())?.html).not.toContain(NOTICE);
    expect(await open()).toMatchObject({ source: "starting", published: null, revision: 3 });
    await staff().post(`${EDITOR}/${RESET}/reverts`).send({ expectedRevision: 3 }).expect(409);
  });
});

describe("les phrases d'un e-mail sous `mail_templates` (S4d)", () => {
  it("écrit (204), relit, refuse une variable perdue (400) et une révision dépassée (409)", async () => {
    const phrases = `${EDITOR}/${ORDER_PLACED}/phrases`;
    await staff()
      .put(`${phrases}/drafts`)
      .send({ path: "subject", locale: "fr", text: "Commande {ref} reçue", expectedRevision: 0 })
      .expect(204);
    const view = jsonBody<MailEditorPhrasesView>(await staff().get(phrases).expect(200));
    expect(view.phrases.find((phrase) => phrase.path === "subject")?.locales.fr).toMatchObject({
      draftState: "set",
      draftText: "Commande {ref} reçue",
      revision: 1,
    });
    await staff()
      .put(`${phrases}/drafts`)
      .send({ path: "subject", locale: "fr", text: "Commande reçue", expectedRevision: 1 })
      .expect(400);
    await staff()
      .put(`${phrases}/drafts`)
      .send({ path: "subject", locale: "fr", text: "Commande {ref}", expectedRevision: 0 })
      .expect(409);
    await staff()
      .post(`${phrases}/resets`)
      .send({ path: "subject", locale: "fr", expectedRevision: 1 })
      .expect(204);
    await staff().get(`${EDITOR}/pas.un.e-mail/phrases`).expect(404);
  });

  it("la phrase écrite ici part avec « Publier » de l'éditeur", async () => {
    await staff()
      .put(`${EDITOR}/${ORDER_PLACED}/phrases/drafts`)
      .send({ path: "subject", locale: "fr", text: "Commande {ref} reçue", expectedRevision: 0 })
      .expect(204);
    await staff()
      .post(`${EDITOR}/${ORDER_PLACED}/publications`)
      .send({ expectedRevision: 0 })
      .expect(201);
    const phrases = jsonBody<MailEditorPhrasesView>(
      await staff().get(`${EDITOR}/${ORDER_PLACED}/phrases`).expect(200),
    );
    expect(
      phrases.phrases.find((phrase) => phrase.path === "subject")?.locales.fr.publishedText,
    ).toBe("Commande {ref} reçue");
  });
});

describe("les cas et l'essai de l'éditeur (S4d)", () => {
  it("liste les cas d'un e-mail, et l'aperçu rend celui demandé ; 404 sur un cas inconnu", async () => {
    // « Commande passée » n'a plus qu'un cas (§ 23) : « Commande prête » en garde plusieurs.
    const ready = "customer.order-ready";
    const view = await open(ready);
    expect(view.cases.map((candidate) => candidate.id)).toContain("delivery");
    expect((await open(ORDER_PLACED)).cases.map((candidate) => candidate.id)).toEqual(["specimen"]);
    const preview = async (caseId: string) =>
      jsonBody<MailDocumentPreviewView>(
        await staff()
          .post(`${EDITOR}/${ready}/previews`)
          .send({ locale: "fr", source: "draft", caseId })
          .expect(200),
      ).html;
    expect(await preview("delivery")).not.toBe(await preview("specimen"));
    await staff()
      .post(`${EDITOR}/${ready}/previews`)
      .send({ locale: "fr", source: "draft", caseId: "inconnu" })
      .expect(404);
  });

  it("« M'envoyer un essai » part à l'appelant seul, avec le document brouillon ; clé obligatoire", async () => {
    const view = await open();
    await staff()
      .put(`${EDITOR}/${RESET}/draft`)
      .send({ document: arranged(view.document), expectedRevision: 0 })
      .expect(204);
    await staff().post(`${EDITOR}/${RESET}/trials`).send({ locale: "fr" }).expect(400);
    await staff()
      .post(`${EDITOR}/${RESET}/trials`)
      .set(INTENT_KEY, freshIntent())
      .send({ locale: "fr" })
      .expect(204);
    expect(transport.sent.map((sent) => [sent.to, sent.template])).toEqual([
      [E2E_STAFF_EMAIL, RESET],
    ]);
    expect(transport.sent[0]?.html).toContain(NOTICE);
    await staff()
      .post(`${EDITOR}/${RESET}/trials`)
      .set(INTENT_KEY, freshIntent())
      .send({ locale: "fr", caseId: "inconnu" })
      .expect(404);
  });
});

describe("l'éditeur couvre l'écran des textes (S5e)", () => {
  it("range les phrases sous leur cadre ou leur bloc, avec le nom de leur variante", async () => {
    const view = await open(ORDER_PLACED);
    expect(view.phrases.find((phrase) => phrase.path === "subject")?.place).toEqual({
      kind: "frame",
      frame: "subject",
    });
    const variant = view.phrases.find(
      (phrase) => phrase.place?.kind === "block" && phrase.variant !== null,
    );
    expect(variant?.variant).toEqual(expect.any(String));
    expect(view.orphans).toEqual([]);
  });

  it("publie les phrases en attente de TOUS les e-mails d'un geste ; 409 quand rien n'attend", async () => {
    const reset = await open(RESET);
    const phrase = reset.phrases.find((candidate) => candidate.locales.fr.default !== null);
    const resetText = `${phrase?.locales.fr.default ?? ""} !`;
    await staff()
      .put(`${EDITOR}/${RESET}/phrases/drafts`)
      .send({ path: phrase?.path, locale: "fr", text: resetText, expectedRevision: 0 })
      .expect(204);
    await staff()
      .put(`${EDITOR}/${ORDER_PLACED}/phrases/drafts`)
      .send({ path: "subject", locale: "fr", text: "Commande {ref} reçue", expectedRevision: 0 })
      .expect(204);
    const list = jsonBody<MailEditorListView>(await staff().get(EDITOR).expect(200));
    expect(list.copyPendingCount).toBe(2);

    const published = jsonBody<MailDocumentPublicationView>(
      await staff().post(`${EDITOR}/publications`).expect(201),
    );
    expect(published.publicationVersion).toBeGreaterThan(0);
    const after = await open(RESET);
    expect(
      after.phrases.find((candidate) => candidate.path === phrase?.path)?.locales.fr.publishedText,
    ).toBe(resetText);
    expect(
      (await open(ORDER_PLACED)).phrases.find((candidate) => candidate.path === "subject")?.locales
        .fr.publishedText,
    ).toBe("Commande {ref} reçue");
    expect(
      jsonBody<MailEditorListView>(await staff().get(EDITOR).expect(200)).copyPendingCount,
    ).toBe(0);
    await staff().post(`${EDITOR}/publications`).expect(409);
  });

  /**
   * § 21, tranché le 2026-11-07 : le document fait foi pour l'ordre. Un ordre
   * de sections en brouillon (posé par l'ancien écran) ne compte plus, ne part
   * plus avec « Publier tous les e-mails », et reste en brouillon.
   */
  it("laisse l'ordre des sections en brouillon : ni compté, ni publié", async () => {
    await staff()
      .put("/admin/mail-copy/section-orders")
      .send({ mail: RESET, order: ["footer", "title", "body", "cta"], expectedRevision: 0 })
      .expect(204);
    const pending = (): Promise<number> =>
      staff()
        .get(EDITOR)
        .expect(200)
        .then((response) => jsonBody<MailEditorListView>(response).copyPendingCount);
    expect(await pending()).toBe(0);
    await staff().post(`${EDITOR}/publications`).expect(409);

    await staff()
      .put(`${EDITOR}/${ORDER_PLACED}/phrases/drafts`)
      .send({ path: "subject", locale: "fr", text: "Commande {ref} notée", expectedRevision: 0 })
      .expect(204);
    expect(await pending()).toBe(1);
    await staff().post(`${EDITOR}/publications`).expect(201);
    const copy = jsonBody<{ readonly pendingCount: number }>(
      await staff().get("/admin/mail-copy").expect(200),
    );
    expect(copy.pendingCount).toBe(1);
  });

  it("sert chaque phrase en trois langues, quelles que soient les langues de départ du modèle", async () => {
    const view = await open(RESET);
    expect(view.phrases.length).toBeGreaterThan(0);
    for (const phrase of view.phrases) {
      expect(Object.keys(phrase.locales).sort()).toEqual(["en", "fr", "it"]);
    }
  });

  it("l'essai sur les phrases publiées n'envoie pas le brouillon ; l'essai par défaut, si", async () => {
    const reset = await open(RESET);
    const subject = reset.phrases.find((candidate) => candidate.place?.kind === "frame");
    const drafted = `${subject?.locales.fr.default ?? ""} (brouillon)`;
    await staff()
      .put(`${EDITOR}/${RESET}/phrases/drafts`)
      .send({ path: subject?.path, locale: "fr", text: drafted, expectedRevision: 0 })
      .expect(204);
    await staff()
      .post(`${EDITOR}/${RESET}/trials`)
      .set(INTENT_KEY, freshIntent())
      .send({ locale: "fr", source: "published" })
      .expect(204);
    await staff()
      .post(`${EDITOR}/${RESET}/trials`)
      .set(INTENT_KEY, freshIntent())
      .send({ locale: "fr" })
      .expect(204);
    const [fromPublished, fromDraft] = transport.sent;
    expect(`${fromPublished?.subject ?? ""}${fromPublished?.html ?? ""}`).not.toContain(
      "(brouillon)",
    );
    expect(`${fromDraft?.subject ?? ""}${fromDraft?.html ?? ""}`).toContain("(brouillon)");
    await staff()
      .post(`${EDITOR}/${RESET}/trials`)
      .set(INTENT_KEY, freshIntent())
      .send({ locale: "fr", source: "ailleurs" })
      .expect(400);
  });
});

describe("le bloc image (S5d)", () => {
  function withImage(starting: MailDocument, src: string): MailDocument {
    return {
      template: starting.template,
      blocks: [
        ...starting.blocks,
        { id: "vitrine", kind: "image", src, alt: { fr: "La vitrine de Noël" } },
      ],
    };
  }

  beforeEach(() => {
    downloader.urls.length = 0;
    mailImages.keys.clear();
  });

  it("la publication copie l'image ; le document publié et l'envoi pointent vers la copie", async () => {
    const source = `${MEDIA_ORIGIN}/products/vitrine.png`;
    const view = await open();
    await staff()
      .put(`${EDITOR}/${RESET}/draft`)
      .send({ document: withImage(view.document, source), expectedRevision: 0 })
      .expect(204);
    await staff().post(`${EDITOR}/${RESET}/publications`).send({ expectedRevision: 1 }).expect(201);

    expect(downloader.urls).toEqual([source]);
    const copy = `${MAIL_IMAGES}/${[...mailImages.keys][0] ?? ""}`;
    const published = await open();
    expect(published.source).toBe("published");
    expect(published.document.blocks).toContainEqual(
      expect.objectContaining({ id: "vitrine", src: source, copySrc: copy }),
    );
    const sent = await sendPasswordReset();
    expect(sent?.html).toContain(`src="${copy}"`);
    expect(sent?.html).not.toContain(source);
  });

  it("une origine non admise refuse la publication en nommant l'image ; rien n'est publié", async () => {
    const view = await open();
    await staff()
      .put(`${EDITOR}/${RESET}/draft`)
      .send({
        document: withImage(view.document, "https://ailleurs.test/vitrine.png"),
        expectedRevision: 0,
      })
      .expect(204);
    const refusal = await staff()
      .post(`${EDITOR}/${RESET}/publications`)
      .send({ expectedRevision: 1 })
      .expect(400);

    expect(JSON.stringify(refusal.body)).toContain("la 1ʳᵉ image (« La vitrine de Noël »)");
    expect(JSON.stringify(refusal.body)).toContain("https://ailleurs.test");
    expect(downloader.urls).toEqual([]);
    expect(await open()).toMatchObject({ source: "draft", published: null, revision: 1 });
  });
});

describe("l'aperçu par blocs du canevas (S5f)", () => {
  async function blocks(
    template: string,
    document: MailDocument,
    extra: Readonly<Record<string, string>> = {},
  ): Promise<MailDocumentBlockPreviewView> {
    return jsonBody<MailDocumentBlockPreviewView>(
      await staff()
        .post(`${EDITOR}/${template}/block-previews`)
        .send({ document, locale: "fr", source: "draft", ...extra })
        .expect(200),
    );
  }

  it("rend aussi un fragment par bloc rangé dans une colonne, la mise en page restant servie", async () => {
    const view = await open(ORDER_PLACED);
    const document: MailDocument = {
      ...view.document,
      blocks: [
        {
          id: "colonnes",
          kind: "columns",
          widths: [50, 50],
          cells: [[{ id: "dans-colonne", kind: "paragraph", text: { fr: "Dedans" } }], []],
        },
        ...view.document.blocks,
      ],
    };
    const rendered = await blocks(ORDER_PLACED, document);
    expect(rendered.blocks[0]?.blockId).toBe("colonnes");
    expect(rendered.cellBlocks.map((block) => block.blockId)).toEqual(["dans-colonne"]);
    expect(rendered.cellBlocks[0]?.html).toContain(
      '<span data-free-block="dans-colonne" data-locale="fr">Dedans</span>',
    );
    expect(rendered.blocks[0]?.html).toContain(rendered.cellBlocks[0]?.html ?? "absent");
  });

  it("rend un fragment marqué par bloc ; chaque phrase marquée est servie par GET …/phrases", async () => {
    const view = await open(ORDER_PLACED);
    const document = arranged(view.document);
    const rendered = await blocks(ORDER_PLACED, document);
    expect(rendered.blocks.map((block) => block.blockId)).toEqual(
      document.blocks.map((block) => block.id),
    );
    expect(rendered.blocks[0]?.html).toContain(
      `<span data-free-block="fermeture" data-locale="fr">${NOTICE}</span>`,
    );
    const all = [rendered.subject, rendered.header, ...rendered.blocks.map((block) => block.html)];
    const served = new Map(view.phrases.map((phrase) => [phrase.path, phrase.variant] as const));
    const marked = all.flatMap((html) => [
      ...html.matchAll(/<span data-phrase="([^"]+)"(?: data-variant="([^"]*)")?>/gu),
    ]);
    expect(marked.length).toBeGreaterThan(0);
    for (const [, path = "", variant] of marked) {
      expect({ path, served: served.has(path) }).toEqual({ path, served: true });
      expect({ path, variant: variant ?? null }).toEqual({
        path,
        variant: served.get(path) ?? null,
      });
    }
    expect(all.join("")).toMatch(/<span data-var="\w+">/u);
    expect(all.join("")).not.toMatch(/<script|\son[a-z]+\s*=|javascript:/iu);
    expect(rendered.subject).toContain('data-phrase="subject"');
    // § 23 : l'accroche seule s'écrit (surtitre et itinéraire compris, Hugo
    // le 2026-11-07) ; le récapitulatif et le QR sont système.
    expect(view.declaration.editablePhrases).toEqual([
      "subject",
      "kicker",
      "title",
      "intro",
      "cta",
      "itinerary",
      "qrLine",
    ]);
    expect(new Set(marked.map(([, path = ""]) => path))).toEqual(
      new Set(["subject", "kicker", "title", "intro", "cta", "itinerary", "qrLine"]),
    );
  });

  it("une phrase en brouillon se voit dans le fragment, mais jamais dans l'aperçu fidèle marqué", async () => {
    await staff()
      .put(`${EDITOR}/${ORDER_PLACED}/phrases/drafts`)
      .send({ path: "subject", locale: "fr", text: "Bien reçu : {ref}", expectedRevision: 0 })
      .expect(204);
    const view = await open(ORDER_PLACED);
    const rendered = await blocks(ORDER_PLACED, view.document);
    expect(rendered.subject).toMatch(
      /^<span data-phrase="subject">Bien reçu : <span data-var="ref">[^<]+<\/span><\/span>$/u,
    );
    const faithful = jsonBody<MailDocumentPreviewView>(
      await staff()
        .post(`${EDITOR}/${ORDER_PLACED}/previews`)
        .send({ locale: "fr", source: "draft", document: view.document })
        .expect(200),
    );
    expect(faithful.subject).toMatch(/^Bien reçu : /u);
    expect(`${faithful.subject}${faithful.html}`).not.toMatch(
      /data-phrase|data-var|data-free-block/u,
    );
  });

  it("refuse un cas inconnu (404), un e-mail inconnu (404), un document invalide (400), un corps sans document (400)", async () => {
    const view = await open(ORDER_PLACED);
    await staff()
      .post(`${EDITOR}/${ORDER_PLACED}/block-previews`)
      .send({ document: view.document, locale: "fr", source: "draft", caseId: "inconnu" })
      .expect(404);
    await staff()
      .post(`${EDITOR}/pas.un.e-mail/block-previews`)
      .send({ document: view.document, locale: "fr", source: "draft" })
      .expect(404);
    await staff()
      .post(`${EDITOR}/${ORDER_PLACED}/block-previews`)
      .send({ document: { template: ORDER_PLACED, blocks: [] }, locale: "fr", source: "draft" })
      .expect(400);
    await staff()
      .post(`${EDITOR}/${ORDER_PLACED}/block-previews`)
      .send({ locale: "fr", source: "draft" })
      .expect(400);
  });

  /** § 24 (2026-11-07) : un bloc qui dépend du mode de retrait le dit, et l'aperçu se règle dessus. */
  it("sert la condition de l'itinéraire, et le rend absent dans la situation « livraison »", async () => {
    const view = await open(ORDER_PLACED);
    expect(view.situations).toEqual(["pickup", "delivery"]);
    expect((await open()).situations).toEqual([]);
    const conditions = new Map(
      (view.resources?.dataBlocks ?? []).map((block) => [block.block, block.condition] as const),
    );
    expect(conditions.get("itinerary")).toMatch(/^Seulement pour un retrait/u);
    expect(conditions.get("summary")).toBeUndefined();
    expect(conditions.get("image")).toBeUndefined();

    const sectionOf = new Map(
      view.document.blocks.flatMap((block) =>
        block.kind === "model" ? [[block.id, block.section] as const] : [],
      ),
    );
    const itineraryIn = async (situation: string): Promise<string | undefined> => {
      const rendered = await blocks(ORDER_PLACED, view.document, { situation });
      expect(rendered.situation).toBe(situation);
      return rendered.blocks.find((block) => sectionOf.get(block.blockId) === "itinerary")?.html;
    };
    expect(await itineraryIn("delivery")).toBe("");
    expect(await itineraryIn("pickup")).toContain("google.com/maps");
    expect((await blocks(ORDER_PLACED, view.document)).situation).toBeNull();
  });

  it("refuse une situation pour un e-mail qui n'en a pas (400), et une situation inconnue (400)", async () => {
    const reset = await open();
    await staff()
      .post(`${EDITOR}/${RESET}/block-previews`)
      .send({ document: reset.document, locale: "fr", source: "draft", situation: "delivery" })
      .expect(400);
    const view = await open(ORDER_PLACED);
    await staff()
      .post(`${EDITOR}/${ORDER_PLACED}/block-previews`)
      .send({ document: view.document, locale: "fr", source: "draft", situation: "sur-place" })
      .expect(400);
  });
});
