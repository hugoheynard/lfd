import type { SalesTermsDocument } from "@lfd/contracts";

import { FixedIdGenerator } from "../../../../platform/id/fixed-id-generator.js";
import { FixedClock } from "../../../../platform/time/fixed-clock.js";
import {
  StaffAuthorDirectory,
  StaffAuthors,
  type StaffAuthor,
} from "../../../../staff/directory/domain/staff-author-directory.js";
import { MemoryCustomerDocuments } from "../../../orders/application/services/__tests__/order-sheet-doubles.js";
import { LegalDocumentFile } from "../../domain/entities/legal-document-file.js";
import {
  InvalidLegalPdfError,
  LegalDocumentFileAlreadySupersededError,
  NoLegalDocumentFileError,
  UnknownLegalDocumentFileError,
} from "../../domain/errors/legal-document-file-errors.js";
import { LegalDocumentFileReader } from "../../domain/legal-document-file.reader.js";
import { LegalDocumentFileRepository } from "../../domain/legal-document-file.repository.js";
import { DepositLegalDocumentFileCommand } from "../deposit-legal-document-file.command.js";
import { DepositLegalDocumentFileHandler } from "../deposit-legal-document-file.handler.js";
import { GetLegalDocumentFileHandler } from "../get-legal-document-file.handler.js";
import { GetLegalDocumentFileQuery } from "../get-legal-document-file.query.js";
import { ListLegalDocumentFilesHandler } from "../list-legal-document-files.handler.js";
import { ListLegalDocumentFilesQuery } from "../list-legal-document-files.query.js";

// Comparée seulement aux dates qu'elle produit, jamais à l'horloge du mur.
const NOW = new Date("2026-10-12T08:00:00.000Z");
const PDF = Buffer.from("%PDF-1.7\nles CGV des juristes", "latin1");

/**
 * Les dépôts en mémoire, qui jouent les DEUX ports (écriture et lecture) sur
 * le même état — et qui tiennent, comme la base, « un seul en vigueur ».
 */
class MemoryFiles extends LegalDocumentFileRepository {
  readonly rows: LegalDocumentFile[] = [];
  /** Simule un dépôt concurrent qui a remplacé le PDF entre lecture et écriture. */
  raceLost = false;

  current(document: SalesTermsDocument): Promise<LegalDocumentFile | null> {
    const found = this.rows.find((row) => row.document === document && row.supersededAt === null);
    return Promise.resolve(found === undefined ? null : rehydrate(found));
  }

  deposit(
    file: LegalDocumentFile,
    replaced: LegalDocumentFile | null,
    documentTitle: string,
  ): Promise<void> {
    if (this.raceLost) {
      return Promise.reject(new LegalDocumentFileAlreadySupersededError(documentTitle));
    }
    if (replaced !== null) {
      const index = this.rows.findIndex((row) => row.id === replaced.id);
      this.rows[index] = rehydrate(replaced);
    }
    this.rows.push(rehydrate(file));
    return Promise.resolve();
  }
}

class MemoryFilesReader extends LegalDocumentFileReader {
  constructor(private readonly files: MemoryFiles) {
    super();
  }

  history(document: SalesTermsDocument): Promise<readonly LegalDocumentFile[]> {
    return Promise.resolve(this.files.rows.filter((row) => row.document === document).reverse());
  }

  current(document: SalesTermsDocument): Promise<LegalDocumentFile | null> {
    return this.files.current(document);
  }

  byId(document: SalesTermsDocument, fileId: string): Promise<LegalDocumentFile | null> {
    const found = this.files.rows.find((row) => row.id === fileId && row.document === document);
    return Promise.resolve(found ?? null);
  }
}

/** Une copie : ce que le port rend n'est pas l'objet que la mémoire garde. */
function rehydrate(file: LegalDocumentFile): LegalDocumentFile {
  return LegalDocumentFile.reconstitute(file.toState());
}

const CAMILLE: StaffAuthor = {
  staffUserId: "staff_1",
  firstName: "Camille",
  lastName: "Martin",
  role: "admin",
  roleLabel: "Administrateur",
  jobTitle: "",
};

class OneAuthor extends StaffAuthorDirectory {
  identify(): Promise<StaffAuthors> {
    return Promise.resolve(new StaffAuthors(new Map([["staff_1", CAMILLE]])));
  }
}

function scene() {
  const files = new MemoryFiles();
  const store = new MemoryCustomerDocuments();
  const clock = new FixedClock(NOW);
  const deposit = new DepositLegalDocumentFileHandler(
    files,
    store,
    new FixedIdGenerator("ldf"),
    clock,
  );
  const reader = new MemoryFilesReader(files);
  const list = new ListLegalDocumentFilesHandler(reader, new OneAuthor());
  const get = new GetLegalDocumentFileHandler(reader, store);
  return { files, store, clock, deposit, list, get };
}

describe("DepositLegalDocumentFileHandler", () => {
  it("range le PDF sous une clé neuve et enregistre son empreinte", async () => {
    const { deposit, store, files } = scene();

    const id = await deposit.execute(
      new DepositLegalDocumentFileCommand("salesTermsPro", PDF, "staff_1"),
    );

    expect(id).toBe("ldf_000001");
    expect(store.objects.get("legal/sales-terms-pro/ldf_000001.pdf")?.contentType).toBe(
      "application/pdf",
    );
    const state = files.rows[0]?.toState();
    expect(state).toMatchObject({ sizeBytes: PDF.length, uploadedAt: NOW, supersededAt: null });
    expect(state?.sha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it("le dépôt suivant REMPLACE le précédent sans l'écraser", async () => {
    const { deposit, store, files } = scene();
    await deposit.execute(new DepositLegalDocumentFileCommand("salesTerms", PDF, "staff_1"));

    await deposit.execute(new DepositLegalDocumentFileCommand("salesTerms", PDF, "staff_1"));

    expect(files.rows.map((row) => row.supersededAt)).toEqual([NOW, null]);
    expect([...store.objects.keys()]).toEqual([
      "legal/sales-terms/ldf_000001.pdf",
      "legal/sales-terms/ldf_000002.pdf",
    ]);
  });

  it("les deux textes ont chacun leur PDF en vigueur", async () => {
    const { deposit, files } = scene();
    await deposit.execute(new DepositLegalDocumentFileCommand("salesTerms", PDF, "staff_1"));

    await deposit.execute(new DepositLegalDocumentFileCommand("salesTermsPro", PDF, "staff_1"));

    expect(files.rows.every((row) => row.supersededAt === null)).toBe(true);
  });

  it("refuse un fichier qui n'est pas un PDF, avant de rien ranger", async () => {
    const { deposit, store, files } = scene();
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

    await expect(
      deposit.execute(new DepositLegalDocumentFileCommand("salesTerms", png, "staff_1")),
    ).rejects.toBeInstanceOf(InvalidLegalPdfError);
    expect(store.objects.size).toBe(0);
    expect(files.rows).toEqual([]);
  });

  it("laisse remonter la course perdue contre un autre dépôt", async () => {
    const { deposit, files } = scene();
    files.raceLost = true;

    await expect(
      deposit.execute(new DepositLegalDocumentFileCommand("salesTerms", PDF, "staff_1")),
    ).rejects.toBeInstanceOf(LegalDocumentFileAlreadySupersededError);
  });
});

describe("ListLegalDocumentFilesHandler", () => {
  it("rend l'historique, le plus récent d'abord, auteurs nommés par l'annuaire", async () => {
    const { deposit, list } = scene();
    await deposit.execute(new DepositLegalDocumentFileCommand("salesTerms", PDF, "staff_1"));
    await deposit.execute(new DepositLegalDocumentFileCommand("salesTerms", PDF, "staff_2"));

    const view = await list.execute(new ListLegalDocumentFilesQuery("salesTerms"));

    expect(view.files.map((file) => [file.id, file.uploadedByName, file.supersededAt])).toEqual([
      ["ldf_000002", null, null],
      ["ldf_000001", "Camille Martin", NOW.toISOString()],
    ]);
  });
});

describe("GetLegalDocumentFileHandler", () => {
  it("sert le PDF en vigueur sous un nom daté", async () => {
    const { deposit, get } = scene();
    await deposit.execute(new DepositLegalDocumentFileCommand("salesTermsPro", PDF, "staff_1"));

    const download = await get.execute(new GetLegalDocumentFileQuery("salesTermsPro", null));

    expect(download.bytes.equals(PDF)).toBe(true);
    expect(download.fileName).toBe("cgv-professionnels-2026-10-12.pdf");
  });

  it("sert un dépôt remplacé par son id — le PDF qu'une commande porte", async () => {
    const { deposit, get } = scene();
    await deposit.execute(new DepositLegalDocumentFileCommand("salesTerms", PDF, "staff_1"));
    await deposit.execute(new DepositLegalDocumentFileCommand("salesTerms", PDF, "staff_1"));

    const download = await get.execute(new GetLegalDocumentFileQuery("salesTerms", "ldf_000001"));

    expect(download.bytes.equals(PDF)).toBe(true);
  });

  it("aucun PDF déposé : 404 qui renvoie au texte en ligne", async () => {
    const { get } = scene();

    await expect(
      get.execute(new GetLegalDocumentFileQuery("salesTermsPro", null)),
    ).rejects.toBeInstanceOf(NoLegalDocumentFileError);
  });

  it("un id d'un AUTRE texte rend 404, pas l'autre PDF", async () => {
    const { deposit, get } = scene();
    await deposit.execute(new DepositLegalDocumentFileCommand("salesTerms", PDF, "staff_1"));

    await expect(
      get.execute(new GetLegalDocumentFileQuery("salesTermsPro", "ldf_000001")),
    ).rejects.toBeInstanceOf(UnknownLegalDocumentFileError);
  });
});
