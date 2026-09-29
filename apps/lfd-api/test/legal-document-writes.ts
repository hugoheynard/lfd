/**
 * Les gestes d'écriture d'un document légal, partagés par les deux suites e2e
 * (`b2b-legal-documents`, `b2b-legal-sections`).
 *
 * Toute écriture porte la révision que l'écran a lue (plan
 * `legal/plan-page-confidentialite.md` §4.5, B2) : ces aides la LISENT comme
 * l'écran, par la route staff, plutôt que de la compter à la main — un compte
 * faux ferait échouer la suite en 409 sans rien dire de ce qu'elle éprouve.
 */
import type {
  LegalDocumentParagraphCreated,
  LegalDocumentParagraphPayload,
  LegalDocumentView,
  LegalMention,
} from "@lfd/contracts";
import type request from "supertest";

import { jsonBody } from "./e2e-harness.js";

/** Un article reconnaissable à son mot-clé, dans les trois langues. */
export function prose(word: string): LegalDocumentParagraphPayload {
  return {
    fr: { title: `Article ${word}`, body: `Corps français — ${word} · accentué` },
    en: { title: `Clause ${word}`, body: `English body — ${word}` },
    it: { title: `Articolo ${word}`, body: `Corpo italiano — ${word}` },
  };
}

/** Les aides d'écriture, liées à l'agent staff de la suite. */
export function legalDocumentWrites(staff: () => request.Agent) {
  const revisionOf = async (mention: LegalMention): Promise<number> =>
    jsonBody<LegalDocumentView>(await staff().get(`/admin/content/legal/${mention}`).expect(200))
      .revision;

  const withRevision = async <T extends object>(
    payload: T,
    mention: LegalMention,
  ): Promise<T & { readonly expectedRevision: number }> => ({
    ...payload,
    expectedRevision: await revisionOf(mention),
  });

  const addParagraph = async (word: string, mention: LegalMention): Promise<string> =>
    jsonBody<LegalDocumentParagraphCreated>(
      await staff()
        .post(`/admin/content/legal/${mention}/paragraphs`)
        .send(await withRevision(prose(word), mention))
        .expect(201),
    ).id;

  return { revisionOf, withRevision, addParagraph };
}
