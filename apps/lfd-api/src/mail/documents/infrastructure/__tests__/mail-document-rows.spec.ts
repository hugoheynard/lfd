import type { MailDocument } from "@lfd/mail-blocks";

import { parseMailDocument } from "../../application/mail-document-shape.js";
import { StoredMailDocumentUnreadableError } from "../../domain/mail-document-errors.js";
import {
  mailDocumentJson,
  toDocumentColumns,
  toDocumentState,
  type MailDocumentRow,
} from "../mail-document-rows.js";

const TEMPLATE = "customer.order-ready";
const DOCUMENT: MailDocument = {
  template: TEMPLATE,
  blocks: [
    { id: "model:title", kind: "model", section: "title" },
    { id: "note", kind: "callout", tone: "warning", text: { fr: "Fermé", en: "Closed" } },
    {
      id: "cols",
      kind: "columns",
      widths: [33, 67],
      cells: [
        [{ id: "h", kind: "heading", text: { fr: "Titre" } }],
        [{ id: "d", kind: "divider" }],
      ],
    },
    { id: "go", kind: "button", label: { fr: "Voir" }, href: "https://exemple.invalid" },
  ],
};
const AT = new Date(0);

function row(patch: Partial<MailDocumentRow>): MailDocumentRow {
  return {
    template: TEMPLATE,
    revision: 1,
    draft: null,
    draftAt: null,
    draftBy: null,
    published: null,
    publishedVersion: null,
    publishedAt: null,
    publishedBy: null,
    lastVersion: 0,
    retractedAt: null,
    retractedBy: null,
    ...patch,
  };
}

describe("les colonnes du document d'un e-mail", () => {
  it("relit à l'identique ce qu'elles ont écrit, brouillon et publié", () => {
    const json = JSON.parse(JSON.stringify(mailDocumentJson(DOCUMENT))) as MailDocumentRow["draft"];
    const state = toDocumentState(
      row({
        draft: json,
        draftAt: AT,
        draftBy: "fiche-colette",
        published: json,
        publishedVersion: 2,
        publishedAt: AT,
        publishedBy: "fiche-hugo",
        lastVersion: 2,
      }),
    );
    expect(state.draft).toEqual({
      document: DOCUMENT,
      stamp: { at: AT, staffId: "fiche-colette" },
    });
    expect(state.published).toEqual({
      document: DOCUMENT,
      version: 2,
      stamp: { at: AT, staffId: "fiche-hugo" },
    });
    expect(toDocumentColumns(state)).toMatchObject({
      publishedVersion: 2,
      draftBy: "fiche-colette",
    });
  });

  /** Un document rangé par un autre code : refusé tout haut, jamais deviné. */
  it("refuse une colonne qui n'a pas la forme d'un document", () => {
    expect(() => toDocumentState(row({ draft: { blocks: 3 }, draftAt: AT, draftBy: "x" }))).toThrow(
      StoredMailDocumentUnreadableError,
    );
  });
});

/**
 * Régression (2026-11-07) : l'écriture champ à champ ne rangeait ni `format`,
 * ni `focal`, ni `copySrc` — le cadrage disparaissait à l'enregistrement, et
 * l'envoi retombait sur la source non recadrée.
 */
describe("une image cadrée, rangée puis relue", () => {
  it("garde son format, son point focal et sa copie", () => {
    const framed: MailDocument = {
      template: TEMPLATE,
      blocks: [
        {
          id: "i",
          kind: "image",
          src: "https://media.lfc.test/p.png",
          alt: { fr: "Un pain" },
          format: "3:2",
          focal: { x: 0.2, y: 0.7 },
          copySrc: "https://mail.lfc.test/templates/abc.png",
        },
      ],
    };
    const json = JSON.parse(JSON.stringify(mailDocumentJson(framed))) as MailDocumentRow["draft"];
    expect(
      toDocumentState(row({ draft: json, draftAt: AT, draftBy: "x" })).draft?.document,
    ).toEqual(framed);
  });
});

describe("une image pleine largeur, rangée puis relue (2026-11-08)", () => {
  it("garde sa largeur ; une largeur inconnue n'a pas la forme d'un document", () => {
    const full: MailDocument = {
      template: TEMPLATE,
      blocks: [
        {
          id: "i",
          kind: "image",
          src: "https://media.lfc.test/p.png",
          alt: { fr: "Le fournil" },
          format: "2:1",
          width: "full",
        },
      ],
    };
    const json = JSON.parse(JSON.stringify(mailDocumentJson(full))) as MailDocumentRow["draft"];
    expect(
      toDocumentState(row({ draft: json, draftAt: AT, draftBy: "x" })).draft?.document,
    ).toEqual(full);
    expect(
      parseMailDocument({ ...full, blocks: [{ ...full.blocks[0], width: "wide" }] }),
    ).toBeNull();
  });
});
