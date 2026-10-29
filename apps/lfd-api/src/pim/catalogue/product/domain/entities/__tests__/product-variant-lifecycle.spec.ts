import { bareVariant, tarte } from "../../../application/__tests__/audience-doubles.js";
import { VariantNotFoundError } from "../../errors/product-errors.js";
import {
  DefaultVariantNotDetachableError,
  DefaultVariantNotDiscontinuableError,
  DetachedVariantNotRestorableError,
  LastLiveVariantNotDiscontinuableError,
  VariantAlreadyDiscontinuedError,
  VariantNotDiscontinuedError,
} from "../../errors/variant-lifecycle-errors.js";
import { Sku } from "../../value-objects/sku.value-object.js";
import { Product } from "../product.js";

/**
 * **Archiver, détacher, désarchiver une déclinaison**
 * (`plan-gestes-de-declinaison.md`, G1 et G2) : l'agrégat porte les refus, et
 * une déclinaison sortie de la vente reste dans l'agrégat, rang compris.
 */

const DEFAULT_ID = "prd_tarte_v1";
const SECOND_ID = "prd_tarte_v2";
const THIRD_ID = "prd_tarte_v3";

function product(): Product {
  return Product.reconstitute(
    tarte({
      vatByContext: { b2b: "vat_20" },
      audience: "pro",
      requiresCold: true,
      variants: [
        bareVariant({
          priceCents: 3_200,
          weightGrams: 900,
          proPriceMillicents: 2_730_331,
          minQuantities: { pro: 6, public: null },
          allergenSheet: { declared: ["gluten"], mayContain: ["eggs"] },
        }),
        bareVariant({
          id: SECOND_ID,
          sku: "PAT-7-2",
          name: { fr: "Six parts" },
          isDefault: false,
          position: 1,
          pricingFollowsDefault: true,
          regulatoryFollowsDefault: true,
          minQuantityFollowsDefault: true,
        }),
        bareVariant({
          id: THIRD_ID,
          sku: "PAT-7-3",
          isDefault: false,
          position: 2,
          priceCents: 500,
        }),
      ],
    }),
  );
}

function variantOf(subject: Product, id: string) {
  return subject.snapshot().variants.find((variant) => variant.id === id);
}

function detach(subject: Product, variantId = SECOND_ID): Product {
  return subject.detachVariant(variantId, {
    id: "prd_neuf",
    sku: Sku.create("P-NEUF22"),
    defaultVariant: { id: "prd_neuf_v1", sku: Sku.create("P-NEUF22-1") },
  });
}

describe("Product.discontinueVariant", () => {
  it("archive une déclinaison sans la retirer de l'agrégat", () => {
    const subject = product();

    subject.discontinueVariant(SECOND_ID);

    expect(variantOf(subject, SECOND_ID)?.isDiscontinued).toBe(true);
    expect(subject.snapshot().variants).toHaveLength(3);
  });

  it("refuse le défaut tant que d'autres sont en vente", () => {
    expect(() => product().discontinueVariant(DEFAULT_ID)).toThrow(
      DefaultVariantNotDiscontinuableError,
    );
  });

  it("refuse la dernière déclinaison vivante : c'est la fiche qu'on archive", () => {
    const subject = product();
    subject.discontinueVariant(SECOND_ID);
    subject.discontinueVariant(THIRD_ID);

    expect(() => subject.discontinueVariant(DEFAULT_ID)).toThrow(
      LastLiveVariantNotDiscontinuableError,
    );
  });

  it("refuse une déclinaison déjà archivée", () => {
    const subject = product();
    subject.discontinueVariant(SECOND_ID);

    expect(() => subject.discontinueVariant(SECOND_ID)).toThrow(VariantAlreadyDiscontinuedError);
  });

  it("refuse la déclinaison d'une autre fiche", () => {
    expect(() => product().discontinueVariant("prd_autre_v1")).toThrow(VariantNotFoundError);
  });

  /** Exigence de Hugo (2026-10-29) : après un `-2` archivé, la suivante est `-3`, jamais `-2-2`. */
  it("garde le rang d'une archivée pris : la suivante vient après elle", () => {
    const subject = product();
    subject.discontinueVariant(THIRD_ID);

    expect(subject.nextVariantPosition).toBe(3);
  });
});

describe("Product.detachVariant", () => {
  it("fait naître un brouillon qui porte en propre ce que la déclinaison voyait", () => {
    const born = detach(product()).snapshot();
    const [variant] = born.variants;

    expect(born).toMatchObject({
      id: "prd_neuf",
      sku: "P-NEUF22",
      name: { fr: "Six parts" },
      status: "draft",
      categoryId: "cat_patisserie",
      vatByContext: { b2b: "vat_20" },
      audience: "pro",
      requiresCold: true,
      originVariantId: SECOND_ID,
    });
    expect(born.variants).toHaveLength(1);
    expect(variant).toMatchObject({
      id: "prd_neuf_v1",
      sku: "P-NEUF22-1",
      isDefault: true,
      isDiscontinued: false,
      position: 0,
      priceCents: 3_200,
      weightGrams: 900,
      proPriceMillicents: 2_730_331,
      minQuantities: { pro: 6, public: null },
      allergenSheet: { declared: ["gluten"], mayContain: ["eggs"] },
      pricingFollowsDefault: false,
      regulatoryFollowsDefault: false,
      minQuantityFollowsDefault: false,
      hasBeenPublished: false,
    });
  });

  it("les valeurs sont écrites EN PROPRE, pas suivies : l'instantané persisté les porte", () => {
    const [variant] = detach(product()).persistenceSnapshot().variants;

    expect(variant?.priceCents).toBe(3_200);
    expect(variant?.minQuantities).toEqual({ pro: 6, public: null });
  });

  it("archive l'origine en la disant devenue le nouveau produit", () => {
    const origin = product();
    detach(origin);

    expect(variantOf(origin, SECOND_ID)).toMatchObject({
      isDiscontinued: true,
      detachedToProductId: "prd_neuf",
    });
  });

  it("refuse le défaut", () => {
    expect(() => detach(product(), DEFAULT_ID)).toThrow(DefaultVariantNotDetachableError);
  });

  it("refuse une déclinaison archivée", () => {
    const subject = product();
    subject.discontinueVariant(THIRD_ID);

    expect(() => detach(subject, THIRD_ID)).toThrow(VariantAlreadyDiscontinuedError);
  });

  /** Exigence de Hugo (2026-10-29) : détacher `-2` puis ajouter → `-3`. */
  it("après un détachement, la prochaine déclinaison ne reprend pas son rang", () => {
    const subject = Product.reconstitute(
      tarte({
        variants: [
          bareVariant(),
          bareVariant({ id: SECOND_ID, sku: "PAT-7-2", isDefault: false, position: 1 }),
        ],
      }),
    );
    detach(subject);

    expect(subject.nextVariantPosition).toBe(2);
  });
});

describe("Product.restoreVariant", () => {
  it("remet en vente une archivée, à son rang et sous sa référence", () => {
    const subject = product();
    subject.discontinueVariant(THIRD_ID);

    subject.restoreVariant(THIRD_ID);

    expect(variantOf(subject, THIRD_ID)).toMatchObject({
      isDiscontinued: false,
      sku: "PAT-7-3",
      position: 2,
    });
  });

  it("refuse une déclinaison qui n'est pas archivée", () => {
    expect(() => product().restoreVariant(THIRD_ID)).toThrow(VariantNotDiscontinuedError);
  });

  it("refuse une déclinaison devenue un produit, en le nommant", () => {
    const subject = product();
    detach(subject);

    expect(() => subject.restoreVariant(SECOND_ID, "P-NEUF22 — Six parts")).toThrow(
      DetachedVariantNotRestorableError,
    );
    expect(() => subject.restoreVariant(SECOND_ID, "P-NEUF22 — Six parts")).toThrow(
      /P-NEUF22 — Six parts/u,
    );
  });
});
