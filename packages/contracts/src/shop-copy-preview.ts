import type { ContentLocale } from "./platform-content.js";

/**
 * **Le protocole entre l'éditeur des textes et l'application d'aperçu** —
 * `documentation/contenu-ecommerce/plan-textes-de-la-boutique.md`, §5 et §10
 * (B3).
 *
 * L'éditeur (back-office) encadre l'application d'aperçu dans une `<iframe>`
 * et lui parle par `postMessage`. Les deux côtés n'acceptent un message QUE de
 * l'origine attendue, et n'en envoient qu'à elle — jamais `'*'`. Ce fichier ne
 * porte que des TYPES : aucun des deux fronts n'embarque zod pour lui.
 *
 * Chaque message porte `source: "lfc-shop-copy-preview"` : un message d'une
 * autre provenance (extension, outil de développement) qui partagerait
 * l'origine est ignoré sans bruit.
 */
export const SHOP_COPY_PREVIEW_SOURCE = "lfc-shop-copy-preview";

/** Les parcours simulés (§6 du plan). L'aperçu sait les jouer ; l'éditeur les liste. */
export const SHOP_COPY_PREVIEW_JOURNEYS = [
  "visitor-first-visit",
  "visitor-choosing-place",
  "visitor-cart-without-place",
  "visitor-ready-to-pay",
  "visitor-confirmation",
  "customer-signed-in",
  "pro-on-account",
  "shop-closed",
] as const;
export type ShopCopyPreviewJourney = (typeof SHOP_COPY_PREVIEW_JOURNEYS)[number];

/** La largeur simulée. */
export type ShopCopyPreviewViewport = "mobile" | "desktop";

/** Éditeur → aperçu : l'état complet à afficher. Idempotent : le dernier gagne. */
export interface ShopCopyPreviewShowMessage {
  readonly source: typeof SHOP_COPY_PREVIEW_SOURCE;
  readonly type: "show";
  readonly journey: ShopCopyPreviewJourney;
  readonly locale: ContentLocale;
  readonly viewport: ShopCopyPreviewViewport;
  /** Les brouillons à appliquer PAR-DESSUS le publié : clé → texte de la langue affichée. */
  readonly drafts: Readonly<Record<string, string>>;
  /** Les remplacements publiés de la langue affichée (ceux de `GET /shop/copy`). */
  readonly published: Readonly<Record<string, string>>;
  /** La clé en cours d'édition, à surligner ; `null` : rien. */
  readonly highlight: string | null;
}

/** Éditeur → aperçu : les messages possibles. */
export type ShopCopyPreviewInbound = ShopCopyPreviewShowMessage;

/** Aperçu → éditeur : prêt à recevoir (envoyé au chargement, puis à chaque redémarrage). */
export interface ShopCopyPreviewReadyMessage {
  readonly source: typeof SHOP_COPY_PREVIEW_SOURCE;
  readonly type: "ready";
}

/** Aperçu → éditeur : on a cliqué un texte de l'aperçu ; ouvrir sa clé. */
export interface ShopCopyPreviewPickMessage {
  readonly source: typeof SHOP_COPY_PREVIEW_SOURCE;
  readonly type: "pick";
  readonly key: string;
}

/** Aperçu → éditeur : les clés que l'écran affiché montre, pour filtrer l'arbre. */
export interface ShopCopyPreviewVisibleKeysMessage {
  readonly source: typeof SHOP_COPY_PREVIEW_SOURCE;
  readonly type: "visible-keys";
  readonly keys: readonly string[];
}

/** Aperçu → éditeur : les messages possibles. */
export type ShopCopyPreviewOutbound =
  ShopCopyPreviewReadyMessage | ShopCopyPreviewPickMessage | ShopCopyPreviewVisibleKeysMessage;

/** Est-ce un message du protocole ? Garde de forme minimale, sans zod. */
export function isShopCopyPreviewMessage(
  data: unknown,
): data is { readonly source: typeof SHOP_COPY_PREVIEW_SOURCE; readonly type: string } {
  return (
    typeof data === "object" &&
    data !== null &&
    "source" in data &&
    data.source === SHOP_COPY_PREVIEW_SOURCE &&
    "type" in data &&
    typeof data.type === "string"
  );
}
