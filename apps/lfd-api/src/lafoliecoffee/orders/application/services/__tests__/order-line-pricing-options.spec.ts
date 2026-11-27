import type { CatalogOptionGroup } from "../../../../catalog/domain/option-groups/catalog-option-groups.js";
import { InMemoryOfferedOptionGroups } from "../../../../catalog/infrastructure/in-memory-offered-option-groups.js";
import {
  OptionChoiceNotOfferedError,
  OptionGroupNotOfferedError,
  OptionQuantityAboveLineError,
} from "../../../domain/errors/order-option-errors.js";
import { catalogItem, pricingOf } from "./shop-cart-quoting.doubles.js";

/**
 * Les options d'une ligne au chemin qui facture (`plan-options-de-commande.md`,
 * § 3.3) : jugées contre ce que le catalogue propose à la clientèle du CLIENT,
 * figées avec leurs libellés — et sans toucher au prix.
 */
const SLICING: CatalogOptionGroup = {
  id: "og_slicing",
  name: "Tranchage",
  choices: [
    { key: "sliced", label: "tranché", audience: "both" },
    { key: "crate", label: "en caisse", audience: "pro" },
  ],
};

const CATALOG = [catalogItem("PAIN", "Pain de campagne", 300_000, 5.5)];
const PRO = { companyId: "co_1", buyerKind: "registered" } as const;
const GUEST = { companyId: null, buyerKind: "guest" } as const;

function withOptions() {
  const options = new InMemoryOfferedOptionGroups(new Map([["PAIN", [SLICING]]]));
  return { options, pricing: pricingOf(CATALOG, {}, { options }) };
}

describe("OrderLinePricing — les options de la ligne", () => {
  it("fige « dont 2 tranchés » sur la ligne fusionnée, au même prix qu'une ligne sans option", async () => {
    const { pricing } = withOptions();

    const [optioned] = await pricing.resolve(
      [
        {
          sku: "PAIN",
          quantity: 2,
          optionChoices: [{ group: "og_slicing", choice: "sliced", quantity: 1 }],
        },
        {
          sku: "PAIN",
          quantity: 2,
          optionChoices: [{ group: "og_slicing", choice: "sliced", quantity: 1 }],
        },
      ],
      PRO,
      "checkout",
    );
    const [bare] = await pricing.resolve([{ sku: "PAIN", quantity: 4 }], PRO, "checkout");

    expect(optioned?.line.optionChoices).toEqual([
      {
        group: "og_slicing",
        groupName: "Tranchage",
        choice: "sliced",
        choiceLabel: "tranché",
        quantity: 2,
        position: 0,
      },
    ]);
    const { optionChoices: _o, ...optionedRest } = optioned?.line ?? {};
    expect(optionedRest).toEqual(bare?.line);
  });

  it("un panier sans option ne lit pas les groupes", async () => {
    const { pricing, options } = withOptions();

    await pricing.resolve([{ sku: "PAIN", quantity: 4 }], PRO, "checkout");

    expect(options.reads).toEqual([]);
  });

  it("🔴 un particulier ne peut pas demander un choix réservé aux pros", async () => {
    const { pricing } = withOptions();

    await expect(
      pricing.resolve(
        [
          {
            sku: "PAIN",
            quantity: 2,
            optionChoices: [{ group: "og_slicing", choice: "crate", quantity: 1 }],
          },
        ],
        GUEST,
        "checkout",
      ),
    ).rejects.toBeInstanceOf(OptionChoiceNotOfferedError);
  });

  it("un pro, si", async () => {
    const { pricing } = withOptions();

    const [line] = await pricing.resolve(
      [
        {
          sku: "PAIN",
          quantity: 2,
          optionChoices: [{ group: "og_slicing", choice: "crate", quantity: 1 }],
        },
      ],
      PRO,
      "checkout",
    );

    expect(line?.line.optionChoices?.[0]?.choiceLabel).toBe("en caisse");
  });

  it("refuse un groupe que la fiche n'active pas", async () => {
    const { pricing } = withOptions();

    await expect(
      pricing.resolve(
        [
          {
            sku: "PAIN",
            quantity: 2,
            optionChoices: [{ group: "og_wrap", choice: "wrapped", quantity: 1 }],
          },
        ],
        PRO,
        "checkout",
      ),
    ).rejects.toBeInstanceOf(OptionGroupNotOfferedError);
  });

  it("refuse plus d'options que la ligne fusionnée n'a d'unités", async () => {
    const { pricing } = withOptions();

    await expect(
      pricing.resolve(
        [
          {
            sku: "PAIN",
            quantity: 2,
            optionChoices: [{ group: "og_slicing", choice: "sliced", quantity: 3 }],
          },
        ],
        PRO,
        "checkout",
      ),
    ).rejects.toBeInstanceOf(OptionQuantityAboveLineError);
  });
});
