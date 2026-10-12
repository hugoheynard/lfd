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

/**
 * **Les trois clientèles** que l'éditeur distingue : qui n'est pas connecté,
 * le particulier connecté, le pro dans l'espace de sa société. C'est la
 * question que l'écran pose d'abord — « qui regarde ? » — et tout le reste
 * (espaces, étapes, recherche) en découle.
 */
export const SHOP_COPY_AUDIENCES = ["visitor", "personal", "pro"] as const;
export type ShopCopyAudience = (typeof SHOP_COPY_AUDIENCES)[number];

/**
 * **Les sept étapes d'une commande**, les mêmes pour les trois clientèles
 * (Hugo, 2026-10-11) : Bienvenue, Acheminement, Horaire, Boutique, Panier,
 * Paiement, Confirmation. Ce qui change d'une clientèle à l'autre est ce que
 * l'étape montre, pas leur suite.
 */
export const SHOP_COPY_ORDER_STEPS = [
  "welcome",
  "routing",
  "time",
  "shop",
  "cart",
  "payment",
  "confirmation",
] as const;
export type ShopCopyOrderStep = (typeof SHOP_COPY_ORDER_STEPS)[number];

/**
 * **Hors commande** : les écrans qu'une clientèle connectée ouvre en dehors
 * du parcours. Aucun pour qui n'est pas connecté ; la fidélité au seul
 * particulier (pas de fidélité en pro, Hugo 2026-09-27) ; le compte de la
 * société au seul pro (`companyWorkspaceGuard`).
 */
export const SHOP_COPY_OUTSIDE_SCREENS = {
  visitor: [],
  personal: ["orders", "loyalty"],
  pro: ["orders", "account"],
} as const satisfies Readonly<Record<ShopCopyAudience, readonly string[]>>;
export type ShopCopyOutsideScreen = "orders" | "loyalty" | "account";

/** Une étape de l'aperçu : une des sept, ou un écran hors commande. */
export type ShopCopyPreviewStep = ShopCopyOrderStep | ShopCopyOutsideScreen;

/** Les étapes qu'une clientèle peut montrer — le type sur lequel l'aperçu est exhaustif. */
export type ShopCopyPreviewStepsOf<A extends ShopCopyAudience> =
  ShopCopyOrderStep | (typeof SHOP_COPY_OUTSIDE_SCREENS)[A][number];

/** Les étapes d'une clientèle, dans l'ordre : les sept, puis ses écrans hors commande. */
export function shopCopyPreviewStepsOf(audience: ShopCopyAudience): readonly ShopCopyPreviewStep[] {
  return [...SHOP_COPY_ORDER_STEPS, ...SHOP_COPY_OUTSIDE_SCREENS[audience]];
}

/** Cette clientèle a-t-elle cette étape ? (Un visiteur n'a pas de fidélité.) */
export function isShopCopyPreviewScene(
  audience: ShopCopyAudience,
  step: ShopCopyPreviewStep,
): boolean {
  return shopCopyPreviewStepsOf(audience).includes(step);
}

/** La largeur simulée. */
export type ShopCopyPreviewViewport = "mobile" | "desktop";

/**
 * La largeur, en pixels CSS, à laquelle la boutique est RENDUE pour chaque
 * largeur simulée — la colonne de l'éditeur la réduit ensuite à sa taille,
 * la fenêtre détachée s'ouvre à la largeur bureau. Une seule constante pour
 * les deux : les media queries de la boutique voient la même chose partout.
 */
export const SHOP_COPY_PREVIEW_VIEWPORT_WIDTHS: Readonly<Record<ShopCopyPreviewViewport, number>> =
  {
    mobile: 390,
    desktop: 1280,
  };

/** Éditeur → aperçu : l'état complet à afficher. Idempotent : le dernier gagne. */
export interface ShopCopyPreviewShowMessage {
  readonly source: typeof SHOP_COPY_PREVIEW_SOURCE;
  readonly type: "show";
  /** Qui regarde. */
  readonly audience: ShopCopyAudience;
  /** Où il en est — une étape que cette clientèle a (`isShopCopyPreviewScene`). */
  readonly step: ShopCopyPreviewStep;
  readonly locale: ContentLocale;
  readonly viewport: ShopCopyPreviewViewport;
  /** Les brouillons à appliquer PAR-DESSUS le publié : clé → texte de la langue affichée. */
  readonly drafts: Readonly<Record<string, string>>;
  /** Les remplacements publiés de la langue affichée (ceux de `GET /shop/copy`). */
  readonly published: Readonly<Record<string, string>>;
  /** La clé en cours d'édition, à surligner ; `null` : rien. */
  readonly highlight: string | null;
}

/**
 * Éditeur → aperçu : un texte tapé dans l'aperçu (`edit`) n'a PAS été
 * enregistré, et pourquoi — l'aperçu le dit sous son champ (2026-10-12).
 */
export interface ShopCopyPreviewEditRefusedMessage {
  readonly source: typeof SHOP_COPY_PREVIEW_SOURCE;
  readonly type: "edit-refused";
  readonly key: string;
  /** La phrase à afficher, déjà rédigée par l'éditeur (« Il faut garder {name} »). */
  readonly reason: string;
}

/** Éditeur → aperçu : les messages possibles. */
export type ShopCopyPreviewInbound = ShopCopyPreviewShowMessage | ShopCopyPreviewEditRefusedMessage;

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

/**
 * Aperçu → éditeur : les clés que l'écran affiché montre, pour filtrer l'arbre
 * — TOUT le document rendu (dialogues ouverts, contenu hors de la fenêtre),
 * dans l'ordre où elles y apparaissent.
 */
export interface ShopCopyPreviewVisibleKeysMessage {
  readonly source: typeof SHOP_COPY_PREVIEW_SOURCE;
  readonly type: "visible-keys";
  readonly keys: readonly string[];
}

/**
 * Aperçu → éditeur : un texte tapé EN PLACE dans l'aperçu (2026-10-12). Une
 * PROPOSITION : l'éditeur la traite comme une frappe dans sa colonne — il
 * vérifie la clé, la langue et les variables, puis l'API décide. Texte brut.
 */
export interface ShopCopyPreviewEditMessage {
  readonly source: typeof SHOP_COPY_PREVIEW_SOURCE;
  readonly type: "edit";
  readonly key: string;
  readonly locale: ContentLocale;
  readonly text: string;
}

/** Aperçu → éditeur : les messages possibles. */
export type ShopCopyPreviewOutbound =
  | ShopCopyPreviewReadyMessage
  | ShopCopyPreviewPickMessage
  | ShopCopyPreviewVisibleKeysMessage
  | ShopCopyPreviewEditMessage;

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
