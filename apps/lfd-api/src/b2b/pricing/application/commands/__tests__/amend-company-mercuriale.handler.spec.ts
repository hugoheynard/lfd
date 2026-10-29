/**
 * **Amender une mercuriale** (`plan-tarif-date-sur-une-reference.md`, T2) :
 * l'orchestration — verrou et relecture DANS l'unité de travail, refus avant
 * toute écriture, acte `amended` au journal avec son motif.
 *
 * Ports doublés par de vraies sous-classes. Les dates ne sont comparées qu'à
 * l'horloge figée de la fixture.
 */
import type { AmendCompanyMercurialePayload } from "@lfd/contracts";

import { FixedIdGenerator } from "../../../../../platform/id/fixed-id-generator.js";
import { FixedClock } from "../../../../../platform/time/fixed-clock.js";
import { CompanyMercuriale } from "../../../domain/entities/company-mercuriale.js";
import { PricedCompanyReader } from "../../../domain/ports/priced-company.reader.js";
import {
  AmendedMercurialeNotFoundError,
  PricedCompanyNotFoundError,
  RetroactiveAmendmentError,
  SaleReferenceNotOnSaleError,
} from "../../../domain/pricing-errors.js";
import { InMemorySaleReferences } from "../../../infrastructure/in-memory-sale-references.js";
import { AmendCompanyMercurialeCommand } from "../amend-company-mercuriale.command.js";
import { AmendCompanyMercurialeHandler } from "../amend-company-mercuriale.handler.js";
import {
  LockingMercuriales,
  TracingUnitOfWork,
  type Trace,
} from "./mercuriale-amendment.doubles.js";

const NOW = new Date("2026-03-01T00:00:00.000Z");
const REFERENCES = new InMemorySaleReferences(["VIE-012", "PAI-001-1"], ["PAI-009"]);

class Companies extends PricedCompanyReader {
  constructor(private readonly known: boolean) {
    super();
  }
  exists(): Promise<boolean> {
    return Promise.resolve(this.known);
  }
}

const stored = (companyId = "co_folie"): CompanyMercuriale =>
  CompanyMercuriale.pose(
    "merc_1",
    {
      companyId,
      label: "Mercuriale 2026",
      lines: [{ sku: "VIE-012", tiers: [{ minQuantity: 1, unitPriceMillicents: 173_270 }] }],
      validFrom: new Date("2026-01-01T00:00:00.000Z"),
      validTo: new Date("2026-12-31T00:00:00.000Z"),
    },
    "staff|marie",
  );

function setup(options: { known?: boolean; mercuriale?: CompanyMercuriale | null } = {}) {
  const trace: Trace = [];
  const uow = new TracingUnitOfWork(trace);
  const mercuriales = new LockingMercuriales(
    trace,
    uow,
    options.mercuriale === undefined ? stored() : options.mercuriale,
  );
  const handler = new AmendCompanyMercurialeHandler(
    new Companies(options.known ?? true),
    mercuriales,
    REFERENCES,
    new FixedIdGenerator("amd"),
    new FixedClock(NOW),
    uow,
  );
  return { trace, mercuriales, handler };
}

function payload(over: Partial<AmendCompanyMercurialePayload> = {}): AmendCompanyMercurialePayload {
  return {
    validTo: null,
    reason: "Référence ajoutée à la demande du chef",
    lines: [{ sku: "PAI-001-1", unitPriceMillicents: 150_000 }],
    endedSkus: [],
    ...over,
  };
}

const run = (handler: AmendCompanyMercurialeHandler, body = payload()) =>
  handler.execute(new AmendCompanyMercurialeCommand("co_folie", "merc_1", body, "staff|paul"));

describe("AmendCompanyMercurialeHandler", () => {
  it("🔴 verrouille, relit et écrit dans la MÊME unité de travail", async () => {
    const { trace, handler } = setup();

    await run(handler);

    expect(trace).toEqual(["begin", "lock+load (in tx)", "write (in tx)", "end"]);
  });

  it("écrit l'acte `amended` sur le DOCUMENT, daté de la prise d'effet, avec son motif", async () => {
    const { mercuriales, handler } = setup();

    const amendmentId = await run(handler);

    const [written] = mercuriales.written;
    expect(written?.amendmentId).toBe(amendmentId);
    expect(written?.act).toMatchObject({
      subjectType: "mercuriale",
      subjectId: "merc_1",
      kind: "amended",
      actor: "staff|paul",
      // `validFrom` absent = maintenant (seconde contradiction).
      at: NOW,
      reason: "Référence ajoutée à la demande du chef",
      subjectLabel: "Mercuriale 2026",
    });
    expect(written?.act.summary).toMatch(/^Avenant — \+ 1 article/);
  });

  it("refuse une date d'effet passée, sans rien écrire", async () => {
    const { mercuriales, handler } = setup();

    await expect(run(handler, payload({ validFrom: "2026-02-01T00:00:00.000Z" }))).rejects.toThrow(
      RetroactiveAmendmentError,
    );
    expect(mercuriales.written).toEqual([]);
  });

  it("refuse une société inconnue avant tout verrou", async () => {
    const { trace, handler } = setup({ known: false });

    await expect(run(handler)).rejects.toThrow(PricedCompanyNotFoundError);
    expect(trace).toEqual([]);
  });

  it("refuse la mercuriale d'un AUTRE client", async () => {
    const { mercuriales, handler } = setup({ mercuriale: stored("co_other") });

    await expect(run(handler)).rejects.toThrow(AmendedMercurialeNotFoundError);
    expect(mercuriales.written).toEqual([]);
  });

  it("refuse une ligne ouverte sur une référence hors vente (L5)", async () => {
    const { handler } = setup();

    await expect(
      run(handler, payload({ lines: [{ sku: "PAI-404", unitPriceMillicents: 1 }] })),
    ).rejects.toThrow(SaleReferenceNotOnSaleError);
  });

  it("laisse arrêter la ligne d'une référence retirée de la vente", async () => {
    const withdrawn = CompanyMercuriale.pose(
      "merc_1",
      {
        companyId: "co_folie",
        label: "Mercuriale 2026",
        lines: [{ sku: "PAI-009", tiers: [{ minQuantity: 1, unitPriceMillicents: 90_000 }] }],
        validFrom: new Date("2026-01-01T00:00:00.000Z"),
        validTo: null,
      },
      "staff|marie",
    );
    const { mercuriales, handler } = setup({ mercuriale: withdrawn });

    await run(handler, payload({ lines: [], endedSkus: ["PAI-009"] }));

    expect(mercuriales.written[0]?.act.summary).toMatch(/arrêt de 1 article/);
  });
});
