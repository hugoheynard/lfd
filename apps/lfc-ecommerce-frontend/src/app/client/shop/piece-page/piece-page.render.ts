/**
 * **L'en-tête d'une fiche article, posé AVANT le JavaScript** — titre,
 * description, adresse canonique, Open Graph — pour les robots et les aperçus
 * de lien, qui ne lisent pas ce que {@link PieceHead} écrit après coup (Hugo,
 * 2026-10-23).
 *
 * Fonctions PURES : la Pages Function `functions/boutique/article/[sku].ts`
 * leur passe le catalogue public déjà lu et l'`index.html` statique, et pose
 * les en-têtes. Même forme que `privacy-page.render.ts`.
 *
 * ⚠️ Vit sous `src/` pour être éprouvé par `ng test`, mais aucune page Angular
 * ne l'importe : il n'entre pas dans le bundle. Il n'importe du contrat QUE
 * `product-path` (sans zod).
 *
 * 🔴 **Rien que le catalogue public anonyme.** La Function lit
 * `GET /shop/catalogue` sans jeton ni `?audience=` : un article réservé aux
 * pros n'y sort pas. Il est refusé ici aussi, par défense : ses balises ne
 * fuiront pas même si la route s'élargissait.
 *
 * **Accord avec {@link PieceHead}** : les balises injectées sont celles qu'il
 * met à jour par sélecteur (`name=`, `property=`, `link[rel=canonical]`) et le
 * `<title>` est REMPLACÉ, pas doublé — l'app les réécrit sans en ajouter.
 */

import { productUrl } from '@lfd/contracts/product-path';

import { imageAlt } from '../image-alt';

/** La marque, après le nom d'un article — celle de {@link PieceHead}. */
const TITLE_SUFFIX = ' — La Folie Coffee';

const HTML_ESCAPES: Readonly<Record<string, string>> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

/** Ce que l'en-tête d'une fiche dit d'un article : rien de plus que la vitrine publique. */
export interface PublicPiece {
  readonly sku: string;
  readonly name: string;
  readonly note: string | null;
  readonly image: PieceImage | null;
}

/** L'image de l'aperçu : dimensions si la médiathèque les connaît, alt jamais une URL. */
export interface PieceImage {
  readonly url: string;
  readonly alt: string;
  readonly width: number | null;
  readonly height: number | null;
}

/** Échappe pour un contenu de balise ET une valeur d'attribut entre guillemets. */
export function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (character) => HTML_ESCAPES[character] ?? character);
}

/**
 * L'article `sku` dans la réponse de `GET /shop/catalogue`, ou `null` : absent,
 * réservé aux pros, ou réponse illisible. Lu sans zod, champ par champ.
 */
export function findPublicPiece(payload: unknown, sku: string): PublicPiece | null {
  const items = isRecord(payload) ? payload['items'] : undefined;
  if (!Array.isArray(items)) {
    return null;
  }
  const raw: unknown = items.find((item: unknown) => isRecord(item) && item['sku'] === sku);
  if (!isRecord(raw) || raw['audience'] === 'pro' || typeof raw['name'] !== 'string') {
    return null;
  }
  const note = raw['note'];
  const name = raw['name'];
  return {
    sku,
    name,
    note: typeof note === 'string' && note.trim() !== '' ? note : null,
    image: pieceImage(raw['image'], name) ?? pieceImage(raw['thumbnail'], name),
  };
}

/**
 * L'image d'une vue publique `{ url, alt, width, height }`. La vue publique
 * sert souvent `image: null` et la seule `thumbnail` (constaté en production
 * le 2026-10-23 sur `P-BDMCRD`) : l'appelant replie sur elle.
 *
 * L'alt : la médiathèque replie une alternative absente sur l'URL ; on prend
 * alors le nom de l'article — même règle que le flux vitrine (§7 bis).
 */
function pieceImage(value: unknown, name: string): PieceImage | null {
  if (!isRecord(value) || typeof value['url'] !== 'string' || value['url'] === '') {
    return null;
  }
  const alt = value['alt'];
  return {
    url: value['url'],
    alt: imageAlt(typeof alt === 'string' ? alt : null, name),
    width: positiveInteger(value['width']),
    height: positiveInteger(value['height']),
  };
}

function positiveInteger(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : null;
}

/**
 * L'`index.html` avec l'en-tête d'une fiche. `origin` = l'origine PUBLIQUE de
 * la boutique (`ZONE_CLIENT_FRONT`), jamais celle de la requête : derrière la
 * passerelle, la Function voit l'hôte `*.pages.dev`.
 */
export function renderPieceHead(indexHtml: string, piece: PublicPiece, origin: string): string {
  const url = productUrl(origin, piece.sku) ?? origin;
  const description = piece.note ?? piece.name;
  const tags = [
    `<meta name="description" content="${escapeHtml(description)}" />`,
    `<link rel="canonical" href="${escapeHtml(url)}" />`,
    `<meta property="og:type" content="product" />`,
    `<meta property="og:title" content="${escapeHtml(piece.name)}" />`,
    `<meta property="og:description" content="${escapeHtml(description)}" />`,
    `<meta property="og:url" content="${escapeHtml(url)}" />`,
    ...(piece.image === null ? [] : imageTags(piece.image, origin)),
    `<meta name="twitter:card" content="${piece.image === null ? 'summary' : 'summary_large_image'}" />`,
  ];
  return injectHead(withTitle(indexHtml, `${piece.name}${TITLE_SUFFIX}`), tags);
}

function imageTags(image: PieceImage, origin: string): readonly string[] {
  return [
    `<meta property="og:image" content="${escapeHtml(absolute(image.url, origin))}" />`,
    ...(image.width === null
      ? []
      : [`<meta property="og:image:width" content="${image.width}" />`]),
    ...(image.height === null
      ? []
      : [`<meta property="og:image:height" content="${image.height}" />`]),
    `<meta property="og:image:alt" content="${escapeHtml(image.alt)}" />`,
  ];
}

/** L'`index.html` d'un article absent : à ne pas indexer. */
export function renderMissingPieceHead(indexHtml: string): string {
  return injectHead(indexHtml, ['<meta name="robots" content="noindex" />']);
}

function withTitle(html: string, title: string): string {
  const tag = `<title>${escapeHtml(title)}</title>`;
  // Une fonction de remplacement : un `$` dans le nom ne doit pas être interprété.
  return /<title>[\s\S]*?<\/title>/.test(html)
    ? html.replace(/<title>[\s\S]*?<\/title>/, () => tag)
    : injectHead(html, [tag]);
}

function injectHead(html: string, tags: readonly string[]): string {
  const block = tags.map((tag) => `    ${tag}\n`).join('');
  return html.includes('</head>') ? html.replace('</head>', () => `${block}  </head>`) : html;
}

function absolute(path: string, origin: string): string {
  return /^https?:\/\//.test(path) ? path : `${origin.replace(/\/+$/, '')}${path}`;
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
