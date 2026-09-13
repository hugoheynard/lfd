import {
  MAX_LEGAL_DOCUMENT_PARAGRAPHS,
  type LegalDocument as LegalDocumentContent,
  type LegalDocumentParagraphPayload,
} from "@lfd/contracts";

import {
  DuplicateLegalDocumentParagraphError,
  LegalDocumentFullError,
  LegalDocumentPositionOutOfRangeError,
  UnknownLegalDocumentParagraphError,
} from "../../errors/legal-document-errors.js";
import { LegalDocument } from "../legal-document.js";

/** Un article reconnaissable à son seul mot-clé, dans les trois langues. */
function prose(word: string): LegalDocumentParagraphPayload {
  return {
    fr: { title: word, body: `Corps ${word}` },
    en: { title: word, body: `Body ${word}` },
    it: { title: word, body: `Corpo ${word}` },
  };
}

const HEADING = { fr: "Conditions", en: "Terms", it: "Condizioni" };

function document(...ids: readonly string[]): LegalDocument {
  const content: LegalDocumentContent = {
    title: HEADING,
    paragraphs: ids.map((id) => ({ id, ...prose(id) })),
  };
  return LegalDocument.reconstitute(content);
}

const order = (subject: LegalDocument): string[] =>
  subject.snapshot().paragraphs.map((paragraph) => paragraph.id);

describe("le titre du document", () => {
  it("se remplace dans les trois langues d'un coup", () => {
    const subject = document("a");
    subject.retitle({ fr: "CGV", en: "T&C", it: "CGV it" });

    expect(subject.snapshot().title).toEqual({ fr: "CGV", en: "T&C", it: "CGV it" });
  });
});

describe("ajouter un article", () => {
  it("le pose EN FIN de document — l'ordre porte du sens", () => {
    const subject = document("a", "b");
    subject.addParagraph("c", prose("c"));

    expect(order(subject)).toEqual(["a", "b", "c"]);
  });

  it("refuse un document plein", () => {
    const full = document(
      ...Array.from({ length: MAX_LEGAL_DOCUMENT_PARAGRAPHS }, (_unused, index) => `p${index}`),
    );

    expect(() => full.addParagraph("un-de-trop", prose("x"))).toThrow(LegalDocumentFullError);
  });

  it("refuse un identifiant déjà pris", () => {
    const subject = document("a");

    // Impossible tant que l'identifiant vient d'`IdGenerator` — refusé ici pour
    // que ça le reste : le contrat interdit le doublon à la relecture, donc
    // sans ce refus le document deviendrait illisible APRÈS coup.
    expect(() => subject.addParagraph("a", prose("a"))).toThrow(
      DuplicateLegalDocumentParagraphError,
    );
  });
});

describe("modifier un article", () => {
  it("réécrit le texte sans toucher à l'identifiant, qui est ce que les routes désignent", () => {
    const subject = document("a", "b");
    subject.editParagraph("a", prose("réécrit"));

    const [first] = subject.snapshot().paragraphs;
    expect(first?.id).toBe("a");
    expect(first?.fr.title).toBe("réécrit");
  });

  it("refuse un article inconnu", () => {
    expect(() => document("a").editParagraph("zzz", prose("x"))).toThrow(
      UnknownLegalDocumentParagraphError,
    );
  });

  /**
   * Le refus est lu par un rédacteur qui a « Conditions » en tête de son écran,
   * pas `salesTerms` : le message nomme donc le document tel qu'il s'appelle,
   * et suit un renommage sans que personne ait à y penser.
   */
  it("nomme le document dans son refus, pas la clé de la mention", () => {
    const subject = document("a");
    subject.retitle({ fr: "Politique de confidentialité", en: "Privacy", it: "Privacy it" });

    expect(() => subject.editParagraph("zzz", prose("x"))).toThrow(/Politique de confidentialité/);
  });
});

describe("retirer un article", () => {
  it("le retire et laisse l'ordre des autres intact", () => {
    const subject = document("a", "b", "c");
    subject.removeParagraph("b");

    expect(order(subject)).toEqual(["a", "c"]);
  });

  it("refuse un article inconnu", () => {
    expect(() => document("a").removeParagraph("zzz")).toThrow(UnknownLegalDocumentParagraphError);
  });
});

describe("déplacer un article", () => {
  it("remonte au rang 0 — le premier bout", () => {
    const subject = document("a", "b", "c");
    subject.moveParagraph("c", 0);

    expect(order(subject)).toEqual(["c", "a", "b"]);
  });

  it("descend au dernier rang — l'autre bout", () => {
    const subject = document("a", "b", "c");
    subject.moveParagraph("a", 2);

    expect(order(subject)).toEqual(["b", "c", "a"]);
  });

  it("laisse l'ordre inchangé quand un article est déplacé sur sa propre place", () => {
    const subject = document("a", "b", "c");
    subject.moveParagraph("b", 1);

    expect(order(subject)).toEqual(["a", "b", "c"]);
  });

  it("refuse un rang au-delà du dernier — la borne haute dépend du document", () => {
    // Trois articles : les rangs vont de 0 à 2. C'est cette borne-là qu'aucun
    // schéma ne peut porter, puisqu'elle dépend de l'état courant.
    expect(() => document("a", "b", "c").moveParagraph("a", 3)).toThrow(
      LegalDocumentPositionOutOfRangeError,
    );
  });

  it("refuse un rang négatif", () => {
    expect(() => document("a", "b").moveParagraph("a", -1)).toThrow(
      LegalDocumentPositionOutOfRangeError,
    );
  });

  it("refuse un article inconnu AVANT de regarder le rang", () => {
    // L'ordre des gardes compte : un rang valide sur un article absent doit
    // ressortir en 404, pas en 400.
    expect(() => document("a", "b").moveParagraph("zzz", 0)).toThrow(
      UnknownLegalDocumentParagraphError,
    );
  });
});

describe("le cliché", () => {
  it("ne laisse muter le document ni par son entrée ni par sa sortie", () => {
    const content: LegalDocumentContent = {
      title: HEADING,
      paragraphs: [{ id: "a", ...prose("a") }],
    };
    const subject = LegalDocument.reconstitute(content);

    content.paragraphs.push({ id: "intrus", ...prose("intrus") });
    subject.snapshot().paragraphs.push({ id: "autre-intrus", ...prose("x") });

    expect(order(subject)).toEqual(["a"]);
  });
});
