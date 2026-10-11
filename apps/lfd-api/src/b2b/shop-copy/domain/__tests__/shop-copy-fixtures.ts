import { ShopCopyManifest, type ShopCopyManifestEntry } from "../shop-copy-manifest.js";

/** L'instant des gestes : comparé à rien d'autre qu'à lui-même. */
export const AT = new Date(0);
export const LATER = new Date(60_000);

export const GREETING: ShopCopyManifestEntry = {
  key: "accueilPublic.hello.title",
  space: "accueilPublic",
  originals: { fr: "Bonjour {name}.", en: "Hello {name}.", it: "Buongiorno {name}." },
  variables: ["name"],
};

export const CART_TITLE: ShopCopyManifestEntry = {
  key: "cart.title",
  space: "cart",
  originals: { fr: "Panier", en: "Cart", it: "Carrello" },
  variables: [],
};

export const MANIFEST = ShopCopyManifest.of([GREETING, CART_TITLE]);

export const stamp = (at: Date = AT, staffId = "fiche-colette") => ({ at, staffId });
