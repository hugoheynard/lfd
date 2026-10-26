import { effect, inject, Injectable, signal } from '@angular/core';
import { Title } from '@angular/platform-browser';
import {
  type ActivatedRouteSnapshot,
  type RouterStateSnapshot,
  TitleStrategy,
} from '@angular/router';

import type { PageTitleKey } from './copy/client-copy.model';
import { ClientCopyService } from './copy/client-copy.service';

/** La clé de `data` qui nomme le titre d'onglet d'une route du shell client. */
export const PAGE_TITLE = 'pageTitle';

/** Le `data` d'une route dont l'onglet se traduit. */
export function pageTitle(key: PageTitleKey): { readonly [PAGE_TITLE]: PageTitleKey } {
  return { [PAGE_TITLE]: key };
}

/**
 * **Le titre de l'onglet, dans la langue choisie** (RGAA 8.6).
 *
 * Une route du shell client porte une CLÉ (`data.pageTitle`), traduite par
 * `chrome.pageTitles` ; une route sans clé (l'espace pro hérité) garde son
 * `title` écrit, comme le ferait la stratégie par défaut.
 *
 * Au changement de langue, l'onglet est réécrit — sauf si un écran l'a
 * changé entre-temps : la fiche d'un article pose le nom de l'article
 * (`PieceHead`), et la langue ne doit pas l'écraser par « Boutique ».
 */
@Injectable({ providedIn: 'root' })
export class ClientTitleStrategy extends TitleStrategy {
  private readonly title = inject(Title);
  private readonly t = inject(ClientCopyService).t;
  private readonly key = signal<PageTitleKey | null>(null);
  /** Le dernier titre que cette stratégie a écrit. */
  private written: string | null = null;

  constructor() {
    super();
    effect(() => {
      const key = this.key();
      if (key === null) {
        return;
      }
      const next = this.t().chrome.pageTitles[key];
      if (this.written !== null && this.title.getTitle() !== this.written) {
        return;
      }
      this.write(next);
    });
  }

  override updateTitle(snapshot: RouterStateSnapshot): void {
    const key = deepestKey(snapshot.root);
    this.key.set(key);
    const text = key === null ? this.buildTitle(snapshot) : this.t().chrome.pageTitles[key];
    if (text !== undefined) {
      this.write(text);
    }
  }

  private write(text: string): void {
    this.written = text;
    this.title.setTitle(text);
  }
}

/** La clé de la route la plus profonde qui en porte une. */
function deepestKey(root: ActivatedRouteSnapshot): PageTitleKey | null {
  let found: PageTitleKey | null = null;
  let route: ActivatedRouteSnapshot | null = root;
  while (route !== null) {
    const value: unknown = route.data[PAGE_TITLE];
    if (isPageTitleKey(value)) {
      found = value;
    }
    route = route.firstChild;
  }
  return found;
}

const KEYS: Readonly<Record<PageTitleKey, true>> = {
  welcome: true,
  registration: true,
  proLanding: true,
  proOpening: true,
  orders: true,
  invoices: true,
  account: true,
  profile: true,
  loyalty: true,
  shop: true,
  payment: true,
  pickupQr: true,
  orderRevision: true,
  guestOrder: true,
  salesTerms: true,
  orderConfirmed: true,
  connection: true,
};

function isPageTitleKey(value: unknown): value is PageTitleKey {
  return typeof value === 'string' && Object.hasOwn(KEYS, value);
}
