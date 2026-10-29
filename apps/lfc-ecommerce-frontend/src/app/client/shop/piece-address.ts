import { Location } from '@angular/common';
import { computed, effect, inject, Injectable, signal, untracked } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, UrlTree } from '@angular/router';
import { productPath, SHOP_PATH } from '@lfd/contracts/product-path';
import { filter, map } from 'rxjs';

import { PieceHead } from './piece-head';
import { PIECE_SKU_PARAM } from './piece-route';
import { ShopCatalogue } from './shop-catalogue.store';

/**
 * **La fiche d'un article a une adresse** — `/boutique/article/<sku>` (Hugo,
 * 2026-10-23 : stable pour toujours ; on la partage, un e-mail ou le flux de
 * la vitrine la portent).
 *
 * La page de la boutique reste montée derrière la fiche : les routes d'une
 * fiche sont des ENFANTS de `boutique`, sans composant. Ouvrir une fiche
 * POUSSE une entrée (le retour du navigateur la ferme et rend la grille, rayon
 * compris) ; la fermer revient en arrière quand c'est nous qui l'avions
 * poussée, et remplace sinon — arrivé de l'extérieur, un retour ferait quitter
 * le site.
 *
 * Un article
 * que le catalogue du visiteur ne porte pas — retiré, ou d'une autre
 * clientèle — rend `missing`, que la page affiche à la place de la grille.
 *
 * Fourni par la page, comme {@link ShelfAddress}.
 */
@Injectable()
export class PieceAddress {
  private readonly router = inject(Router);
  private readonly location = inject(Location);
  private readonly catalogue = inject(ShopCatalogue);
  private readonly head = inject(PieceHead);

  private readonly requested = toSignal(
    this.router.events.pipe(
      filter((event) => event instanceof NavigationEnd),
      map(() => this.read()),
    ),
    { initialValue: this.read() },
  );

  private readonly opened = signal<string | null>(null);
  private readonly absent = signal<string | null>(null);

  /** L'article dont la fiche est ouverte. */
  readonly open = this.opened.asReadonly();
  /** L'adresse nomme un article que le visiteur ne peut pas voir. */
  readonly missing = computed(() => this.absent() !== null);

  /** Le dernier article suivi — `undefined` : aucune adresse lue encore. */
  private lastSku: string | null | undefined = undefined;
  /** L'article dont NOUS avons poussé l'entrée d'historique. */
  private pushed: string | null = null;

  constructor() {
    effect(() => {
      const wanted = this.requested();
      // Avant le catalogue, on ne sait pas si l'article existe : on attend.
      if (this.catalogue.status() !== 'ready') {
        return;
      }
      untracked(() => this.follow(wanted));
    });
  }

  /** Ouvre la fiche, et navigue vers son adresse. */
  show(sku: string): void {
    this.opened.set(sku);
    if (this.requested() === sku) {
      return;
    }
    this.pushed = sku;
    this.go(productPath(sku), false);
  }

  /** Ferme la fiche (ou le refus d'un article absent), et rend la grille. */
  close(): void {
    this.opened.set(null);
    this.absent.set(null);
    const wanted = this.requested();
    if (wanted === null) {
      return;
    }
    if (this.pushed === wanted) {
      this.pushed = null;
      this.location.back();
      return;
    }
    this.go(SHOP_PATH, true);
  }

  private follow(wanted: string | null): void {
    if (wanted === this.lastSku) {
      return;
    }
    this.lastSku = wanted;
    // Une ancienne référence (lien partagé avant la bascule) ouvre l'article
    // qu'elle désigne, et l'adresse est remplacée sans entrée d'historique
    // (`plan-defaut-sous-sa-reference.md`, § 5 — à vie).
    const canonical = wanted === null ? null : this.catalogue.canonicalSku(wanted);
    if (wanted !== null && canonical !== null && canonical !== wanted) {
      if (this.pushed === wanted) {
        this.pushed = canonical;
      }
      this.go(productPath(canonical), true);
      return;
    }
    if (wanted === null) {
      this.pushed = null;
      this.opened.set(null);
      this.absent.set(null);
      this.head.reset();
      return;
    }
    const item = this.catalogue.itemOf(wanted);
    if (item === null) {
      this.opened.set(null);
      this.absent.set(wanted);
      this.head.missing();
      return;
    }
    this.absent.set(null);
    this.opened.set(item.sku);
    this.head.show(item);
  }

  private go(path: string, replaceUrl: boolean): void {
    // `?rayon=` et `#pro` (la visite pro) survivent à la fiche.
    const current = this.router.parseUrl(this.router.url);
    const target = new UrlTree(
      this.router.parseUrl(path).root,
      current.queryParams,
      current.fragment,
    );
    void this.router.navigateByUrl(target, { replaceUrl });
  }

  private read(): string | null {
    // La route la plus profonde : celle de la fiche, quand il y en a une.
    let route = this.router.routerState.snapshot.root;
    while (route.firstChild !== null) {
      route = route.firstChild;
    }
    return route.paramMap.get(PIECE_SKU_PARAM);
  }
}
