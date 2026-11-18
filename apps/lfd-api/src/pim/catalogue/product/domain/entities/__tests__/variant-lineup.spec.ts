import {
  InvalidProductVariantsError,
  VariantNotFoundError,
  VariantNotInProductError,
} from "../../errors/product-errors.js";
import {
  DefaultVariantNotDetachableError,
  DefaultVariantNotDiscontinuableError,
  DiscontinuedVariantNotDefaultableError,
  LastLiveVariantNotDiscontinuableError,
  VariantAlreadyDefaultError,
  VariantAlreadyDiscontinuedError,
} from "../../errors/variant-lifecycle-errors.js";
import { CustomRecipeDefaultWithoutTilesError } from "../../errors/custom-recipe-errors.js";
import { Sku } from "../../value-objects/sku.value-object.js";
import { VariantLineup } from "../variant-lineup.js";

function aLineup(): VariantLineup {
  return VariantLineup.open("prd_1", {
    id: "var_1",
    sku: Sku.create("CHO-001-1"),
    name: { fr: "Boîte de 220 g" },
  });
}

function withSister(lineup: VariantLineup, n = 2): string {
  return lineup.add(
    {
      id: `var_${String(n)}`,
      sku: Sku.create(`CHO-001-${String(n)}`),
      name: { fr: "Sœur" },
      options: {},
    },
    false,
  ).id;
}

describe("VariantLineup — les déclinaisons d'une fiche", () => {
  it("s'ouvre avec son défaut seul, au rang zéro", () => {
    const lineup = aLineup();
    expect(lineup.all()).toHaveLength(1);
    expect(lineup.defaultVariant.id).toBe("var_1");
    expect(lineup.nextPosition).toBe(1);
  });

  it("refuse à la relecture une ligne sans déclinaison ou sans défaut unique", () => {
    const [own] = aLineup().ownSnapshots();
    expect(() => VariantLineup.reconstitute("prd_1", [])).toThrow(InvalidProductVariantsError);
    expect(() =>
      VariantLineup.reconstitute("prd_1", [own!, { ...own!, id: "var_2", sku: "CHO-001-2" }]),
    ).toThrow(InvalidProductVariantsError);
  });

  it("nomme la fiche quand une déclinaison n'en est pas", () => {
    expect(() => aLineup().get("var_ailleurs")).toThrow(VariantNotFoundError);
    expect(() => aLineup().align("var_ailleurs", "pricing", true)).toThrow(
      VariantNotInProductError,
    );
  });

  it("le rang suivant ne retombe jamais sur un rang pris, archivé compris", () => {
    const lineup = aLineup();
    const second = withSister(lineup);
    withSister(lineup, 3);
    lineup.discontinue(second);
    expect(lineup.nextPosition).toBe(3);
  });

  it("une ajoutée sur une fiche en ligne part déjà publiée", () => {
    const lineup = aLineup();
    const added = lineup.add(
      { id: "var_2", sku: Sku.create("CHO-001-2"), name: { fr: "Sœur" }, options: {} },
      true,
    );
    expect(added.snapshot().hasBeenPublished).toBe(true);
  });

  it("ne laisse arrêter ni le défaut ni la dernière vivante, ni une archivée deux fois", () => {
    const lineup = aLineup();
    expect(() => lineup.discontinue("var_1")).toThrow(LastLiveVariantNotDiscontinuableError);
    const sister = withSister(lineup);
    expect(() => lineup.discontinue("var_1")).toThrow(DefaultVariantNotDiscontinuableError);
    lineup.discontinue(sister);
    expect(() => lineup.discontinue(sister)).toThrow(VariantAlreadyDiscontinuedError);
  });

  it("détache une déclinaison en rendant sa vue résolue, et refuse le défaut", () => {
    const lineup = aLineup();
    const sister = withSister(lineup);
    expect(() => lineup.detach("var_1", "prd_2")).toThrow(DefaultVariantNotDetachableError);
    const resolved = lineup.detach(sister, "prd_2");
    expect(resolved.id).toBe(sister);
    expect(lineup.get(sister).detachedToProductId).toBe("prd_2");
  });

  it("change de défaut : l'ancien cède, la nouvelle le devient, un refus ne mute rien", () => {
    const lineup = aLineup();
    const sister = withSister(lineup);
    expect(() => lineup.makeDefault("var_1", true)).toThrow(VariantAlreadyDefaultError);
    const change = lineup.makeDefault(sister, true);
    expect(change.previousDefaultId).toBe("var_1");
    expect(lineup.defaultVariant.id).toBe(sister);
    expect(lineup.get("var_1").isDefault).toBe(false);
  });

  it("ne rend pas défaut une déclinaison archivée", () => {
    const lineup = aLineup();
    const first = withSister(lineup);
    withSister(lineup, 3);
    lineup.discontinue(first);
    expect(() => lineup.makeDefault(first, true)).toThrow(DiscontinuedVariantNotDefaultableError);
  });

  it("le défaut sur mesure exige les vignettes", () => {
    const lineup = aLineup();
    const sister = withSister(lineup);
    lineup.get(sister).declareCustomRecipe(true);
    expect(() => lineup.makeDefault(sister, false)).toThrow(CustomRecipeDefaultWithoutTilesError);
  });
});
