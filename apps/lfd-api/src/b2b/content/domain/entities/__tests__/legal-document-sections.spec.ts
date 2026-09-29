import type { LegalDocumentParagraphPayload, LegalMention } from "@lfd/contracts";

import {
  LegalSectionAlreadyPresentError,
  LegalSectionNotRequiredError,
  RequiredLegalSectionRemovalError,
} from "../../errors/legal-document-errors.js";
import { LegalDocument } from "../legal-document.js";

function prose(word: string): LegalDocumentParagraphPayload {
  return {
    fr: { title: word, body: `Corps ${word}` },
    en: { title: word, body: `Body ${word}` },
    it: { title: word, body: `Corpo ${word}` },
  };
}

function empty(mention: LegalMention): LegalDocument {
  return LegalDocument.reconstitute(
    mention,
    { title: { fr: "Confidentialité", en: "Privacy", it: "Privacy" }, paragraphs: [] },
    3,
  );
}

const sections = (subject: LegalDocument): (string | undefined)[] =>
  subject.snapshot().paragraphs.map((paragraph) => paragraph.section);

describe("les sections requises d'un document légal", () => {
  it("se créent en fin de document, avec leur clé et le texte saisi", () => {
    const subject = empty("privacy");
    subject.addParagraph("a", prose("a"));
    subject.addRequiredSection("s", "dataDeletion", prose("suppression"));

    expect(subject.snapshot().paragraphs[1]).toEqual({
      id: "s",
      ...prose("suppression"),
      section: "dataDeletion",
    });
  });

  it("refusent une clé que la mention n'exige pas", () => {
    expect(() => empty("cookies").addRequiredSection("s", "dataDeletion", prose("x"))).toThrow(
      LegalSectionNotRequiredError,
    );
  });

  it("refusent un doublon de clé", () => {
    const subject = empty("privacy");
    subject.addRequiredSection("s1", "dataDeletion", prose("x"));

    expect(() => subject.addRequiredSection("s2", "dataDeletion", prose("y"))).toThrow(
      LegalSectionAlreadyPresentError,
    );
    expect(sections(subject)).toEqual(["dataDeletion"]);
  });

  it("ne se suppriment pas, et le message dit le geste de sortie", () => {
    const subject = empty("privacy");
    subject.addRequiredSection("s", "dataDeletion", prose("x"));

    expect(() => subject.removeParagraph("s")).toThrow(RequiredLegalSectionRemovalError);
    expect(() => subject.removeParagraph("s")).toThrow(/modifiez son texte/);
  });

  /** Régression (§4.5, B1) : la réécriture effaçait la clé de section. */
  it("gardent leur clé quand on réécrit leur texte", () => {
    const subject = empty("privacy");
    subject.addRequiredSection("s", "dataDeletion", prose("x"));
    subject.editParagraph("s", prose("x-v2"));

    expect(subject.snapshot().paragraphs[0]).toMatchObject({
      section: "dataDeletion",
      fr: { title: "x-v2" },
    });
  });

  it("se déplacent comme un article ordinaire", () => {
    const subject = empty("privacy");
    subject.addParagraph("a", prose("a"));
    subject.addRequiredSection("s", "dataDeletion", prose("x"));
    subject.moveParagraph("s", 0);

    expect(sections(subject)).toEqual(["dataDeletion", undefined]);
  });

  it("un article ordinaire, lui, se supprime toujours", () => {
    const subject = empty("privacy");
    subject.addParagraph("a", prose("a"));
    subject.removeParagraph("a");

    expect(subject.snapshot().paragraphs).toEqual([]);
  });

  it("portent la révision chargée, que l'adaptateur pose en condition d'écriture", () => {
    expect(empty("privacy").revision).toBe(3);
  });
});
