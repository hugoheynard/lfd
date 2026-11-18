import {
  DetachedVariantNotRestorableError,
  VariantAlreadyDiscontinuedError,
  VariantNotDiscontinuedError,
} from "../../errors/variant-lifecycle-errors.js";
import { Sku } from "../../value-objects/sku.value-object.js";
import { VariantLifecycle } from "../variant-lifecycle.js";
import { openedSnapshot } from "../variant-snapshot-mapper.js";

const SKU = "CHO-001-2";

function aLifecycle(): VariantLifecycle {
  return VariantLifecycle.fromSnapshot(
    openedSnapshot({
      id: "var_2",
      sku: Sku.create(SKU),
      name: { fr: "Sœur" },
      options: {},
      position: 1,
      customRecipe: false,
    }),
  );
}

describe("VariantLifecycle — l'état de vie d'une déclinaison", () => {
  it("naît vivante, jamais publiée, ni défaut, ni détachée", () => {
    expect(aLifecycle()).toMatchObject({
      isDefault: false,
      isDiscontinued: false,
      detachedToProductId: null,
      hasBeenPublished: false,
    });
  });

  it("une publication ne se défait pas : l'état rendu est neuf, l'ancien intact", () => {
    const born = aLifecycle();
    expect(born.markPublished().hasBeenPublished).toBe(true);
    expect(born.hasBeenPublished).toBe(false);
  });

  it("n'arrête qu'une fois, en nommant la référence", () => {
    const stopped = aLifecycle().discontinue(SKU);
    expect(stopped.isDiscontinued).toBe(true);
    expect(() => stopped.discontinue(SKU)).toThrow(VariantAlreadyDiscontinuedError);
  });

  it("ne restaure qu'une arrêtée, et refuse celle devenue un produit", () => {
    expect(() => aLifecycle().restore(SKU)).toThrow(VariantNotDiscontinuedError);
    expect(aLifecycle().discontinue(SKU).restore(SKU).isDiscontinued).toBe(false);
    const detached = aLifecycle().detachTo(SKU, "prd_2");
    expect(detached).toMatchObject({ isDiscontinued: true, detachedToProductId: "prd_2" });
    expect(() => detached.restore(SKU, "Gros florentin")).toThrow(
      DetachedVariantNotRestorableError,
    );
  });

  it("passe et cède la place de défaut", () => {
    expect(aLifecycle().promote().isDefault).toBe(true);
    expect(aLifecycle().promote().demote().isDefault).toBe(false);
  });
});
