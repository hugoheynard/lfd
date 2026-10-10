import {
  DEFAULT_FOOTER_CONTENT,
  DEFAULT_LEGAL_DOCUMENT,
  type FooterContent,
  type FooterContentView,
  type LegalDocument as LegalDocumentContent,
  type LegalDocumentParagraphPayload,
  type LegalDocumentView,
  type LegalMention,
} from "@lfd/contracts";

import { LegalDocument } from "../../domain/entities/legal-document.js";
import { LegalDocumentChangedError } from "../../domain/errors/legal-document-errors.js";
import { PlatformContentRepository } from "../../domain/platform-content.repository.js";

/** La mention par défaut des cas qui n'en éprouvent qu'une seule. */
export const SALES_TERMS: LegalMention = "salesTerms";

/** Un article reconnaissable à son mot-clé, dans les trois langues. */
export function prose(word: string): LegalDocumentParagraphPayload {
  return {
    fr: { title: word, body: `Corps ${word}` },
    en: { title: word, body: `Body ${word}` },
    it: { title: word, body: `Corpo ${word}` },
  };
}

/**
 * Un double du port — une classe qui étend l'abstraite, pas un module moqué.
 *
 * Il tient l'état **par mention**, chacune sous la forme d'un document du
 * contrat, exactement comme l'adaptateur tient une ligne par clé : c'est ce qui
 * fait que `load → save` s'y comporte comme en base, révision comprise, et que
 * deux mentions ne peuvent pas se marcher dessus par accident du double.
 */
export class FakeContentRepository extends PlatformContentRepository {
  private readonly stored = new Map<LegalMention, LegalDocumentContent>();
  private readonly counts = new Map<LegalMention, number>();
  saves = 0;
  lastAuthor: string | null = null;

  content(mention: LegalMention = SALES_TERMS): LegalDocumentContent {
    return this.stored.get(mention) ?? DEFAULT_LEGAL_DOCUMENT(mention);
  }

  readFooter(): Promise<FooterContentView> {
    return Promise.resolve({
      content: DEFAULT_FOOTER_CONTENT,
      revision: 0,
      updatedAt: new Date(0).toISOString(),
      updatedBy: null,
    });
  }

  saveFooter(content: FooterContent, staffUserId: string): Promise<FooterContentView> {
    return Promise.resolve({
      content,
      revision: 1,
      updatedAt: new Date(0).toISOString(),
      updatedBy: staffUserId,
    });
  }

  readLegalDocument(mention: LegalMention): Promise<LegalDocumentView> {
    return Promise.resolve({
      // Le repli d'AFFICHAGE : jamais `null`, jamais sans titre.
      content: this.content(mention),
      revision: this.counts.get(mention) ?? 0,
      updatedAt: new Date(0).toISOString(),
      updatedBy: this.lastAuthor,
    });
  }

  /** La révision courante — ce qu'un écran à jour a lu. */
  revision(mention: LegalMention = SALES_TERMS): number {
    return this.counts.get(mention) ?? 0;
  }

  loadLegalDocument(mention: LegalMention, expectedRevision: number): Promise<LegalDocument> {
    const revision = this.revision(mention);
    if (revision !== expectedRevision) {
      return Promise.reject(new LegalDocumentChangedError(expectedRevision, "document"));
    }
    return Promise.resolve(LegalDocument.reconstitute(mention, this.content(mention), revision));
  }

  saveLegalDocument(
    mention: LegalMention,
    document: LegalDocument,
    staffUserId: string,
  ): Promise<void> {
    // Le même verrou que l'adaptateur : l'écriture est conditionnée à la
    // révision CHARGÉE, pas seulement vérifiée au chargement.
    if (document.revision !== this.revision(mention)) {
      return Promise.reject(new LegalDocumentChangedError(document.revision, "document"));
    }
    this.stored.set(mention, document.snapshot());
    this.counts.set(mention, (this.counts.get(mention) ?? 0) + 1);
    this.saves += 1;
    this.lastAuthor = staffUserId;
    return Promise.resolve();
  }
}

/** Les identifiants d'articles d'une mention, dans l'ordre du document. */
export const ids = (
  repository: FakeContentRepository,
  mention: LegalMention = SALES_TERMS,
): string[] => repository.content(mention).paragraphs.map((paragraph) => paragraph.id);
