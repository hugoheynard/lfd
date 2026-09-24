import {
  CAROUSEL_NAVS,
  DEFAULT_TONE,
  MEDIA_FITS,
  MEDIA_SIDES,
  STOREFRONT_SHAPES,
  STOREFRONT_TONES,
} from "@lfd/storefront-layout";
import { z } from "zod";

import type { ShopOperationState } from "./shop-catalogue.js";

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

/**
 * Ce que fait une annonce au clic (D11 de
 * `documentation/order/architecture-operations-datees.md`) : rien, ouvrir un
 * rayon (`linkShelfKey`), ou ouvrir le rayon `op:<key>` d'une opération datée
 * (`operationKey`). Formule et page viendront à leur propre chantier.
 */
export const STOREFRONT_INFO_ACTIONS = ["none", "shelf", "operation"] as const;
export type StorefrontInfoAction = (typeof STOREFRONT_INFO_ACTIONS)[number];

/**
 * Un contenu **info** — une annonce : pastille, titre, phrase, image, et son
 * action au clic.
 *
 * L'action se **déduit** des cibles : `operation` si `operationKey`, `shelf`
 * si `linkShelfKey`, `none` sinon — les deux cibles à la fois sont refusées.
 * `action` est donc facultative à l'écriture (un éditeur qui ne la connaît
 * pas reste valide) ; si elle est envoyée, elle doit dire la même chose que
 * les cibles. À la lecture, le serveur la rend toujours.
 *
 * **Liée à une opération**, l'annonce HÉRITE : `badge`, `lede` et `image` à
 * `null`, et `title.fr` vide, prennent la valeur de l'opération à la lecture
 * publique ; un champ rempli la surcharge.
 */
export const storefrontInfoContentSchema = z.object({
  kind: z.literal("info"),
  badge: storefrontTextSchema.nullable(),
  /** `fr` vide : hérité de l'opération — permis seulement avec `operationKey`. */
  title: storefrontTextSchema,
  lede: storefrontTextSchema.nullable(),
  image: storefrontImageSchema.nullable(),
  linkShelfKey: z.string().nullable(),
  /** Absent = `null` : un éditeur d'avant les opérations n'en envoie pas. */
  operationKey: z.string().nullable().optional(),
  action: z.enum(STOREFRONT_INFO_ACTIONS).optional(),
});
export type StorefrontInfoContent = z.infer<typeof storefrontInfoContentSchema>;

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
  /** Dans l'ordre de défilement. Les annonces d'une opération éteinte n'y sont plus. */
  readonly contents: readonly PublicStorefrontContent[];
}

/**
 * L'opération d'une annonce, telle que la boutique en tire son badge
 * (« Dès le 15 nov. », « J‑18 », « Commandes closes ») et son clic (le rayon
 * `op:<key>`). Dates EFFECTIVES, comme {@link ShopOperationView} : la clôture
 * tient compte de la réception.
 */
export interface PublicStorefrontOperationView {
  readonly key: string;
  readonly state: ShopOperationState;
  /** Instant ISO d'ouverture de la commande (l'annonce quand le référentiel n'en fixe pas). */
  readonly orderFrom: string;
  /** Instant ISO de clôture. */
  readonly orderUntil: string;
  /** Jours `AAAA-MM-JJ`. */
  readonly pickupFrom: string;
  readonly pickupUntil: string;
}

/**
 * Une annonce telle que la boutique la reçoit : les champs hérités déjà
 * remplis (le titre n'est jamais vide), et `operation` quand elle est liée à
 * une opération — `null` sinon. `badge: null` sur une annonce liée : la
 * boutique le calcule depuis `operation`.
 */
export type PublicStorefrontInfoContent = StorefrontInfoContent & {
  readonly operation?: PublicStorefrontOperationView | null;
};

/** Un contenu tel que la boutique le compose. */
export type PublicStorefrontContent =
  z.infer<typeof storefrontProductContentSchema> | PublicStorefrontInfoContent;

/**
 * La page d'un rayon — `GET /shop/storefront/:shelfKey` (visiteur, clientèle
 * `public`) et `GET /shop/storefront/:shelfKey/mine` (reconnu : `pro` quand une
 * société est résolue). Objets archivés exclus ; une annonce dont l'opération
 * n'est pas montrée à cette clientèle maintenant est omise — l'objet peut
 * alors rester sans contenu, et rend ses cases (`isRenderable`). Un rayon sans page rend `{ rows: 0, objects: [] }` : la boutique
 * l'affiche comme aujourd'hui, en cartes.
 */
export interface PublicStorefrontPageView {
  readonly rows: number;
  readonly objects: readonly PublicStorefrontObjectView[];
}

/**
 * Un rayon que l'éditeur peut composer : une famille du catalogue, ou le rayon
 * `op:<key>` d'une opération reçue non retirée (`operation: true`, nom en
 * français) — D8 : sa vitrine se compose comme les autres.
 */
export const storefrontCatalogShelfSchema = z.object({
  key: z.string(),
  name: z.string(),
  operation: z.boolean(),
});
export type StorefrontCatalogShelf = z.infer<typeof storefrontCatalogShelfSchema>;

/**
 * Un article qu'un contenu produit peut désigner. `sku` est celui du PRODUIT,
 * que la boutique sert et résout. `served` : en vente dans au moins une des
 * deux boutiques — masqué des deux, aucune ne le résoudra.
 */
export const storefrontCatalogItemSchema = z.object({
  sku: z.string(),
  name: z.string(),
  shelfKey: z.string(),
  served: z.boolean(),
});
export type StorefrontCatalogItem = z.infer<typeof storefrontCatalogItemSchema>;

/**
 * L'état d'une opération pour l'éditeur, à l'horloge du serveur : en
 * préparation (avant l'annonce), annoncée, ouverte, close, terminée (après le
 * dernier jour de retrait) — ou `hidden` : masquée à la réception, ou sans
 * clientèle. Une annonce liée à une opération qui n'est ni `announced`, ni
 * `open`, ni `closed` ne paraît pas en boutique.
 */
export const STOREFRONT_OPERATION_STATES = [
  "preparing",
  "announced",
  "open",
  "closed",
  "ended",
  "hidden",
] as const;
export type StorefrontOperationState = (typeof STOREFRONT_OPERATION_STATES)[number];

/**
 * Une opération qu'une annonce peut désigner : les opérations reçues **non
 * retirées**, l'annonce la plus récente d'abord. Les textes servent au gris
 * de l'héritage dans l'éditeur ; les dates sont les dates effectives.
 */
export const storefrontCatalogOperationSchema = z.object({
  key: z.string(),
  name: storefrontTextSchema,
  lede: storefrontTextSchema.nullable(),
  image: z.object({ url: z.string(), alt: z.string() }).nullable(),
  state: z.enum(STOREFRONT_OPERATION_STATES),
  announceFrom: z.string(),
  orderFrom: z.string(),
  orderUntil: z.string(),
  pickupFrom: z.string(),
  pickupUntil: z.string(),
});
export type StorefrontCatalogOperation = z.infer<typeof storefrontCatalogOperationSchema>;

/**
 * Le catalogue tel que l'éditeur de vitrine le lit — `GET /admin/storefront/catalog`.
 *
 * Une lecture DÉDIÉE, murée par `b2b_storefront` : l'éditeur lisait
 * `/admin/catalog`, que la communication ne peut pas ouvrir. Elle ne rend que
 * ce que l'éditeur désigne — ni prix, ni réglages. `shelves` : les rayons des
 * opérations (en tête, comme en boutique), puis les familles qui portent au
 * moins un article servi, dans l'ordre du catalogue, sans « Tout ».
 */
export const storefrontCatalogViewSchema = z.object({
  shelves: z.array(storefrontCatalogShelfSchema),
  items: z.array(storefrontCatalogItemSchema),
  operations: z.array(storefrontCatalogOperationSchema),
});
export type StorefrontCatalogView = z.infer<typeof storefrontCatalogViewSchema>;
