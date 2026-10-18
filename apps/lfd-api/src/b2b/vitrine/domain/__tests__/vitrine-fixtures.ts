import type { ShopCatalogueView, ShopItemView, ShopOperationView } from "@lfd/contracts";

import type { VitrineShowcase } from "../services/vitrine-fingerprints.js";
import { VitrineSubscriber } from "../vitrine-subscriber.js";

/** Un instant de référence : les dates ne sont comparées qu'entre elles, jamais à l'horloge. */
export const AT = new Date(0);
export const LATER = new Date(60_000);

export function item(sku: string, overrides: Partial<ShopItemView> = {}): ShopItemView {
  return {
    sku,
    name: `Article ${sku}`,
    note: null,
    image: null,
    thumbnail: null,
    unitPriceMillicents: 250_000,
    unitPriceTtcCents: 264,
    vatRatePercent: 5.5,
    shelfId: "viennoiseries",
    isFeatured: false,
    audience: "public",
    ...overrides,
  };
}

export function operation(
  key: string,
  overrides: Partial<ShopOperationView> = {},
): ShopOperationView {
  return {
    key,
    name: { fr: `Opération ${key}` },
    lede: null,
    image: null,
    state: "open",
    orderFrom: "2026-01-01T00:00:00.000Z",
    orderUntil: "2026-01-02T00:00:00.000Z",
    pickupFrom: "2026-01-03T00:00:00.000Z",
    pickupUntil: "2026-01-04T00:00:00.000Z",
    skus: [],
    ...overrides,
  };
}

export function catalogue(overrides: Partial<ShopCatalogueView> = {}): ShopCatalogueView {
  return {
    shelves: [{ id: "viennoiseries", name: "Viennoiseries", position: 1 }],
    items: [item("CRO-01", { isFeatured: true }), item("PAI-01")],
    operations: [operation("galette")],
    ...overrides,
  };
}

/** La même vue dans les trois langues, et les mêmes textes. */
export function showcase(
  view: ShopCatalogueView = catalogue(),
  texts: Readonly<Record<string, string>> = { "product.bestSeller": "Incontournable" },
): VitrineShowcase {
  return {
    catalogues: { fr: view, en: view, it: view },
    texts: { fr: texts, en: texts, it: texts },
  };
}

export const ALL_CONTENTS = ["catalogue", "operations", "texts", "featured"] as const;

export function subscriber(
  overrides: { readonly id?: string; readonly contents?: readonly string[] } = {},
): VitrineSubscriber {
  return VitrineSubscriber.declare({
    id: overrides.id ?? "sub_agence",
    name: "Agence du site",
    endpointUrl: "https://agence.example/hooks/lfc",
    contents: overrides.contents ?? ALL_CONTENTS,
    credentials: { signingSecretSealed: "scelle", readKeyHash: "empreinte" },
    at: AT,
  });
}
