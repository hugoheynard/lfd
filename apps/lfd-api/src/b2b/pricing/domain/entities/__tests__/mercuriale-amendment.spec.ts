import { CompanyMercuriale, type MercurialeAmendmentDraft } from "../company-mercuriale.js";
import type { PriceRule, PricingContext } from "../../price-rule.js";
import {
  AmendmentOutsideMercurialeError,
  ArchivedMercurialeIsSealedError,
  DuplicateEndedSkuError,
  EmptyAmendmentError,
  MissingAmendmentReasonError,
  NoNegotiatedLineToEndError,
  RetroactiveAmendmentError,
  ReversedValidityWindowError,
  SkuAlreadyNegotiatedError,
} from "../../pricing-errors.js";
import { resolvePrice } from "../../resolve-price.js";

/**
 * **L'avenant daté d'une mercuriale** (`plan-tarif-date-sur-une-reference.md`,
 * T1, avec les décisions de Hugo du 2026-10-29 : Q1 un avenant peut arrêter
 * une ligne, Q2 jamais rétroactif, Q3 suspendu avec sa mercuriale).
 *
 * Les dates ne sont comparées qu'entre elles et à `NOW`, un instant de la
 * fixture passé en paramètre : aucune n'est confrontée à l'horloge.
 */

const FROM = new Date("2026-01-01T00:00:00.000Z");
const TO = new Date("2026-12-31T00:00:00.000Z");
const NOW = new Date("2026-03-01T00:00:00.000Z");
const APRIL = new Date("2026-04-01T00:00:00.000Z");
const MAY = new Date("2026-05-01T00:00:00.000Z");
const JUNE = new Date("2026-06-01T00:00:00.000Z");

const GRID_PRICE = 173_270;
const AMENDED_PRICE = 150_000;

const posed = (): CompanyMercuriale =>
  CompanyMercuriale.pose(
    "merc_1",
    {
      companyId: "co_folie",
      label: "Mercuriale 2026",
      lines: [{ sku: "VIE-012", tiers: [{ minQuantity: 1, unitPriceMillicents: GRID_PRICE }] }],
      validFrom: FROM,
      validTo: TO,
    },
    "staff|marie",
  );

function draft(overrides: Partial<MercurialeAmendmentDraft> = {}): MercurialeAmendmentDraft {
  return {
    lines: [{ sku: "PAI-001", tiers: [{ minQuantity: 1, unitPriceMillicents: AMENDED_PRICE }] }],
    endedSkus: [],
    validFrom: APRIL,
    validTo: JUNE,
    reason: "Nouvelle référence demandée par le chef",
    origin: null,
    ...overrides,
  };
}

const amend = (
  mercuriale: CompanyMercuriale,
  overrides: Partial<MercurialeAmendmentDraft> = {},
  id = "amd_1",
): CompanyMercuriale => mercuriale.amend(id, draft(overrides), "staff|paul", NOW);

function context(over: Partial<PricingContext> = {}): PricingContext {
  return {
    at: MAY,
    quantity: 1,
    cumulativeQuantity: null,
    variantSku: "PAI-001",
    productSku: "PAI-001",
    categoryPath: ["fam-pain"],
    saleUnit: "piece",
    companyId: "co_folie",
    pricingCompanyId: "co_folie",
    segmentId: null,
    ...over,
  };
}

function posedPrice(rule: PriceRule | null): number | null {
  return rule === null || rule.nature !== "replace" ? null : rule.amountMillicents;
}

describe("un avenant ajoute un prix daté", () => {
  it("donne le prix de l'avenant à un article hors grille, sous l'id du DOCUMENT", () => {
    const rule = amend(posed()).asRuleFor(context());

    expect(posedPrice(rule)).toBe(AMENDED_PRICE);
    // Seconde contradiction, B1 : le scellement « a facturé » cherche des ids
    // de documents ; l'avenant se lit dans le libellé.
    expect(rule).toMatchObject({
      id: "merc_1",
      stage: "mercuriale",
      scope: { type: "product", id: "PAI-001" },
      validFrom: APRIL,
      validTo: JUNE,
    });
    expect(rule?.label).toBe("Mercuriale 2026 — avenant du 1er avril 2026");
  });

  it("scelle : une promotion non cumulable ne passe pas par-dessus", () => {
    const promotion: PriceRule = {
      id: "promo",
      stage: "promotion",
      scope: { type: "global", id: null },
      audience: { type: "all", id: null },
      minQuantity: null,
      validFrom: FROM,
      validTo: null,
      suspendedFrom: null,
      label: "−10 %",
      stacksOverMercuriale: false,
      nature: "alter",
      alteration: { direction: "decrease", mode: "percent", bp: 1000 },
    };
    const result = resolvePrice(
      200_000,
      { rules: [promotion], ladders: [], mercuriale: amend(posed()) },
      context(),
    );

    expect(result.finalMillicents).toBe(AMENDED_PRICE);
    expect(result.sealedByRuleId).toBe("merc_1");
  });

  it.each([
    ["avant la fenêtre", new Date("2026-03-15T00:00:00.000Z"), 200_000],
    ["pendant", MAY, AMENDED_PRICE],
    ["après", new Date("2026-07-01T00:00:00.000Z"), 200_000],
  ])("resolvePrice %s : le prix de l'avenant seulement dans sa fenêtre", (_, at, expected) => {
    const result = resolvePrice(
      200_000,
      { rules: [], ladders: [], mercuriale: amend(posed()) },
      context({ at }),
    );

    expect(result.finalMillicents).toBe(expected);
  });

  it("sert un sous-compte au prix de l'avenant, et vise la société servie", () => {
    const rule = amend(posed()).asRuleFor(context({ companyId: "co_site" }));

    expect(posedPrice(rule)).toBe(AMENDED_PRICE);
    expect(rule?.audience).toEqual({ type: "company", id: "co_site" });
  });

  it("ne rend rien pour un autre compte de tarif", () => {
    expect(amend(posed()).asRuleFor(context({ pricingCompanyId: "co_other" }))).toBeNull();
  });

  it("dit « palier non atteint » sur un avenant à paliers que la mesure n'atteint pas", () => {
    const mercuriale = amend(posed(), {
      lines: [{ sku: "PAI-001", tiers: [{ minQuantity: 50, unitPriceMillicents: AMENDED_PRICE }] }],
    });

    expect(mercuriale.asRuleFor(context())).toBeNull();
    expect(mercuriale.missesTierFor(context())).toBe(true);
  });

  it("est suspendu avec sa mercuriale en pause (Q3)", () => {
    // La pause n'a pas de geste sur l'agrégat ; elle se lit au cycle de vie.
    const state = amend(posed()).toPersistence();
    const paused = CompanyMercuriale.reconstitute({
      ...state,
      lifecycle: { ...state.lifecycle, pausedAt: APRIL, pausedBy: "staff|marie" },
    });

    expect(paused.asRuleFor(context())?.suspendedFrom).toEqual(APRIL);
  });

  it("accepte deux avenants sur le même article à des fenêtres disjointes", () => {
    const twice = amend(amend(posed()), { validFrom: JUNE, validTo: null }, "amd_2");

    expect(posedPrice(twice.asRuleFor(context({ at: new Date("2026-08-01T00:00:00.000Z") })))).toBe(
      AMENDED_PRICE,
    );
  });
});

describe("un avenant refuse", () => {
  it("un article déjà dans la grille", () => {
    expect(() =>
      amend(posed(), {
        lines: [{ sku: "VIE-012", tiers: [{ minQuantity: 1, unitPriceMillicents: 1 }] }],
      }),
    ).toThrow(SkuAlreadyNegotiatedError);
  });

  it("un article ajouté par un autre avenant qui chevauche", () => {
    const once = amend(posed());

    expect(() => amend(once, { validFrom: MAY, validTo: null }, "amd_2")).toThrow(
      SkuAlreadyNegotiatedError,
    );
  });

  it.each(["", "   "])("un motif vide ou blanc (%j)", (reason) => {
    expect(() => amend(posed(), { reason })).toThrow(MissingAmendmentReasonError);
  });

  it("un avenant qui n'ouvre ni n'arrête rien", () => {
    expect(() => amend(posed(), { lines: [] })).toThrow(EmptyAmendmentError);
  });

  it("une fenêtre inversée", () => {
    expect(() => amend(posed(), { validFrom: JUNE, validTo: APRIL })).toThrow(
      ReversedValidityWindowError,
    );
  });

  it("une fenêtre qui déborde du document", () => {
    expect(() => amend(posed(), { validTo: new Date("2027-02-01T00:00:00.000Z") })).toThrow(
      AmendmentOutsideMercurialeError,
    );
  });

  it("un départ antérieur à maintenant — jamais rétroactif (Q2)", () => {
    expect(() => amend(posed(), { validFrom: new Date("2026-02-01T00:00:00.000Z") })).toThrow(
      RetroactiveAmendmentError,
    );
  });

  it("un document clos", () => {
    const closed = posed().close("staff|marie", NOW, "fin d'accord");

    expect(() => amend(closed)).toThrow(ArchivedMercurialeIsSealedError);
  });
});

describe("un avenant arrête une ligne (Q1)", () => {
  const changePrice = (): CompanyMercuriale =>
    amend(posed(), {
      endedSkus: ["VIE-012"],
      lines: [{ sku: "VIE-012", tiers: [{ minQuantity: 1, unitPriceMillicents: AMENDED_PRICE }] }],
      validTo: null,
    });
  const vie = (at: Date) => context({ at, productSku: "VIE-012", variantSku: "VIE-012" });

  it("change un prix de la grille : l'ancien avant la date, le nouveau après", () => {
    const mercuriale = changePrice();

    expect(posedPrice(mercuriale.asRuleFor(vie(new Date("2026-03-15T00:00:00.000Z"))))).toBe(
      GRID_PRICE,
    );
    expect(posedPrice(mercuriale.asRuleFor(vie(MAY)))).toBe(AMENDED_PRICE);
  });

  it("la grille arrêtée se dit expirée à partir de la date, pas effacée", () => {
    const mercuriale = amend(posed(), { endedSkus: ["VIE-012"], lines: [] });
    const rule = mercuriale.asRuleFor(vie(MAY));

    // Rendue avec sa fenêtre coupée : la résolution dit « expirée ».
    expect(rule?.validTo).toEqual(APRIL);
    expect(
      resolvePrice(200_000, { rules: [], ladders: [], mercuriale }, vie(MAY)).finalMillicents,
    ).toBe(200_000);
  });

  it("arrête la ligne d'un avenant antérieur, et permet de la rouvrir ensuite", () => {
    const ended = amend(
      amend(posed(), { validTo: null }),
      { endedSkus: ["PAI-001"], lines: [], validFrom: MAY },
      "amd_2",
    );
    const reopened = amend(ended, { validFrom: JUNE, validTo: null }, "amd_3");

    expect(ended.asRuleFor(context({ at: new Date("2026-05-15T00:00:00.000Z") }))).toBeNull();
    expect(
      posedPrice(reopened.asRuleFor(context({ at: new Date("2026-07-01T00:00:00.000Z") }))),
    ).toBe(AMENDED_PRICE);
  });

  it("refuse d'arrêter une ligne qui ne court pas à cette date", () => {
    expect(() => amend(posed(), { endedSkus: ["PAI-404"], lines: [] })).toThrow(
      NoNegotiatedLineToEndError,
    );
  });

  it("refuse la même ligne arrêtée deux fois", () => {
    expect(() => amend(posed(), { endedSkus: ["VIE-012", "VIE-012"], lines: [] })).toThrow(
      DuplicateEndedSkuError,
    );
  });
});

describe("clore le document", () => {
  it("range ses avenants au même instant, et les coupe par sa fin", () => {
    const closed = amend(posed(), { validTo: null }).close("staff|marie", MAY, "fin d'accord");

    expect(closed.amendments[0]).toMatchObject({
      archivedAt: MAY,
      archivedBy: "staff|marie",
      archiveReason: "fin d'accord",
    });
    // Relecture d'avant la clôture : l'avenant agissait, sa fenêtre coupée par
    // la fin que la clôture a posée.
    const before = closed.asRuleFor(context({ at: new Date("2026-04-15T00:00:00.000Z") }));
    expect(posedPrice(before)).toBe(AMENDED_PRICE);
    expect(before?.validTo).toEqual(MAY);
  });
});
