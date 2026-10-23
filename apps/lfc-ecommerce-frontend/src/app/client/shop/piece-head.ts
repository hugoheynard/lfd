import { DOCUMENT } from '@angular/common';
import { inject, Injectable } from '@angular/core';
import { Meta, Title } from '@angular/platform-browser';
import { productUrl, SHOP_PATH } from '@lfd/contracts/product-path';
import type { ShopItemView } from '@lfd/contracts';

/** Le titre de la boutique — celui que sa route déclare. */
const SHOP_TITLE = 'Boutique — La Folie Coffee';

/** La marque, après le nom d'un article dans l'onglet. */
const TITLE_SUFFIX = ' — La Folie Coffee';

/** Les balises qu'une fiche pose, et que la grille retire. */
const PIECE_TAGS = [
  'name="description"',
  'name="robots"',
  'property="og:type"',
  'property="og:title"',
  'property="og:description"',
  'property="og:url"',
  'property="og:image"',
  'name="twitter:card"',
] as const;

/**
 * **L'en-tête du document d'une fiche** — titre, description, adresse
 * canonique et Open Graph (Hugo, 2026-10-23 : une fiche se référence et se
 * partage).
 *
 * Posé par {@link PieceAddress} à l'ouverture, retiré à la fermeture : la
 * grille garde son titre et n'hérite pas de la description d'un article.
 * L'origine est celle du document — la boutique n'en connaît pas d'autre.
 *
 * Sur Cloudflare, la Pages Function `functions/boutique/article/[sku].ts` a
 * déjà posé ces balises dans l'`index.html` (`piece-page.render.ts`) : chacune
 * est retrouvée par son sélecteur et mise à jour, le `<title>` est remplacé —
 * jamais doublées.
 */
@Injectable()
export class PieceHead {
  private readonly title = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);

  /** La fiche d'un article en vente. */
  show(item: ShopItemView): void {
    const url = productUrl(this.document.location.origin, item.sku) ?? this.absolute(SHOP_PATH);
    this.title.setTitle(`${item.name}${TITLE_SUFFIX}`);
    this.meta.removeTag('name="robots"');
    this.put({ name: 'description', content: item.note ?? item.name });
    this.put({ property: 'og:type', content: 'product' });
    this.put({ property: 'og:title', content: item.name });
    this.put({ property: 'og:description', content: item.note ?? item.name });
    this.put({ property: 'og:url', content: url });
    this.put({
      name: 'twitter:card',
      content: item.image === null ? 'summary' : 'summary_large_image',
    });
    if (item.image === null) {
      this.meta.removeTag('property="og:image"');
    } else {
      this.put({ property: 'og:image', content: this.absolute(item.image.url) });
    }
    this.canonical(url);
  }

  /** Un article absent : la page ne doit pas être indexée. */
  missing(): void {
    this.reset();
    this.put({ name: 'robots', content: 'noindex' });
  }

  /** Retour à la grille. */
  reset(): void {
    this.title.setTitle(SHOP_TITLE);
    for (const selector of PIECE_TAGS) {
      this.meta.removeTag(selector);
    }
    this.canonical(this.absolute(SHOP_PATH));
  }

  private put(tag: { name?: string; property?: string; content: string }): void {
    const selector =
      tag.name === undefined ? `property="${tag.property ?? ''}"` : `name="${tag.name}"`;
    this.meta.updateTag(tag, selector);
  }

  private canonical(href: string): void {
    const head = this.document.head;
    let link = head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (link === null) {
      link = this.document.createElement('link');
      link.setAttribute('rel', 'canonical');
      head.appendChild(link);
    }
    link.setAttribute('href', href);
  }

  private absolute(path: string): string {
    if (/^https?:\/\//.test(path)) {
      return path;
    }
    return `${this.document.location.origin}${path}`;
  }
}
