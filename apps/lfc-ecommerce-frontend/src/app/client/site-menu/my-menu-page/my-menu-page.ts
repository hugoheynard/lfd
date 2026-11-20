import { HttpErrorResponse } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import type { SubAccountMenuView } from '@lfd/contracts';
import {
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldEmptyStateComponent,
  FoldIconComponent,
  FoldLoadingStateComponent,
} from 'fold-ng';

import { ClientContext } from '../../client-context.service';
import { siteMenuCopy } from '../../copy/screens/site-menu.copy';
import { screenCopy } from '../../copy/shop-copy-composer';
import { ClientBannerOutlet } from '../../nav/client-banner';
import { ClientBannerBlock } from '../../nav/client-banner-block/client-banner-block';
import { ShopCatalogue } from '../../shop/shop-catalogue.store';
import { SiteMenuGateway } from '../site-menu.gateway';
import { draftOf, effectiveMenuOf, type MenuDraft } from '../site-menu-draft';
import { SiteMenuEditor } from '../site-menu-editor/site-menu-editor';

/** Les états de l'écran, exclusifs. */
type MyMenuScreen = 'loading' | 'unavailable' | 'failed' | 'none' | 'ready';

/**
 * `/ma-carte` — **la carte de son site, lue par ses membres**
 * (`carte-des-sites.md`, § 3.2 : « le site lit mais ne paramètre pas »,
 * décidé par Hugo le 2026-11-20). Ce que la carte qui compte ouvre et ferme,
 * et d'où elle vient — la carte commune du principal, ou celle du site. Aucun
 * réglage, aucun bouton d'écriture : l'éditeur est en lecture.
 *
 * Le site est l'espace affiché. Une lecture refusée (l'espace n'est pas un
 * site, ou la personne ne le lit pas) se dit comme une absence de carte à
 * lire ; une panne réseau se dit comme une panne.
 */
@Component({
  selector: 'app-my-menu-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ClientBannerBlock,
    ClientBannerOutlet,
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldEmptyStateComponent,
    FoldIconComponent,
    FoldLoadingStateComponent,
    SiteMenuEditor,
  ],
  templateUrl: './my-menu-page.html',
  styleUrl: './my-menu-page.scss',
})
export class MyMenuPage {
  protected readonly copy = screenCopy('siteMenu', siteMenuCopy);
  private readonly context = inject(ClientContext);
  private readonly gateway = inject(SiteMenuGateway);
  private readonly catalogue = inject(ShopCatalogue);

  private readonly status = signal<'loading' | 'refused' | 'failed' | 'ready'>('loading');
  private readonly view = signal<SubAccountMenuView | null>(null);

  protected readonly screen = computed<MyMenuScreen>(() => {
    const status = this.status();
    if (status === 'refused') {
      return 'unavailable';
    }
    const catalogue = this.catalogue.status();
    if (status === 'failed' || catalogue === 'failed') {
      return 'failed';
    }
    if (status === 'loading' || catalogue !== 'ready') {
      return 'loading';
    }
    return this.view()?.state === 'none' ? 'none' : 'ready';
  });

  protected readonly menu = computed<MenuDraft>(() => {
    const view = this.view();
    return draftOf(view === null ? null : effectiveMenuOf(view));
  });

  protected readonly origin = computed(() =>
    this.view()?.state === 'common' ? this.copy().myFromCommon : this.copy().myOwn,
  );

  constructor() {
    void this.catalogue.hydrate();
    effect(() => {
      const companyId = this.context.prefix();
      if (companyId !== null) {
        untracked(() => void this.load(companyId));
      }
    });
  }

  protected retry(): void {
    void this.catalogue.hydrate();
    const companyId = this.context.prefix();
    if (companyId !== null) {
      void this.load(companyId);
    }
  }

  private async load(companyId: string): Promise<void> {
    this.status.set('loading');
    try {
      this.view.set(await this.gateway.read(companyId));
      this.status.set('ready');
    } catch (error) {
      this.status.set(refusedRead(error) ? 'refused' : 'failed');
    }
  }
}

/** Un refus du serveur (4xx) : pas de carte à lire ici ; le reste est une panne. */
function refusedRead(error: unknown): boolean {
  return error instanceof HttpErrorResponse && error.status >= 400 && error.status < 500;
}
