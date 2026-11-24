import { randomUUID } from "node:crypto";

import { FixedIdGenerator } from "../../../../platform/id/fixed-id-generator.js";
import { inMemoryIntents } from "../../../../platform/intent/__tests__/in-memory-gesture-intent.ledger.js";
import {
  TransactionalDurablePublisher,
  TransactionalUnitOfWork,
} from "../../../../platform/outbox/__tests__/transactional-durable.js";
import { FixedClock } from "../../../../platform/time/fixed-clock.js";
import { CONTENT_SALES_TERMS_PUBLISHED } from "../../../../recurring/channels/commerce/index.js";
import { MemoryCustomerDocuments } from "../../../orders/application/services/__tests__/order-sheet-doubles.js";
import { InvalidLegalPdfError } from "../../domain/errors/legal-document-file-errors.js";
import { DepositLegalDocumentFileCommand } from "../deposit-legal-document-file.command.js";
import { DepositLegalDocumentFileHandler } from "../deposit-legal-document-file.handler.js";
import { FixedSalesTermsRevisions, MemoryFiles } from "./legal-document-file-doubles.js";

// Comparée seulement aux dates qu'elle produit (le nom du fichier), jamais à l'horloge du mur.
const NOW = new Date("2026-12-05T08:00:00.000Z");
const PDF = Buffer.from("%PDF-1.7\nles CGV des juristes", "latin1");

function scene() {
  const uow = new TransactionalUnitOfWork();
  const files = new MemoryFiles();
  const revisions = new FixedSalesTermsRevisions();
  const deposit = new DepositLegalDocumentFileHandler(
    files,
    new MemoryCustomerDocuments(),
    new FixedIdGenerator("ldf"),
    new FixedClock(NOW),
    uow,
    inMemoryIntents(),
    revisions,
    new TransactionalDurablePublisher(uow),
  );
  return { uow, files, revisions, deposit };
}

describe("le dépôt du PDF des CGV publie la version qu'il porte (Q-B7)", () => {
  it("émet content.sales_terms_published : le texte, sa révision, le PDF figé", async () => {
    const { uow, revisions, deposit } = scene();
    revisions.revisions.set("salesTermsPro", 7);

    await deposit.execute(
      new DepositLegalDocumentFileCommand("salesTermsPro", PDF, "staff_1", randomUUID()),
    );

    expect(uow.of(CONTENT_SALES_TERMS_PUBLISHED)).toEqual([
      {
        type: CONTENT_SALES_TERMS_PUBLISHED,
        key: "content.sales_terms_published:ldf_000001",
        payload: {
          document: "salesTermsPro",
          revision: 7,
          fileId: "ldf_000001",
          storageKey: "legal/sales-terms-pro/ldf_000001.pdf",
          fileName: "cgv-professionnels-2026-12-05.pdf",
        },
      },
    ]);
  });

  it("publie le texte des particuliers sous son propre nom", async () => {
    const { uow, revisions, deposit } = scene();
    revisions.revisions.set("salesTerms", 2);

    await deposit.execute(
      new DepositLegalDocumentFileCommand("salesTerms", PDF, "staff_1", randomUUID()),
    );

    expect(uow.of(CONTENT_SALES_TERMS_PUBLISHED).map((fact) => fact.payload)).toEqual([
      expect.objectContaining({ document: "salesTerms", revision: 2 }),
    ]);
  });

  it("ne publie rien pour un texte jamais écrit : aucun panier n'a pu l'accepter", async () => {
    const { uow, files, deposit } = scene();

    await deposit.execute(
      new DepositLegalDocumentFileCommand("salesTermsPro", PDF, "staff_1", randomUUID()),
    );

    expect(files.rows).toHaveLength(1);
    expect(uow.of(CONTENT_SALES_TERMS_PUBLISHED)).toEqual([]);
  });

  it("un dépôt refusé ne publie rien", async () => {
    const { uow, revisions, deposit } = scene();
    revisions.revisions.set("salesTermsPro", 7);
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

    await expect(
      deposit.execute(
        new DepositLegalDocumentFileCommand("salesTermsPro", png, "staff_1", randomUUID()),
      ),
    ).rejects.toBeInstanceOf(InvalidLegalPdfError);
    expect(uow.of(CONTENT_SALES_TERMS_PUBLISHED)).toEqual([]);
  });

  it("une course perdue contre un autre dépôt annule le fait avec l'écriture", async () => {
    const { uow, files, revisions, deposit } = scene();
    revisions.revisions.set("salesTermsPro", 7);
    files.raceLost = true;

    await expect(
      deposit.execute(
        new DepositLegalDocumentFileCommand("salesTermsPro", PDF, "staff_1", randomUUID()),
      ),
    ).rejects.toThrow();
    expect(uow.of(CONTENT_SALES_TERMS_PUBLISHED)).toEqual([]);
  });
});
