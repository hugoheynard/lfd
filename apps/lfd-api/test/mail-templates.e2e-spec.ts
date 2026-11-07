/**
 * E2E de **l'éditeur d'e-mails par blocs** (plan
 * `documentation/editeur-de-contenu/plan-editeur-par-blocs.md`, lot S4c) :
 * ouvrir n'écrit rien, le brouillon à révision, « Publier » qui met en
 * service l'arrangement ET les phrases de l'e-mail, l'envoi qui suit le
 * document publié, l'historique, l'aperçu fidèle, et « revenir au modèle
 * d'origine ».
 */
import type {
  MailDocument,
  MailDocumentHistoryView,
  MailDocumentPreviewView,
  MailEditorListView,
  MailEditorView,
} from "@lfd/mail-blocks";

import { jsonBody } from "./e2e-harness.js";
import { mailCopyScene } from "./mail-copy-scene.js";

const scene = mailCopyScene();
const { staff, sendPasswordReset } = scene;
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
    expect(list.mails).toHaveLength(32);
    const view = await open();
    expect(view).toMatchObject({ source: "starting", revision: 0, published: null });
    expect(view.phrases.length).toBeGreaterThan(0);
    expect((await open()).revision).toBe(0);
  });

  it("refuse un e-mail hors du registre (404)", async () => {
    await staff().get(`${EDITOR}/pas.un.e-mail`).expect(404);
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
