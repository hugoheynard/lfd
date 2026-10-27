import type { ShopQuotePayload } from "@lfd/contracts";

import type { ProBasket } from "../../../domain/entities/__tests__/pro-baskets.fixture.js";
import type { ShopCartQuoting } from "../shop-cart-quoting.service.js";
import { catalogItem, quotingOf } from "./shop-cart-quoting.doubles.js";

/**
 * Un panier de `PRO_BASKETS` rejoué au DEVIS de la boutique, pour une société
 * active (`b2b`) : la remise du point, le barème de la zone et le mode de TVA
 * du port en sont tirés. La surtaxe n'existe pas au devis — elle est ignorée.
 */
export function proQuoteOf(basket: ProBasket): {
  readonly quoting: ShopCartQuoting;
  readonly payload: ShopQuotePayload;
} {
  const skus = basket.lines.map((_, i) => `SKU-${String(i)}`);
  const excluded = basket.lines.some(([, , , eligible]) => eligible === false);
  const quoting = quotingOf({
    catalog: basket.lines.map(([price, , rate], i) =>
      catalogItem(skus[i] ?? "", `Article ${String(i)}`, price, rate),
    ),
    companyStatus: "active",
    b2b:
      basket.discount === undefined
        ? null
        : {
            adjustment: basket.discount,
            scope: "all_except",
            categories: excluded ? [{ categoryId: "c_excl", eligible: false }] : [],
            products: [],
          },
    classified: Object.fromEntries(
      basket.lines.map(([, , , eligible], i) => [
        skus[i] ?? "",
        {
          productId: `p_${String(i)}`,
          categoryId: eligible === false ? "c_excl" : "c_in",
          categoryPath: [eligible === false ? "c_excl" : "c_in"],
        },
      ]),
    ),
    zone:
      basket.fee === undefined
        ? null
        : { id: "zone_1", postalPrefixes: ["73"], label: "Savoie", fee: basket.fee },
    deliveryVatMode: basket.vatMode ?? "standard",
  });
  return {
    quoting,
    payload: {
      lines: basket.lines.map(([, quantity], i) => ({ sku: skus[i] ?? "", quantity })),
      fulfillment:
        basket.fee === undefined
          ? { method: "pickup", pickupAddressId: "pickup_1" }
          : { method: "delivery", codePostal: "73000" },
    },
  };
}
