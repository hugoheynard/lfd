import { DOCUMENT, isPlatformBrowser } from '@angular/common';
import {
  type DestroyRef,
  effect,
  inject,
  Injectable,
  InjectionToken,
  Injector,
  PLATFORM_ID,
  untracked,
} from '@angular/core';
import type { ShopItemView } from '@lfd/contracts';

import { AUTH_CONFIG } from '../../../auth/auth.config';
import { sizedMedia, TILE_WIDTHS } from '../media-source';
import { tileArtOf } from '../shelf-display';
import { ShopCatalogue } from '../shop-catalogue.store';

/** À partir de quelle densité d'écran la tuile sert sa grande largeur. */
const RETINA_RATIO = 1.5;

/**
 * Combien de tuiles occupent le premier écran de la boutique — « Tout », dans
 * l'ordre du catalogue. Au-delà, la photo attend qu'on fasse défiler.
 */
export const FIRST_SCREEN_TILES = 8;

/** Le repli de `requestIdleCallback` (Safari) : assez tard pour laisser peindre. */
const IDLE_FALLBACK_MS = 200;

/** Les réseaux sur lesquels une photo d'avance coûte plus qu'elle ne rend. */
const SLOW_NETWORKS: ReadonlySet<string> = new Set(['slow-2g', '2g']);

/**
 * Charge le morceau de la boutique — le MÊME que la route `boutique` charge :
 * le bundler ne fait qu'un fichier d'un module importé dynamiquement à deux
 * endroits, et le routeur le trouve déjà là.
 *
 * Un jeton pour que la suite puisse le remplacer ; personne d'autre ne le fait.
 */
export const SHOP_CHUNK = new InjectionToken<() => Promise<unknown>>('SHOP_CHUNK', {
  providedIn: 'root',
  factory: () => () => import('../shop-page/shop-page'),
});

/** Ce que `navigator.connection` expose, et que `lib.dom` ne déclare pas. */
interface NetworkHints {
  readonly saveData?: boolean;
  readonly effectiveType?: string;
}

/**
 * **L'avance prise sur la boutique, depuis Bienvenue.** Le seul endroit qui
 * décide de précharger quoi que ce soit.
 *
 * Décidé par Hugo le 2026-10-18 : la boutique paraissait lente au premier
 * chargement, parce que tout partait au clic — le morceau de code, le
 * catalogue, puis les photos, l'un après l'autre. Bienvenue est la page où l'on
 * arrive ; pendant qu'on la lit, le navigateur n'a rien à faire.
 *
 * Quatre gestes, dans cet ordre :
 *
 * 1. **ouvrir la connexion** à l'API tout de suite, et à l'origine des photos
 *    dès qu'on la connaît — elle n'est écrite nulle part dans ce front : le
 *    serveur sert des URL absolues, on lit l'origine dans la donnée ;
 * 2. **le morceau de la boutique**, quand le navigateur est inactif, par un
 *    `import()` du composant routé ({@link SHOP_CHUNK}). Pas de
 *    `withPreloading` : le préchargeur du routeur pèse 1,8 ko dans le paquet
 *    INITIAL, qui était déjà à 1,6 ko sous son plafond d'erreur (mesuré le
 *    2026-10-18) — ce chemin-ci ne coûte rien au premier chargement ;
 * 3. **le catalogue** n'a rien à faire ici : Bienvenue hydrate déjà
 *    {@link ShopCatalogue}, que la boutique relit sans second appel
 *    (`hydrate()` est idempotent pour un même lecteur) ;
 * 4. **les photos du premier écran**, à la plus petite largeur de tuile,
 *    seulement si inactif et si le réseau ne demande pas l'économie.
 *
 * Rien côté serveur, et rien une fois Bienvenue quittée : ce qui n'a pas encore
 * démarré est annulé avec l'écran.
 */
@Injectable({ providedIn: 'root' })
export class ShopWarmup {
  private readonly document = inject(DOCUMENT);
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly injector = inject(Injector);
  private readonly catalogue = inject(ShopCatalogue);
  private readonly loadShop = inject(SHOP_CHUNK);

  /** Les origines déjà annoncées — une balise par origine, pas une par visite. */
  private readonly connected = new Set<string>();
  /** Les photos déjà demandées : revenir sur Bienvenue ne les redemande pas. */
  private readonly warmed = new Set<string>();

  /**
   * Prend l'avance, le temps que l'écran appelant vit. À appeler depuis
   * Bienvenue, et d'elle seule.
   */
  start(screen: Pick<DestroyRef, 'onDestroy'>): void {
    if (!this.browser) {
      return;
    }
    // L'API est jointe par `fetch` sans cookie : le pool « anonyme ».
    this.preconnect(AUTH_CONFIG.apiBaseUrl, true);
    const cancels: (() => void)[] = [];
    cancels.push(
      this.whenIdle(() => {
        // Un échec ici n'est pas une panne : la route retentera au clic, et
        // dira elle-même ce qui ne va pas.
        this.loadShop().catch(() => undefined);
      }),
    );
    const watch = effect(
      () => {
        if (this.catalogue.status() !== 'ready') {
          return;
        }
        const items = this.catalogue.items().slice(0, FIRST_SCREEN_TILES);
        untracked(() => {
          cancels.push(this.whenIdle(() => this.warmPhotos(items)));
        });
      },
      { injector: this.injector },
    );
    screen.onDestroy(() => {
      watch.destroy();
      cancels.forEach((cancel) => cancel());
    });
  }

  private warmPhotos(items: readonly ShopItemView[]): void {
    if (!this.networkAllowsPhotos()) {
      return;
    }
    const view = this.document.defaultView;
    if (view === null) {
      return;
    }
    // La largeur que le `srcset` de la tuile choisira : sur un écran dense, le
    // navigateur prend la plus grande, et précharger la petite serait perdu.
    const width = view.devicePixelRatio >= RETINA_RATIO ? TILE_WIDTHS[1] : TILE_WIDTHS[0];
    for (const item of items) {
      const src = sizedMedia(tileArtOf(item).url, width);
      const origin = this.absoluteOrigin(src);
      if (origin === null || this.warmed.has(src)) {
        // Une illustration de l'application est déjà dans le paquet servi.
        continue;
      }
      this.warmed.add(src);
      // Une `<img>` sans `crossorigin` part avec les cookies : l'autre pool.
      this.preconnect(origin, false);
      const image = new view.Image();
      image.decoding = 'async';
      image.fetchPriority = 'low';
      image.src = src;
    }
  }

  /** Ni `saveData`, ni un réseau en 2G. Sans indication, on fait confiance. */
  private networkAllowsPhotos(): boolean {
    const nav: (Navigator & { readonly connection?: NetworkHints }) | undefined =
      this.document.defaultView?.navigator;
    const hints = nav?.connection;
    if (hints === undefined) {
      return true;
    }
    if (hints.saveData === true) {
      return false;
    }
    return !SLOW_NETWORKS.has(hints.effectiveType ?? '');
  }

  /**
   * `preconnect` + `dns-prefetch` (repli des navigateurs sans le premier).
   *
   * ⚠️ `anonymous` doit dire comment la requête partira : le navigateur garde
   * deux pools de connexions par origine, avec et sans cookies, et une
   * connexion ouverte dans le mauvais n'est jamais réutilisée.
   */
  private preconnect(url: string, anonymous: boolean): void {
    const origin = this.absoluteOrigin(url);
    if (origin === null || this.connected.has(origin)) {
      return;
    }
    this.connected.add(origin);
    for (const rel of ['preconnect', 'dns-prefetch']) {
      const link = this.document.createElement('link');
      link.rel = rel;
      link.href = origin;
      if (rel === 'preconnect' && anonymous) {
        link.crossOrigin = '';
      }
      this.document.head.appendChild(link);
    }
  }

  /** L'origine d'une URL absolue étrangère à la page, ou `null`. */
  private absoluteOrigin(url: string): string | null {
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      return null;
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return null;
    }
    return parsed.origin === this.document.location.origin ? null : parsed.origin;
  }

  /** Lance `work` au premier moment d'inactivité ; rend de quoi l'annuler. */
  private whenIdle(work: () => void): () => void {
    const view = this.document.defaultView;
    if (view === null) {
      return () => undefined;
    }
    if (typeof view.requestIdleCallback === 'function') {
      const handle = view.requestIdleCallback(work);
      return () => view.cancelIdleCallback(handle);
    }
    const handle = view.setTimeout(work, IDLE_FALLBACK_MS);
    return () => view.clearTimeout(handle);
  }
}
