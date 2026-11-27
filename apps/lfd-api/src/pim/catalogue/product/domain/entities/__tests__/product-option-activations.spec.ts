import { OptionGroupArchivedError } from "../../../../../reference/product-options/domain/errors/option-group-errors.js";
import { ArchivedProductNotEditableError } from "../../errors/archived-product-edit-errors.js";
import { VariantNotFoundError } from "../../errors/product-errors.js";
import { EmptyOptionVariantListError } from "../../errors/product-option-errors.js";
import {
  ProductOptionActivations,
  type OptionActivationFiche,
} from "../product-option-activations.js";

/**
 * Les groupes d'options d'une fiche (`plan-options-de-commande.md`, § 3.1) :
 * pour toutes les déclinaisons ou une liste, au poids comme à la pièce — la
 * fiche archivée et le groupe archivé refusent, une liste vise la fiche.
 */

const AT = new Date("2026-11-19T09:00:00.000Z");
const FICHE: OptionActivationFiche = {
  id: "prd_pain",
  status: "published",
  variantIds: ["var_500g", "var_1kg", "var_poids"],
};
const TRANCHAGE = { id: "grp_tranchage", name: "Tranchage", archived: false };

const empty = () => ProductOptionActivations.reconstitute("prd_pain", []);

describe("ProductOptionActivations.activate", () => {
  it("active pour toutes les déclinaisons", () => {
    const activations = empty();
    expect(activations.activate(FICHE, TRANCHAGE, null)).toBe(true);
    expect(activations.of("grp_tranchage")).toEqual({
      groupId: "grp_tranchage",
      allVariants: true,
      variantIds: [],
      revokedAt: null,
    });
  });

  it("active pour une liste, dédoublonnée et triée — une déclinaison au poids comprise", () => {
    const activations = empty();
    activations.activate(FICHE, TRANCHAGE, ["var_poids", "var_1kg", "var_poids"]);
    expect(activations.of("grp_tranchage")).toMatchObject({
      allVariants: false,
      variantIds: ["var_1kg", "var_poids"],
    });
  });

  it("dit qu'une activation identique ne change rien, et qu'un changement de liste change", () => {
    const activations = empty();
    activations.activate(FICHE, TRANCHAGE, ["var_1kg"]);
    expect(activations.activate(FICHE, TRANCHAGE, ["var_1kg"])).toBe(false);
    expect(activations.activate(FICHE, TRANCHAGE, null)).toBe(true);
  });

  it("refuse une fiche archivée", () => {
    expect(() => empty().activate({ ...FICHE, status: "archived" }, TRANCHAGE, null)).toThrow(
      ArchivedProductNotEditableError,
    );
  });

  it("refuse un groupe archivé", () => {
    expect(() => empty().activate(FICHE, { ...TRANCHAGE, archived: true }, null)).toThrow(
      OptionGroupArchivedError,
    );
  });

  it("refuse une liste vide", () => {
    expect(() => empty().activate(FICHE, TRANCHAGE, [])).toThrow(EmptyOptionVariantListError);
  });

  it("refuse une déclinaison d'une autre fiche", () => {
    expect(() => empty().activate(FICHE, TRANCHAGE, ["var_ailleurs"])).toThrow(
      VariantNotFoundError,
    );
  });
});

describe("ProductOptionActivations.deactivate", () => {
  it("retire sans effacer la ligne, puis dit qu'un second retrait ne change rien", () => {
    const activations = empty();
    activations.activate(FICHE, TRANCHAGE, null);

    expect(activations.deactivate(FICHE, "grp_tranchage", AT)).toBe(true);
    expect(activations.of("grp_tranchage")?.revokedAt).toEqual(AT);
    expect(activations.deactivate(FICHE, "grp_tranchage", AT)).toBe(false);
  });

  it("une réactivation remet le groupe en service", () => {
    const activations = empty();
    activations.activate(FICHE, TRANCHAGE, null);
    activations.deactivate(FICHE, "grp_tranchage", AT);

    expect(activations.activate(FICHE, TRANCHAGE, null)).toBe(true);
    expect(activations.of("grp_tranchage")?.revokedAt).toBeNull();
  });

  it("ne retire pas un groupe jamais activé", () => {
    expect(empty().deactivate(FICHE, "grp_tranchage", AT)).toBe(false);
  });

  it("refuse sur une fiche archivée", () => {
    const activations = empty();
    activations.activate(FICHE, TRANCHAGE, null);
    expect(() =>
      activations.deactivate({ ...FICHE, status: "archived" }, "grp_tranchage", AT),
    ).toThrow(ArchivedProductNotEditableError);
  });
});
