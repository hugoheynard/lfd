import { boardMaterials, itemView, targetsArticle } from "../board-item.js";
import { pricingContextFor } from "../pricing-context.js";
import {
  floorFromRow,
  floorViewFromRow,
  ruleFromRow,
  ruleViewFromRow,
  type FloorRow,
  type RuleRow,
} from "../../infrastructure/price-rows.js";
import type { LoadedFloor, LoadedRule } from "../board-item.js";
import type { PriceScope, PriceStage } from "../../domain/price-rule.js";

/**
 * **Le montage d'un nœud du tableau, éprouvé sans base.**
 *
 * C'est ce que le découpage a rendu possible : la composition vivait dans
 * l'adaptateur Prisma, donc ces cas-là ne se vérifiaient qu'en montant une
 * application Nest et une base — c'est-à-dire jamais.
 *
 * Les deux formes d'une règle (celle qui calcule, celle qui s'affiche) sont
 * dérivées d'**une seule ligne**, par les mêmes convertisseurs que la
 * production. Les fabriquer séparément aurait laissé le test vert le jour où les
 * deux divergent — ce qui est précisément l'accident qu'on redoute ici.
 */

const AT = new Date("2026-08-17T00:00:00.000Z");
const CONTEXT = pricingContextFor("VIE-001", "viennoiserie", 1, { companyId: null }, AT);
const ARTICLE = { sku: "VIE-001", name: "Croissant", canonicalCents: 200 };

function ruleRow(
  id: string,
  over: { stage?: PriceStage; bp?: number; scope?: PriceScope } = {},
): RuleRow {
  const scope = over.scope ?? { type: "global", id: null };
  return {
    stacksOverMercuriale: false,
    id,
    stage: over.stage ?? "promotion",
    nature: "alter",
    scopeType: scope.type,
    scopeId: scope.id,
    audienceType: "all",
    audienceId: null,
    minQuantity: null,
    amountCents: null,
    direction: "decrease",
    mode: "percent",
    value: over.bp ?? 1_000,
    validFrom: new Date("2026-08-01T00:00:00.000Z"),
    validTo: null,
    label: id,
    createdBy: "staff|test",
    createdAt: new Date("2026-08-01T00:00:00.000Z"),
    pausedAt: null,
    pausedBy: null,
    archivedAt: null,
    archivedBy: null,
    archiveReason: null,
  };
}

function loadedRules(rows: readonly RuleRow[]): LoadedRule[] {
  return rows.map((row) => ({ rule: ruleFromRow(row), view: ruleViewFromRow(row) }));
}

function loadedFloor(id: string, scope: PriceScope, bp: number): LoadedFloor {
  const row: FloorRow = {
    id,
    scopeType: scope.type,
    scopeId: scope.id,
    mode: "percent",
    value: bp,
    dynamicMode: null,
    dynamicValue: null,
    unlockMinQuantity: null,
    unlockMinVolumeRatioBp: null,
    referenceCanonicalCents: null,
    createdBy: "staff|test",
    updatedAt: AT,
  };
  return { floor: floorFromRow(row), view: floorViewFromRow(row, null, AT) };
}

describe("un nœud du tableau", () => {
  it("rend le prix de la fonction qui facture, composé et non additionné", () => {
    const rules = loadedRules([
      ruleRow("a", { bp: 2_000 }),
      ruleRow("b", { stage: "geste", bp: 1_000 }),
    ]);

    const view = itemView(ARTICLE, CONTEXT, boardMaterials(rules, []), { rules, floors: [] }, []);

    // −20 % puis −10 % font −28 %, pas −30 % : 200 → 160 → 144.
    expect(view.finalCents).toBe(144);
    expect(view.steps.map((step) => step.stage)).toEqual(["promotion", "geste"]);
  });

  /**
   * Le cas qui justifie `supersededRuleIds` : deux règles du MÊME étage ne
   * s'enchaînent pas, la plus spécifique remplace l'autre. Sans ce champ, on
   * lirait deux remises et un total qui ne colle avec aucune des deux.
   */
  it("nomme la règle évincée dans son étage, et ne la compte pas dans le prix", () => {
    const rules = loadedRules([
      ruleRow("catalogue", { bp: 2_000 }),
      ruleRow("produit", { bp: 500, scope: { type: "product", id: "VIE-001" } }),
    ]);

    const view = itemView(ARTICLE, CONTEXT, boardMaterials(rules, []), { rules, floors: [] }, []);

    expect(view.supersededRuleIds).toEqual(["catalogue"]);
    expect(view.steps).toHaveLength(1);
    expect(view.finalCents).toBe(190);
  });

  it("n'annonce aucune marge de négociation quand aucune limite n'est posée", () => {
    const rules = loadedRules([ruleRow("a")]);

    const view = itemView(ARTICLE, CONTEXT, boardMaterials(rules, []), { rules, floors: [] }, []);

    expect(view.negotiationRoom).toBeNull();
  });

  /**
   * La marge se mesure sur le prix FINAL — celui sur lequel le commercial
   * annonce « je te fais 5 % » — et jamais sous zéro : un prix déjà relevé au
   * plancher rend `0`, ce qui est une information, pas une remise négative.
   */
  it("borne la marge de négociation à zéro sur un prix déjà relevé", () => {
    const rules = loadedRules([ruleRow("a", { bp: 5_000 })]);
    const floors = [loadedFloor("plancher", { type: "global", id: null }, 9_000)];

    const view = itemView(ARTICLE, CONTEXT, boardMaterials(rules, floors), { rules, floors }, []);

    expect(view.floored).toBe(true);
    expect(view.finalCents).toBe(180);
    expect(view.negotiationRoom).toEqual({
      floorCents: 180,
      maxDiscountCents: 0,
      maxDiscountBp: 0,
    });
  });

  /** Le plus spécifique REMPLACE : un plancher d'article ne s'ajoute pas à celui de sa famille. */
  it("retient le plancher le plus spécifique, même quand il est plus bas", () => {
    const floors = [
      loadedFloor("famille", { type: "category", id: "viennoiserie" }, 9_000),
      loadedFloor("article", { type: "product", id: "VIE-001" }, 5_000),
    ];
    const rules = loadedRules([ruleRow("a", { bp: 4_000 })]);

    const view = itemView(ARTICLE, CONTEXT, boardMaterials(rules, floors), { rules, floors }, []);

    expect(view.effectiveFloor?.id).toBe("article");
    expect(view.floored).toBe(false);
    expect(view.finalCents).toBe(120);
  });

  it("laisse la mesure des ventes à la passe qui la fait", () => {
    const rules = loadedRules([ruleRow("a")]);

    const view = itemView(ARTICLE, CONTEXT, boardMaterials(rules, []), { rules, floors: [] }, []);

    expect(view.elasticity).toBeNull();
  });
});

describe("les matériaux d'une lecture", () => {
  it("range les règles par étage, une seule fois pour tout le tableau", () => {
    const rules = loadedRules([ruleRow("a"), ruleRow("b", { stage: "geste" }), ruleRow("c")]);

    const materials = boardMaterials(rules, []);

    expect(materials.rules).toHaveLength(3);
    expect(materials.byStage.get("promotion")?.map((entry) => entry.id)).toEqual(["a", "c"]);
    expect(materials.byStage.get("geste")?.map((entry) => entry.id)).toEqual(["b"]);
    // Un étage sans règle existe et rend une liste vide : l'appelant n'a pas à
    // distinguer « aucune règle » de « étage inconnu ».
    expect(materials.byStage.get("mercuriale")).toEqual([]);
  });
});

describe("viser un article nommément", () => {
  it("ne retient que les portées produit et déclinaison", () => {
    expect(targetsArticle({ type: "product", id: "VIE-001" }, "VIE-001")).toBe(true);
    expect(targetsArticle({ type: "variant", id: "VIE-001" }, "VIE-001")).toBe(true);
    expect(targetsArticle({ type: "category", id: "viennoiserie" }, "VIE-001")).toBe(false);
    expect(targetsArticle({ type: "global", id: null }, "VIE-001")).toBe(false);
  });
});
