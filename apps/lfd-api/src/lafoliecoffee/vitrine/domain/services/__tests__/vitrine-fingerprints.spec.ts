import { VitrineContents } from "../../vitrine-contents.js";
import { catalogue, item, showcase } from "../../__tests__/vitrine-fixtures.js";
import {
  compareVitrinePrints,
  vitrineKindsFor,
  vitrinePrintsFor,
  type VitrineShowcase,
} from "../vitrine-fingerprints.js";

const ALL = VitrineContents.of(["catalogue", "operations", "texts", "featured"]);

function compare(before: VitrineShowcase, after: VitrineShowcase, contents = ALL) {
  return compareVitrinePrints(
    vitrinePrintsFor(before, contents),
    vitrinePrintsFor(after, contents),
    vitrineKindsFor(contents),
  );
}

describe("les empreintes de la vitrine", () => {
  it("une par élément : articles, rayons, opérations, textes", () => {
    const kinds = vitrinePrintsFor(showcase(), ALL).map((print) => `${print.kind}:${print.key}`);
    expect(kinds.sort()).toEqual([
      "item:CRO-01",
      "item:PAI-01",
      "operation:galette",
      "shelf:viennoiseries",
      "text:product.bestSeller",
    ]);
  });

  it("au premier balayage, tout est neuf", () => {
    const { changes, upserts } = compareVitrinePrints(
      [],
      vitrinePrintsFor(showcase(), ALL),
      vitrineKindsFor(ALL),
    );
    expect(upserts).toHaveLength(5);
    expect(changes.toShape().changed.items).toEqual(["CRO-01", "PAI-01"]);
  });

  it("rien ne change, rien ne part", () => {
    expect(compare(showcase(), showcase()).changes.isEmpty).toBe(true);
  });

  it("un prix qui baisse (une promotion qui commence) change l'article, et lui seul", () => {
    const cheaper = catalogue({
      items: [item("CRO-01", { isFeatured: true, unitPriceMillicents: 200_000 }), item("PAI-01")],
    });
    expect(compare(showcase(), showcase(cheaper)).changes.toShape().changed).toEqual({
      items: ["CRO-01"],
      operations: [],
      shelves: [],
      texts: [],
    });
  });

  it("une traduction qui change, dans une seule langue, change l'article", () => {
    const before = showcase();
    const after: VitrineShowcase = {
      ...before,
      catalogues: {
        ...before.catalogues,
        it: catalogue({
          items: [item("CRO-01", { isFeatured: true, name: "Cornetto" }), item("PAI-01")],
        }),
      },
    };
    expect(compare(before, after).changes.toShape().changed.items).toEqual(["CRO-01"]);
  });

  it("un article retiré de la vue est annoncé retiré, et sa ligne oubliée", () => {
    const fewer = catalogue({ items: [item("CRO-01", { isFeatured: true })] });
    const { changes, removals } = compare(showcase(), showcase(fewer));
    expect(changes.toShape().removed.items).toEqual(["PAI-01"]);
    expect(removals).toEqual([{ kind: "item", key: "PAI-01" }]);
  });

  it("décocher une case n'envoie AUCUN retrait (M1)", () => {
    const before = vitrinePrintsFor(showcase(), ALL);
    const fewer = VitrineContents.of(["catalogue", "featured"]);
    const { changes, removals } = compareVitrinePrints(
      before,
      vitrinePrintsFor(showcase(), fewer),
      vitrineKindsFor(fewer),
    );
    expect(changes.isEmpty).toBe(true);
    expect(removals).toEqual([]);
  });

  it("sans « incontournables », la mise en avant ne change rien à l'empreinte", () => {
    const noFeatured = VitrineContents.of(["catalogue"]);
    const promoted = catalogue({ items: [item("CRO-01"), item("PAI-01", { isFeatured: true })] });
    expect(compare(showcase(), showcase(promoted), noFeatured).changes.isEmpty).toBe(true);
  });
});
