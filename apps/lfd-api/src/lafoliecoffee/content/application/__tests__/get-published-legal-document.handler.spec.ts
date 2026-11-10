import type { SalesTermsDocument } from "@lfd/contracts";

import { LegalDocumentFile } from "../../domain/entities/legal-document-file.js";
import { LegalDocumentFileReader } from "../../domain/legal-document-file.reader.js";
import { GetPublishedLegalDocumentHandler } from "../get-published-legal-document.handler.js";
import { GetPublishedLegalDocumentQuery } from "../get-published-legal-document.query.js";
import { FakeContentRepository } from "./fake-content.repository.js";

// Comparée seulement au nom qu'elle produit, jamais à l'horloge du mur.
const UPLOADED_AT = new Date("2026-10-12T08:00:00.000Z");

/** Le PDF en vigueur par texte ; compte les lectures pour prouver qu'aucune n'est faite hors CGV. */
class CurrentFilesReader extends LegalDocumentFileReader {
  reads = 0;

  constructor(private readonly currentFiles: ReadonlyMap<SalesTermsDocument, LegalDocumentFile>) {
    super();
  }

  history(): Promise<readonly LegalDocumentFile[]> {
    return Promise.resolve([...this.currentFiles.values()]);
  }

  current(document: SalesTermsDocument): Promise<LegalDocumentFile | null> {
    this.reads += 1;
    return Promise.resolve(this.currentFiles.get(document) ?? null);
  }

  byId(): Promise<LegalDocumentFile | null> {
    return Promise.resolve(null);
  }
}

function proPdf(): LegalDocumentFile {
  return LegalDocumentFile.deposit({
    id: "file-pro-1",
    document: "salesTermsPro",
    sha256: "a".repeat(64),
    sizeBytes: 2048,
    uploadedAt: UPLOADED_AT,
    uploadedByStaffId: "staff-1",
  });
}

function handlerWith(files: CurrentFilesReader): GetPublishedLegalDocumentHandler {
  return new GetPublishedLegalDocumentHandler(new FakeContentRepository(), files);
}

describe("GetPublishedLegalDocumentHandler", () => {
  it("annonce le PDF en vigueur d'un texte de CGV, sous son nom daté", async () => {
    const files = new CurrentFilesReader(new Map([["salesTermsPro", proPdf()]]));

    const view = await handlerWith(files).execute(
      new GetPublishedLegalDocumentQuery("salesTermsPro"),
    );

    expect(view.pdf).toEqual({
      fileId: "file-pro-1",
      fileName: "cgv-professionnels-2026-10-12.pdf",
      uploadedAt: UPLOADED_AT.toISOString(),
      sizeBytes: 2048,
    });
    expect(view.revision).toBe(0);
  });

  it("rend `pdf: null` pour des CGV sans dépôt", async () => {
    const files = new CurrentFilesReader(new Map([["salesTermsPro", proPdf()]]));

    const view = await handlerWith(files).execute(new GetPublishedLegalDocumentQuery("salesTerms"));

    expect(view.pdf).toBeNull();
  });

  it("ne cherche aucun PDF pour une mention qui n'est pas un texte de CGV", async () => {
    const files = new CurrentFilesReader(new Map([["salesTerms", proPdf()]]));

    const view = await handlerWith(files).execute(new GetPublishedLegalDocumentQuery("privacy"));

    expect(view.pdf).toBeNull();
    expect(files.reads).toBe(0);
  });

  it("sert les CGU sous leur titre de départ, sans PDF ni lecture de dépôt", async () => {
    const files = new CurrentFilesReader(new Map([["salesTerms", proPdf()]]));

    const view = await handlerWith(files).execute(new GetPublishedLegalDocumentQuery("termsOfUse"));

    expect(view.content.title.fr).toBe("Conditions générales d'utilisation");
    expect(view.pdf).toBeNull();
    expect(files.reads).toBe(0);
  });
});
