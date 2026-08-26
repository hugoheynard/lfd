import { HttpClient } from '@angular/common/http';
import { isPlatformBrowser } from '@angular/common';
import { Injectable, PLATFORM_ID, computed, inject, signal } from '@angular/core';
import type { PointOfSaleView } from '@lfd/pim-contracts';
import { firstValueFrom } from 'rxjs';

import { API_BASE_URL } from '../data/api';
import { ListLoadState } from '../data/list-load-state';

/**
 * **D'où l'on vend**, en lecture seule.
 *
 * Une boutique s'écrit encore par l'écran des emplacements, qui tient ce
 * miroir dans la même transaction que sa source (tranche p-0,
 * `documentation/pim/point-de-vente.md`). La plateforme professionnelle, elle,
 * ne s'écrit nulle part : elle est semée au démarrage et ineffaçable.
 *
 * Ce store existe pour une raison précise : jusqu'ici, la plateforme B2B
 * n'apparaissait **nulle part** dans l'administration — c'était un `NULL` dans
 * une colonne de la matrice de canaux.
 */
@Injectable({ providedIn: 'root' })
export class PointOfSaleStore {
  private readonly http = inject(HttpClient);
  private readonly base = inject(API_BASE_URL);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  private readonly state = signal<PointOfSaleView[]>([]);
  readonly items = this.state.asReadonly();
  private readonly load = new ListLoadState();
  /** Pourquoi la liste est vide — `null` = elle l'est vraiment. */
  readonly loadError = this.load.error;

  /**
   * Les plateformes seules.
   *
   * L'écran affiche les boutiques par `LocationStore` — leur source d'écriture
   * — et les plateformes par ici. Les rendre deux fois serait le seul moyen de
   * faire douter de laquelle des deux listes est la bonne.
   */
  readonly platforms = computed(() => this.items().filter((point) => point.kind === 'platform'));

  constructor() {
    if (this.isBrowser) {
      void this.reload().catch(() => undefined);
    }
  }

  async reload(): Promise<void> {
    await this.load.run(
      () => firstValueFrom(this.http.get<PointOfSaleView[]>(`${this.base}/points-of-sale`)),
      (items) => this.state.set([...items]),
    );
  }
}
