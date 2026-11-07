import type { MailDocument, MailLocale, MailTemplateDeclaration } from "@lfd/mail-blocks";

import type { MailTextsByMail } from "../../../copy/domain/mail-copy-texts.js";
import type { MailSpecimenRendering } from "../../../copy/domain/ports/mail-specimen.renderer.js";
import { MailDocumentChangedError } from "../../domain/mail-document-errors.js";
import {
  MailTemplateDocument,
  type MailTemplateDocumentState,
} from "../../domain/mail-template-document.js";
import {
  MailDocumentReader,
  type MailDocumentVersionRecord,
} from "../../domain/ports/mail-document.reader.js";
import { MailDocumentImages } from "../../domain/ports/mail-document-images.js";
import { MailDocumentPreviewRenderer } from "../../domain/ports/mail-document-preview.renderer.js";
import {
  MailTemplateCatalogue,
  type MailTemplateEntry,
} from "../../domain/ports/mail-template-catalogue.js";
import { MailTemplateDocumentRepository } from "../../domain/ports/mail-template-document.repository.js";

/** Le document d'e-mail en mémoire, avec le MÊME verrou que l'adaptateur. */
export class InMemoryMailDocuments extends MailTemplateDocumentRepository {
  readonly rows = new Map<string, MailTemplateDocumentState>();
  readonly versions: { template: string; record: MailDocumentVersionRecord }[] = [];
  saves = 0;

  load(template: string): Promise<MailTemplateDocument> {
    const state = this.rows.get(template);
    return Promise.resolve(
      state === undefined
        ? MailTemplateDocument.untouched(template)
        : MailTemplateDocument.reconstitute(state),
    );
  }

  save(document: MailTemplateDocument): Promise<void> {
    if ((this.rows.get(document.template)?.revision ?? 0) !== document.loadedRevision) {
      return Promise.reject(new MailDocumentChangedError(document.template));
    }
    this.saves += 1;
    this.rows.set(document.template, document.snapshot());
    const appended = document.appendedVersion;
    if (appended !== null) {
      this.versions.push({
        template: document.template,
        record: { version: appended.version, stamp: appended.stamp },
      });
    }
    return Promise.resolve();
  }
}

/** La lecture de l'éditeur, sur le même état. */
export class InMemoryMailDocumentReader extends MailDocumentReader {
  constructor(private readonly documents: InMemoryMailDocuments) {
    super();
  }

  all(): Promise<readonly MailTemplateDocumentState[]> {
    return Promise.resolve([...this.documents.rows.values()]);
  }

  stateOf(template: string): Promise<MailTemplateDocumentState | null> {
    return Promise.resolve(this.documents.rows.get(template) ?? null);
  }

  versions(template: string): Promise<readonly MailDocumentVersionRecord[]> {
    return Promise.resolve(
      this.documents.versions
        .filter((entry) => entry.template === template)
        .map((entry) => entry.record)
        .reverse(),
    );
  }
}

/** Un registre réduit à ce qu'on lui donne. */
export class FixedCatalogue extends MailTemplateCatalogue {
  constructor(private readonly entries: readonly MailTemplateEntry[]) {
    super();
  }

  list(): readonly MailTemplateEntry[] {
    return this.entries;
  }

  find(template: string): MailTemplateEntry | null {
    return this.entries.find((entry) => entry.template === template) ?? null;
  }
}

/** Un aperçu qui garde ce qu'on lui demande de rendre. */
export class RecordingDocumentRenderer extends MailDocumentPreviewRenderer {
  readonly calls: {
    template: string;
    caseId: string;
    locale: MailLocale;
    texts: MailTextsByMail;
    document: MailDocument;
  }[] = [];

  render(
    template: string,
    caseId: string,
    locale: MailLocale,
    texts: MailTextsByMail,
    document: MailDocument,
  ): MailSpecimenRendering {
    this.calls.push({ template, caseId, locale, texts, document });
    return { subject: "Exemple", html: "<p>exemple</p>", attachments: [] };
  }
}

/** Une entrée du registre pour les tests. */
export function entryOf(template: string, declaration: MailTemplateDeclaration): MailTemplateEntry {
  return {
    template,
    audience: "customer",
    family: "order",
    declaration,
    cases: [{ id: "specimen", label: "Exemple" }],
  };
}

/**
 * La copie des images, doublée : chaque adresse rend une copie sous
 * `COPY_BASE`, une adresse de `refused` rejette l'erreur donnée. Les appels
 * sont gardés, dans l'ordre.
 */
export class RecordingDocumentImages extends MailDocumentImages {
  static readonly COPY_BASE = "https://mail.lfc.test/templates/";
  readonly calls: string[] = [];

  constructor(private readonly refused: ReadonlyMap<string, Error> = new Map()) {
    super();
  }

  copy(sourceUrl: string): Promise<string> {
    this.calls.push(sourceUrl);
    const refusal = this.refused.get(sourceUrl);
    if (refusal !== undefined) {
      return Promise.reject(refusal);
    }
    const name = sourceUrl.split("/").at(-1) ?? "image";
    return Promise.resolve(`${RecordingDocumentImages.COPY_BASE}${name}`);
  }
}
