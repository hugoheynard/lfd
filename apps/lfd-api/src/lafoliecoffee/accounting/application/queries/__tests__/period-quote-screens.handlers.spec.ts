import { Buffer } from "node:buffer";

import type { CompanyPeriodQuoteView } from "@lfd/contracts";

import { FixedClock } from "../../../../../platform/time/fixed-clock.js";
import type { PeriodQuoteSnapshot } from "../../../domain/entities/period-quote.js";
import {
  PeriodQuoteCompanyNotFoundError,
  PeriodQuoteDocumentNotRenderedError,
  PeriodQuoteNotFoundError,
} from "../../../domain/errors/period-quote-errors.js";
import { CompanyPeriodQuotesReader } from "../../../domain/ports/company-period-quotes.reader.js";
import type { PayerStanding } from "../../../domain/ports/payer-standing.reader.js";
import { PeriodQuoteReader } from "../../../domain/ports/period-quote.reader.js";
import { paris } from "../../../domain/services/__tests__/billing-mode-fixtures.js";
import { FixedStandings, PAYER } from "../../commands/__tests__/billing-mode-doubles.js";
import { MemoryKeptStore } from "../../services/__tests__/issued-invoice-doubles.js";
import { GetPeriodQuoteDocumentHandler } from "../get-period-quote-document.handler.js";
import { GetPeriodQuoteDocumentQuery } from "../get-period-quote-document.query.js";
import { ListCompanyPeriodQuotesHandler } from "../list-company-period-quotes.handler.js";
import { ListCompanyPeriodQuotesQuery } from "../list-company-period-quotes.query.js";

/**
 * Les écrans du devis de période (QD7) : la liste d'une fiche client, qui
 * suit le PAYEUR, et le PDF rangé d'une version.
 */

const NOW = paris("2026-11-24", "10:00");

/** Une société qui suit la facturation de `PAYER` à partir de `validFrom`, jusqu'à `validTo`. */
function site(companyId: string, name: string, validTo: Date | null): PayerStanding {
  return {
    companyId,
    name,
    active: true,
    public: true,
    follows: [
      {
        companyId,
        payerId: PAYER.companyId,
        payerName: PAYER.name,
        validFrom: paris("2026-01-01"),
        validTo,
      },
    ],
  };
}

/** Un site qui suit encore `PAYER`, et un autre qui l'a quitté. */
const SITE = site("cmp_site", "Le Site", null);
const LEFT = site("cmp_left", "L'Ancien Site", paris("2026-06-01"));

const QUOTE_VIEW: CompanyPeriodQuoteView = {
  quoteId: "pq_2",
  number: "D-20261031-1",
  version: 2,
  state: "awaiting",
  periodStartsAt: "2026-09-30T22:00:00.000Z",
  periodClosesAt: "2026-10-31T23:00:00.000Z",
  serviceCode: null,
  totalCents: 12_000,
  orderCount: 2,
  createdAt: "2026-11-02T08:00:00.000Z",
  replaced: { totalCents: 10_000, gapCents: 2_000 },
  invoice: null,
};

/** Rend la liste de chaque payeur qu'on lui demande, et note qui. */
class RecordingQuotes extends CompanyPeriodQuotesReader {
  readonly asked: string[] = [];
  liveOf(payerCompanyId: string): Promise<readonly CompanyPeriodQuoteView[]> {
    this.asked.push(payerCompanyId);
    return Promise.resolve(payerCompanyId === PAYER.companyId ? [QUOTE_VIEW] : []);
  }
}

function listing(): { handler: ListCompanyPeriodQuotesHandler; quotes: RecordingQuotes } {
  const quotes = new RecordingQuotes();
  const handler = new ListCompanyPeriodQuotesHandler(
    new FixedStandings([PAYER, SITE, LEFT]),
    quotes,
    new FixedClock(NOW),
  );
  return { handler, quotes };
}

describe("ListCompanyPeriodQuotesHandler", () => {
  it("rend les devis du payeur sur sa propre fiche", async () => {
    const { handler } = listing();
    await expect(
      handler.execute(new ListCompanyPeriodQuotesQuery(PAYER.companyId)),
    ).resolves.toEqual({
      payerCompanyId: PAYER.companyId,
      payerName: PAYER.name,
      quotes: [QUOTE_VIEW],
    });
  });

  it("rend, sur la fiche d'un site, les devis du payeur qu'il suit", async () => {
    const { handler, quotes } = listing();
    const view = await handler.execute(new ListCompanyPeriodQuotesQuery(SITE.companyId));
    expect(view).toEqual({
      payerCompanyId: PAYER.companyId,
      payerName: PAYER.name,
      quotes: [QUOTE_VIEW],
    });
    expect(quotes.asked).toEqual([PAYER.companyId]);
  });

  it("lit le site lui-même quand sa période de suivi est close", async () => {
    const { handler, quotes } = listing();
    const view = await handler.execute(new ListCompanyPeriodQuotesQuery(LEFT.companyId));
    expect(view).toEqual({ payerCompanyId: LEFT.companyId, payerName: LEFT.name, quotes: [] });
    expect(quotes.asked).toEqual([LEFT.companyId]);
  });

  it("refuse une société inconnue, sans lire de devis", async () => {
    const { handler, quotes } = listing();
    await expect(
      handler.execute(new ListCompanyPeriodQuotesQuery("cmp_inconnue")),
    ).rejects.toBeInstanceOf(PeriodQuoteCompanyNotFoundError);
    expect(quotes.asked).toEqual([]);
  });
});

const SNAPSHOT: PeriodQuoteSnapshot = {
  id: "pq_2",
  number: "D-20261031-1",
  version: 2,
  legalEntityId: "le_1",
  payerCompanyId: PAYER.companyId,
  payerName: PAYER.name,
  mandateId: null,
  serviceCode: "",
  periodStartsAt: paris("2026-10-01"),
  periodClosesAt: paris("2026-11-01"),
  state: "awaiting",
  fingerprint: "f".repeat(64),
  totalTtcCents: 12_000,
  orderIds: ["ord_1"],
  invoiceId: null,
  createdAt: paris("2026-11-02", "09:00"),
};

class OneQuote extends PeriodQuoteReader {
  byId(quoteId: string): Promise<PeriodQuoteSnapshot | null> {
    return Promise.resolve(quoteId === SNAPSHOT.id ? SNAPSHOT : null);
  }
}

describe("GetPeriodQuoteDocumentHandler", () => {
  it("relit le PDF rangé de la version, sous son nom", async () => {
    const store = new MemoryKeptStore();
    const bytes = Buffer.from("%PDF-1.7 devis");
    await store.save("quotes/le_1/D-20261031-1-v2.pdf", { bytes, contentType: "application/pdf" });
    const handler = new GetPeriodQuoteDocumentHandler(new OneQuote(), store);

    const document = await handler.execute(new GetPeriodQuoteDocumentQuery("pq_2"));

    expect(document.fileName).toBe("D-20261031-1-v2.pdf");
    expect(document.bytes.equals(bytes)).toBe(true);
    expect(store.saved).toEqual(["quotes/le_1/D-20261031-1-v2.pdf"]);
  });

  it("refuse en le nommant un document pas encore rendu, sans rien rendre", async () => {
    const store = new MemoryKeptStore();
    const handler = new GetPeriodQuoteDocumentHandler(new OneQuote(), store);
    await expect(handler.execute(new GetPeriodQuoteDocumentQuery("pq_2"))).rejects.toBeInstanceOf(
      PeriodQuoteDocumentNotRenderedError,
    );
    expect(store.saved).toEqual([]);
  });

  it("refuse un devis inconnu", async () => {
    const handler = new GetPeriodQuoteDocumentHandler(new OneQuote(), new MemoryKeptStore());
    await expect(
      handler.execute(new GetPeriodQuoteDocumentQuery("pq_inconnu")),
    ).rejects.toBeInstanceOf(PeriodQuoteNotFoundError);
  });
});
