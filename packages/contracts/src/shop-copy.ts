import { z } from "zod";

import { contentLocaleSchema, type ContentLocale } from "./platform-content.js";

/**
 * **Les textes de la boutique** — des remplacements du texte du code, par clé
 * et par langue (`documentation/contenu-ecommerce/plan-textes-de-la-boutique.md`,
 * §2, §3, §10).
 *
 * 🔴 Ces schémas ne disent que la FORME. Ce qui fait la validité d'un
 * remplacement — clé connue, mêmes variables, longueur bornée, texte brut —
 * dépend du manifeste que l'API embarque, et c'est le domaine qui le refuse.
 */

/** La langue demandée par la boutique. */
export const shopCopyLocaleQuerySchema = z.object({ locale: contentLocaleSchema });
export type ShopCopyLocaleQuery = z.infer<typeof shopCopyLocaleQuerySchema>;

/**
 * Ce que la boutique reçoit : les remplacements PUBLIÉS d'une langue, et rien
 * d'autre — ni brouillon, ni auteur. Une clé absente dit « le texte du code ».
 */
export interface PublishedShopCopyView {
  readonly locale: ContentLocale;
  /** La version publiée ; 0 tant que rien ne l'a jamais été. */
  readonly version: number;
  readonly texts: Readonly<Record<string, string>>;
}

/** Une clé du manifeste, bornée pour qu'un corps de requête ne soit pas un fourre-tout. */
const shopCopyKeySchema = z.string().trim().min(1).max(200);

/** La révision du texte que l'écran a lue — 0 pour un texte jamais touché. */
const expectedRevisionSchema = z.number().int().min(0);

/** Écrire le brouillon d'un texte (`PUT /admin/shop-copy/drafts`). */
export const shopCopyDraftPayloadSchema = z.object({
  key: shopCopyKeySchema,
  locale: contentLocaleSchema,
  text: z.string(),
  expectedRevision: expectedRevisionSchema,
});
export type ShopCopyDraftPayload = z.infer<typeof shopCopyDraftPayloadSchema>;

/** Remettre un texte à l'original au prochain « Publier » (`POST /admin/shop-copy/resets`). */
export const shopCopyResetPayloadSchema = z.object({
  key: shopCopyKeySchema,
  locale: contentLocaleSchema,
  expectedRevision: expectedRevisionSchema,
});
export type ShopCopyResetPayload = z.infer<typeof shopCopyResetPayloadSchema>;

/** Les trois états d'un brouillon (§10). */
export const SHOP_COPY_DRAFT_STATES = ["unchanged", "set", "reset"] as const;
export type ShopCopyDraftState = (typeof SHOP_COPY_DRAFT_STATES)[number];

/** Un texte dans une langue, tel que l'éditeur le voit. */
export interface ShopCopyLocaleView {
  /** Le texte du code — `null` pour une clé orpheline, que le code ne connaît plus. */
  readonly original: string | null;
  readonly draftState: ShopCopyDraftState;
  readonly draftText: string | null;
  readonly publishedText: string | null;
  /** 0 tant que personne n'a écrit ce texte : la révision à renvoyer. */
  readonly revision: number;
  readonly draftAt: string | null;
  readonly draftBy: string | null;
}

/** Une clé et ses trois langues. */
export interface ShopCopyEntryView {
  readonly key: string;
  /** L'espace (écran ou dialogue) ; `null` pour une orpheline. */
  readonly space: string | null;
  /** Les `{variables}` que tout remplacement doit garder. */
  readonly variables: readonly string[];
  readonly locales: Readonly<Record<ContentLocale, ShopCopyLocaleView>>;
  /**
   * Les traductions touchées AVANT le dernier geste sur le français (A2) : le
   * français a changé depuis, elles n'ont peut-être pas suivi.
   */
  readonly staleTranslations: readonly ContentLocale[];
}

/** L'écran d'édition : le manifeste entier, ce qui est en cours, et les orphelines. */
export interface ShopCopyAdminView {
  readonly version: number;
  readonly publishedAt: string | null;
  readonly publishedBy: string | null;
  /** Combien de textes, toutes langues, attendent « Publier ». */
  readonly pendingCount: number;
  readonly entries: readonly ShopCopyEntryView[];
  /** Remplacements dont la clé a quitté le code : lus, jamais appliqués. */
  readonly orphans: readonly ShopCopyEntryView[];
}

/** Ce que « Publier » rend : la version posée. */
export interface ShopCopyPublishedView {
  readonly version: number;
}

/** L'historique des publications : une page du journal. */
export const shopCopyHistoryQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
export type ShopCopyHistoryQuery = z.infer<typeof shopCopyHistoryQuerySchema>;
