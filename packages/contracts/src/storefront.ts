import {
  CAROUSEL_NAVS,
  DEFAULT_TONE,
  MEDIA_FITS,
  MEDIA_SIDES,
  STOREFRONT_SHAPES,
  STOREFRONT_TONES,
} from "@lfd/storefront-layout";
import { z } from "zod";

/**
 * **La vitrine** — le contrat de l'éditeur (admin) et de la boutique (public).
 *
 * Plan : `documentation/order/plan-vitrine-enregistrement.md` (D2 à D8).
 * Conception : `documentation/order/boutique-rayon-layout.md`, « Composer une
 * page ».
 *
 * Ces schémas ne valident que la **forme** : chevauchement, débordement, côté
 * d'image permis par la forme, bornes du défilement et longueurs de texte sont
 * des règles de l'agrégat `Storefront`, qui les refuse en le disant. Les
 * listes fermées (formes, cadrages, côtés, navigations) viennent de
 * `@lfd/storefront-layout` : une seule table, que l'éditeur, le serveur et la
 * boutique lisent.
 */

/** Un texte localisé : le français est obligatoire, l'anglais et l'italien facultatifs. */
export const storefrontTextSchema = z.object({
  fr: z.string(),
  en: z.string().optional(),
  it: z.string().optional(),
});
export type StorefrontText = z.infer<typeof storefrontTextSchema>;

/**
 * Le défilement d'un objet à plusieurs contenus. Toujours transmis et
 * toujours stocké : un objet repassé à un seul contenu le garde, inactif.
 * `sampleCount` est le nombre de contenus SIMULÉ par l'aperçu de l'éditeur.
 */
export const storefrontCarouselSchema = z.object({
  nav: z.enum(CAROUSEL_NAVS),
  autoplay: z.boolean(),
  intervalSeconds: z.number().int(),
  firstSeconds: z.number().int(),
  sampleCount: z.number().int(),
});
export type StorefrontCarousel = z.infer<typeof storefrontCarouselSchema>;

/** Les réglages d'un objet — ce qu'un gabarit en garde (ni position, ni rayons, ni contenus). */
const settingsShape = {
  shape: z.enum(STOREFRONT_SHAPES),
  applyOnMobile: z.boolean(),
  mediaFit: z.enum(MEDIA_FITS),
  mediaSide: z.enum(MEDIA_SIDES),
  /** `false` : un seul contenu, et le défilement est conservé mais inactif. */
  multiple: z.boolean(),
  carousel: storefrontCarouselSchema,
  /**
   * L'allure de fond (D3). Absent : `light`. Accepté sur tout objet — un
   * produit en carte 1×1 l'ignore au rendu (`toneApplies`), il ne le refuse pas.
   */
  tone: z.enum(STOREFRONT_TONES).default(DEFAULT_TONE),
};

/** Un contenu **produit** ne porte QUE le SKU (D4) : la boutique le résout dans son catalogue. */
export const storefrontProductContentSchema = z.object({
  kind: z.literal("product"),
  sku: z.string(),
});

/** L'image d'une info : une URL de la médiathèque, et son texte alternatif. */
export const storefrontImageSchema = z.object({
  url: z.string(),
  alt: storefrontTextSchema.nullable(),
});

/** Un contenu **info** : pastille, titre, phrase, image, lien vers un rayon. */
export const storefrontInfoContentSchema = z.object({
  kind: z.literal("info"),
  badge: storefrontTextSchema.nullable(),
  title: storefrontTextSchema,
  lede: storefrontTextSchema.nullable(),
  image: storefrontImageSchema.nullable(),
  linkShelfKey: z.string().nullable(),
});

export const storefrontContentSchema = z.discriminatedUnion("kind", [
  storefrontProductContentSchema,
  storefrontInfoContentSchema,
]);
export type StorefrontContent = z.infer<typeof storefrontContentSchema>;

/** Une page : un rayon (`all` ou l'identifiant d'une famille du référentiel), et ses rangées. */
export const storefrontPageSchema = z.object({
  shelfKey: z.string(),
  rows: z.number().int(),
});
export type StorefrontPage = z.infer<typeof storefrontPageSchema>;

/**
 * Un objet posé. `id` absent : un objet NEUF, que le serveur identifie. Un
 * objet chargé qui n'est plus dans la liste est ARCHIVÉ (D6).
 */
export const storefrontObjectPayloadSchema = z.object({
  id: z.string().optional(),
  ...settingsShape,
  column: z.number().int(),
  row: z.number().int(),
  shelves: z.array(z.string()),
  contents: z.array(storefrontContentSchema),
});
export type StorefrontObjectPayload = z.infer<typeof storefrontObjectPayloadSchema>;

/** Un gabarit. `id` absent : un gabarit neuf. */
export const storefrontTemplatePayloadSchema = z.object({
  id: z.string().optional(),
  name: z.string(),
  description: z.string().nullable(),
  ...settingsShape,
});
export type StorefrontTemplatePayload = z.infer<typeof storefrontTemplatePayloadSchema>;

/**
 * L'enregistrement de la vitrine ENTIÈRE (D2, D6). `revision` est celle que
 * l'éditeur a chargée : si quelqu'un a enregistré depuis, le serveur refuse
 * (409) plutôt que d'écraser.
 */
export const storefrontPayloadSchema = z.object({
  revision: z.number().int().nonnegative(),
  pages: z.array(storefrontPageSchema),
  objects: z.array(storefrontObjectPayloadSchema),
  templates: z.array(storefrontTemplatePayloadSchema),
});
export type StorefrontPayload = z.infer<typeof storefrontPayloadSchema>;

/** Un objet tel que l'éditeur le relit. */
export type StorefrontObjectView = Omit<StorefrontObjectPayload, "id"> & { readonly id: string };

/** Ce que l'éditeur ENVOIE (le ton peut y manquer : le serveur pose `light`). */
export type StorefrontPayloadInput = z.input<typeof storefrontPayloadSchema>;

/** Un gabarit tel que l'éditeur le relit. */
export type StorefrontTemplateView = Omit<StorefrontTemplatePayload, "id"> & {
  readonly id: string;
};

/**
 * La vitrine telle que l'éditeur la charge — `GET /admin/storefront`. Une
 * vitrine jamais enregistrée se lit `{ revision: 0 }`, vide (D6).
 */
export interface StorefrontView {
  readonly revision: number;
  /** ISO 8601 ; `null` tant que personne n'a enregistré. */
  readonly updatedAt: string | null;
  readonly pages: readonly StorefrontPage[];
  readonly objects: readonly StorefrontObjectView[];
  readonly templates: readonly StorefrontTemplateView[];
}

/** Un objet tel que la boutique le compose. `carousel` : `null` pour un seul contenu. */
export interface PublicStorefrontObjectView {
  readonly id: string;
  readonly shape: StorefrontObjectPayload["shape"];
  readonly column: number;
  readonly row: number;
  readonly applyOnMobile: boolean;
  readonly mediaFit: StorefrontObjectPayload["mediaFit"];
  readonly mediaSide: StorefrontObjectPayload["mediaSide"];
  readonly carousel: Omit<StorefrontCarousel, "sampleCount"> | null;
  readonly tone: StorefrontObjectPayload["tone"];
  /** Dans l'ordre de défilement. */
  readonly contents: readonly StorefrontContent[];
}

/**
 * La page d'un rayon — `GET /shop/storefront/:shelfKey` (D8). Objets archivés
 * exclus. Un rayon sans page rend `{ rows: 0, objects: [] }` : la boutique
 * l'affiche comme aujourd'hui, en cartes.
 */
export interface PublicStorefrontPageView {
  readonly rows: number;
  readonly objects: readonly PublicStorefrontObjectView[];
}
