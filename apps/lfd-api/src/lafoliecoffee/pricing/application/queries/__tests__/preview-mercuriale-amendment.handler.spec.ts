/**
 * **L'aperçu d'un avenant** (`l-avenant-date.md`, § 8.2) : la
 * copie amendée en mémoire, les refus rendus en donnée, l'état de référence à
 * la date d'effet, et le mur du compte de tarif.
 *
 * Ports doublés par de vraies sous-classes. La feuille de prix doublée
 * applique la mercuriale fournie sans chaîne — c'est l'orchestration qu'on
 * éprouve ici ; la résolution réelle est l'affaire de l'e2e. Les dates ne
 * sont comparées qu'à l'horloge figée de la fixture.
 */
import type {
  AmendCompanyMercurialePayload,
  CompanyPricingCategoryView,
  PricingItemView,
} from "@lfd/contracts";

import { FixedClock } from "../../../../../platform/time/fixed-clock.js";
import { CompanyMercuriale } from "../../../domain/entities/company-mercuriale.js";
import type { PricingParties } from "../../../domain/loaded-pricer.js";
import { CompanyMercurialeReader } from "../../../domain/ports/company-mercuriale.reader.js";
import { PricedCompanyReader } from "../../../domain/ports/priced-company.reader.js";
import { AmendedMercurialeNotFoundError } from "../../../domain/pricing-errors.js";
import { InMemoryPolicyPromotionNames } from "../../../infrastructure/in-memory-policy-promotion-names.js";
import {
  SpannedPricingAccounts,
  type FollowedSpan,
} from "../../__tests__/pricing-parties.doubles.js";
import { PricingPartiesResolver } from "../../pricing-parties.resolver.js";
import { CompanyPriceSheets, type CompanyPriceSheet } from "../../ports/company-price-sheet.js";
import { PreviewMercurialeAmendmentHandler } from "../preview-mercuriale-amendment.handler.js";
import { PreviewMercurialeAmendmentQuery } from "../preview-mercuriale-amendment.query.js";

const NOW = new Date("2026-03-01T00:00:00.000Z");
const DAY = 86_400_000;
const later = (days: number): Date => new Date(NOW.getTime() + days * DAY);
const CANONICAL: ReadonlyMap<string, number> = new Map([
  ["VIE-012", 200_000],
  ["PAI-001-1", 300_000],
]);

class Companies extends PricedCompanyReader {
  exists(): Promise<boolean> {
    return Promise.resolve(true);
  }
}

/** Les mercuriales non closes, par compte — et chaque lecture notée. */
class OwnedMercuriales extends CompanyMercurialeReader {
  readonly listed: string[] = [];
  constructor(private readonly mercuriales: readonly CompanyMercuriale[]) {
    super();
  }
  listFor(companyId: string): Promise<readonly CompanyMercuriale[]> {
    this.listed.push(companyId);
    return Promise.resolve(this.mercuriales.filter((m) => m.companyId === companyId));
  }
  // L'aperçu ne lit que `listFor` : les autres lectures rendent le vide.
  liveFor(): Promise<CompanyMercuriale | null> {
    return Promise.resolve(null);
  }
  liveAsOf(): Promise<CompanyMercuriale | null> {
    return Promise.resolve(null);
  }
  liveEverywhere(): Promise<readonly CompanyMercuriale[]> {
    return Promise.resolve([]);
  }
}

function item(
  sku: string,
  finalMillicents: number,
  sealedByRuleId: string | null,
): PricingItemView {
  return {
    sku,
    name: sku,
    canonicalMillicents: CANONICAL.get(sku) ?? 0,
    ownFloor: null,
    volumeTiers: null,
    effectiveFloor: null,
    rules: [],
    supersededRuleIds: [],
    sealedByRuleId,
    sealedRuleIds: [],
    steps: [],
    floored: false,
    clampedToZero: false,
    finalMillicents,
    elasticity: null,
    negotiationRoom: null,
  };
}

/** Prix ferme, sinon remise générale de base, sinon tarif catalogue — sans chaîne. */
class FlatSheets extends CompanyPriceSheets {
  readonly asked: { companyId: string; parties: PricingParties; at: Date }[] = [];
  sheetFor(companyId: string, parties: PricingParties, at: Date): Promise<CompanyPriceSheet> {
    this.asked.push({ companyId, parties, at });
    return Promise.resolve({
      at,
      parties,
      catalogue: [],
      rules: [],
      categoriesWith: (mercuriale) => Promise.resolve(categoriesAt(mercuriale, at)),
    });
  }
}

function categoriesAt(
  mercuriale: CompanyMercuriale | null,
  at: Date,
): CompanyPricingCategoryView[] {
  const items = [...CANONICAL].map(([sku, canonical]) => {
    const firm = mercuriale?.linesAt(at).find((line) => line.sku === sku);
    if (mercuriale !== null && firm !== undefined) {
      return item(sku, firm.tiers[0]?.unitPriceMillicents ?? canonical, mercuriale.id);
    }
    const discount = mercuriale?.generalDiscountAt(at)?.discount;
    if (mercuriale !== null && discount !== undefined) {
      return item(sku, (canonical * (10_000 - (discount.baseBp ?? 0))) / 10_000, mercuriale.id);
    }
    return item(sku, canonical, null);
  });
  return [
    { id: "fam", name: "Famille", family: { id: "fam", name: "Famille", position: 0 }, items },
  ];
}

/** Grille : VIE-012 ferme à 1,50 € ; remise générale de 10 % sur le reste. */
function posed(companyId = "co_folie"): CompanyMercuriale {
  return CompanyMercuriale.pose(
    "merc_1",
    {
      companyId,
      label: "Mercuriale 2026",
      lines: [{ sku: "VIE-012", tiers: [{ minQuantity: 1, unitPriceMillicents: 150_000 }] }],
      validFrom: new Date(NOW.getTime() - 30 * DAY),
      validTo: null,
      generalDiscount: { mode: "all_except", baseBp: 1_000, rules: [] },
    },
    "staff|marie",
  );
}

function setup(mercuriales: readonly CompanyMercuriale[], spans: readonly FollowedSpan[] = []) {
  const reader = new OwnedMercuriales(mercuriales);
  const sheets = new FlatSheets();
  const handler = new PreviewMercurialeAmendmentHandler(
    new Companies(),
    reader,
    new PricingPartiesResolver(new SpannedPricingAccounts(spans)),
    sheets,
    new InMemoryPolicyPromotionNames(),
    new FixedClock(NOW),
  );
  return { reader, sheets, handler };
}

const body = (over: Partial<AmendCompanyMercurialePayload>): AmendCompanyMercurialePayload => ({
  validTo: null,
  reason: "Renégociation",
  lines: [],
  endedSkus: [],
  ...over,
});

const preview = (
  handler: PreviewMercurialeAmendmentHandler,
  payload: AmendCompanyMercurialePayload,
  companyId = "co_folie",
) => handler.execute(new PreviewMercurialeAmendmentQuery(companyId, "merc_1", payload));

describe("PreviewMercurialeAmendmentHandler", () => {
  it("applique l'avenant à une COPIE : avant/après par article, rien d'écrit", async () => {
    const stored = posed();
    const { reader, handler } = setup([stored]);

    const view = await preview(
      handler,
      body({ endedSkus: ["VIE-012"], lines: [{ sku: "VIE-012", unitPriceMillicents: 140_000 }] }),
    );

    expect(view.items).toEqual([
      {
        sku: "VIE-012",
        beforeMillicents: 150_000,
        afterMillicents: 140_000,
        floored: false,
        source: "firm",
      },
      {
        sku: "PAI-001-1",
        beforeMillicents: 270_000,
        afterMillicents: 270_000,
        floored: false,
        source: "general_discount",
      },
    ]);
    expect(view.refusals).toEqual([]);
    // L'agrégat chargé n'a pas bougé, et seule une lecture a eu lieu.
    expect(stored.amendments).toHaveLength(0);
    expect(reader.listed).toEqual(["co_folie"]);
  });

  it("un prix ferme retiré passe à la remise générale", async () => {
    const { handler } = setup([posed()]);

    const view = await preview(handler, body({ endedSkus: ["VIE-012"] }));

    expect(view.items[0]).toMatchObject({
      sku: "VIE-012",
      beforeMillicents: 150_000,
      afterMillicents: 180_000,
      source: "general_discount",
    });
  });

  it("rend le refus du domaine avec son code et son SKU, et un « après » égal à l'« avant »", async () => {
    const { handler } = setup([posed()]);

    const view = await preview(
      handler,
      body({ lines: [{ sku: "VIE-012", unitPriceMillicents: 140_000 }] }),
    );

    expect(view.refusals).toEqual([
      expect.objectContaining({
        code: "pricing.mercuriale.amendment.sku_already_negotiated",
        sku: "VIE-012",
      }),
    ]);
    expect(view.refusals[0]?.message).toContain("VIE-012");
    expect(view.items.every((i) => i.beforeMillicents === i.afterMillicents)).toBe(true);
  });

  it("un refus sans article (rétroactif) porte un SKU nul", async () => {
    const { handler } = setup([posed()]);

    const view = await preview(
      handler,
      body({ validFrom: later(-1).toISOString(), endedSkus: ["VIE-012"] }),
    );

    expect(view.refusals).toEqual([
      expect.objectContaining({ code: "pricing.mercuriale.amendment.retroactive", sku: null }),
    ]);
  });

  it("à une date future, l'état de référence tient compte d'un avenant à venir", async () => {
    const withUpcoming = posed().amend(
      "amd_upcoming",
      {
        lines: [{ sku: "VIE-012", tiers: [{ minQuantity: 1, unitPriceMillicents: 145_000 }] }],
        endedSkus: ["VIE-012"],
        validFrom: later(10),
        validTo: null,
        reason: "Hausse prévue",
        origin: null,
        generalDiscount: { set: null },
      },
      "staff|marie",
      NOW,
    );
    const { sheets, handler } = setup([withUpcoming]);
    const at = later(20);

    const view = await preview(
      handler,
      body({
        validFrom: at.toISOString(),
        lines: [{ sku: "PAI-001-1", unitPriceMillicents: 250_000 }],
      }),
    );

    expect(view.at).toBe(at.toISOString());
    expect(view.basedOnAmendmentId).toBe("amd_upcoming");
    expect(view.state).toEqual({
      firm: [{ sku: "VIE-012", tiers: [{ minQuantity: 1, unitPriceMillicents: 145_000 }] }],
      generalDiscount: null,
      promotionPolicy: { mode: "none", promotionIds: [] },
    });
    expect(view.items[1]).toMatchObject({
      sku: "PAI-001-1",
      beforeMillicents: 300_000,
      afterMillicents: 250_000,
      source: "firm",
    });
    expect(sheets.asked.map((asked) => asked.at)).toEqual([at]);
  });

  it("🔴 le mur : la mercuriale d'un autre compte est introuvable (404)", async () => {
    const { handler } = setup([posed("co_other")]);

    await expect(preview(handler, body({ endedSkus: ["VIE-012"] }))).rejects.toBeInstanceOf(
      AmendedMercurialeNotFoundError,
    );
  });

  it("un site qui suit son principal voit la mercuriale du principal, tarifée pour lui", async () => {
    const { reader, sheets, handler } = setup(
      [posed("co_principal")],
      [{ companyId: "co_site", parentId: "co_principal", from: later(-100), to: null }],
    );

    const view = await preview(handler, body({ endedSkus: ["VIE-012"] }), "co_site");

    expect(view.refusals).toEqual([]);
    expect(reader.listed).toEqual(["co_principal"]);
    expect(sheets.asked[0]?.companyId).toBe("co_site");
  });
});
