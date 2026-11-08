import {
  startingMailDocument,
  type MailDocument,
  type MailTemplateDeclaration,
} from "@lfd/mail-blocks";

import {
  MailDocumentChangedError,
  MailDocumentRefusedError,
  NothingToRevertError,
} from "../mail-document-errors.js";
import { MailTemplateDocument } from "../mail-template-document.js";

const TEMPLATE = "customer.order-ready";
const DECLARATION: MailTemplateDeclaration = {
  modelBlocks: ["title", "body", "cta", "footer"],
  locales: ["fr", "en"],
  charter: "lfc",
  nature: "transactional",
};
const STARTING = startingMailDocument(TEMPLATE, DECLARATION);
const AT = new Date(0);
const LATER = new Date(60_000);
const STAMP = { at: AT, staffId: "fiche-colette" };
const LATER_STAMP = { at: LATER, staffId: "fiche-hugo" };

/** Le départ renversé : un arrangement valable, sans bloc libre. */
const REVERSED: MailDocument = { template: TEMPLATE, blocks: [...STARTING.blocks].reverse() };

/** Un encadré écrit en français seulement : enregistrable, pas publiable. */
const WITH_FRENCH_CALLOUT: MailDocument = {
  template: TEMPLATE,
  blocks: [
    ...STARTING.blocks,
    { id: "fermeture", kind: "callout", tone: "info", text: { fr: "Fermé le 1ᵉʳ mai" } },
  ],
};

describe("le document d'un e-mail jamais arrangé", () => {
  it("ouvre le document de départ, à la révision 0, sans rien à publier", () => {
    const document = MailTemplateDocument.untouched(TEMPLATE);
    expect(document.current(STARTING)).toEqual({ document: STARTING, source: "starting" });
    expect(document.loadedRevision).toBe(0);
    expect(document.publish(DECLARATION, 0, STAMP)).toBeNull();
    expect(document.appendedVersion).toBeNull();
  });
});

describe("enregistrer le brouillon", () => {
  it("pose le brouillon, son auteur, et monte la révision", () => {
    const document = MailTemplateDocument.untouched(TEMPLATE);
    document.saveDraft(REVERSED, DECLARATION, 0, STAMP);
    expect(document.snapshot()).toMatchObject({
      revision: 1,
      draft: { document: REVERSED, stamp: STAMP },
      published: null,
    });
    expect(document.current(STARTING)).toEqual({ document: REVERSED, source: "draft" });
  });

  it("refuse en 409 une révision dépassée, sans rien changer", () => {
    const document = MailTemplateDocument.untouched(TEMPLATE);
    document.saveDraft(REVERSED, DECLARATION, 0, STAMP);
    expect(() => document.saveDraft(STARTING, DECLARATION, 0, STAMP)).toThrow(
      MailDocumentChangedError,
    );
    expect(document.snapshot().draft?.document).toBe(REVERSED);
  });

  it("refuse un document qui retire un bloc du modèle, ou qui est celui d'un autre e-mail", () => {
    const document = MailTemplateDocument.untouched(TEMPLATE);
    const withoutFooter = { template: TEMPLATE, blocks: STARTING.blocks.slice(0, -1) };
    expect(() => document.saveDraft(withoutFooter, DECLARATION, 0, STAMP)).toThrow(
      MailDocumentRefusedError,
    );
    expect(() =>
      document.saveDraft({ ...REVERSED, template: "customer.order-placed" }, DECLARATION, 0, STAMP),
    ).toThrow(MailDocumentRefusedError);
    expect(document.snapshot().revision).toBe(0);
  });

  it("garde un bloc libre incomplet en brouillon : la langue manquante ne se refuse qu'à la publication", () => {
    const document = MailTemplateDocument.untouched(TEMPLATE);
    expect(() => document.saveDraft(WITH_FRENCH_CALLOUT, DECLARATION, 0, STAMP)).not.toThrow();
  });
});

describe("publier", () => {
  it("fait du brouillon la version 1, l'ajoute à l'historique, et efface le brouillon", () => {
    const document = MailTemplateDocument.untouched(TEMPLATE);
    document.saveDraft(REVERSED, DECLARATION, 0, STAMP);
    const published = document.publish(DECLARATION, 1, LATER_STAMP);
    expect(published).toEqual({ document: REVERSED, version: 1, stamp: LATER_STAMP });
    expect(document.appendedVersion).toEqual(published);
    expect(document.snapshot()).toMatchObject({ revision: 2, draft: null, lastVersion: 1 });
    expect(document.current(STARTING)).toEqual({ document: REVERSED, source: "published" });
  });

  it("refuse un bloc libre sans son texte dans une langue du modèle, sans rien changer", () => {
    const document = MailTemplateDocument.untouched(TEMPLATE);
    document.saveDraft(WITH_FRENCH_CALLOUT, DECLARATION, 0, STAMP);
    expect(() => document.publish(DECLARATION, 1, STAMP)).toThrow(MailDocumentRefusedError);
    expect(document.snapshot()).toMatchObject({ revision: 1, published: null });
    expect(document.appendedVersion).toBeNull();
  });

  it("refuse en 409 une révision dépassée", () => {
    const document = MailTemplateDocument.untouched(TEMPLATE);
    document.saveDraft(REVERSED, DECLARATION, 0, STAMP);
    expect(() => document.publish(DECLARATION, 0, STAMP)).toThrow(MailDocumentChangedError);
  });
});

describe("revenir au modèle d'origine", () => {
  function published(): MailTemplateDocument {
    const document = MailTemplateDocument.untouched(TEMPLATE);
    document.saveDraft(REVERSED, DECLARATION, 0, STAMP);
    document.publish(DECLARATION, 1, STAMP);
    return MailTemplateDocument.reconstitute(document.snapshot());
  }

  it("retire le publié et le brouillon, rend la version retirée, garde l'auteur du retrait", () => {
    const document = published();
    document.saveDraft(STARTING, DECLARATION, 2, STAMP);
    expect(document.revert(3, LATER_STAMP)).toBe(1);
    expect(document.snapshot()).toMatchObject({
      revision: 4,
      draft: null,
      published: null,
      retracted: LATER_STAMP,
    });
    expect(document.current(STARTING)).toEqual({ document: STARTING, source: "starting" });
  });

  /** Une version retirée ne se réemploie pas : l'historique est en ajout seul. */
  it("numérote la publication suivante après la version retirée", () => {
    const document = published();
    document.revert(2, STAMP);
    document.saveDraft(REVERSED, DECLARATION, 3, STAMP);
    expect(document.publish(DECLARATION, 4, STAMP)?.version).toBe(2);
  });

  it("rend null quand il n'y avait qu'un brouillon", () => {
    const document = MailTemplateDocument.untouched(TEMPLATE);
    document.saveDraft(REVERSED, DECLARATION, 0, STAMP);
    expect(document.revert(1, STAMP)).toBeNull();
  });

  it("refuse un e-mail déjà à son arrangement d'origine", () => {
    expect(() => MailTemplateDocument.untouched(TEMPLATE).revert(0, STAMP)).toThrow(
      NothingToRevertError,
    );
  });
});
