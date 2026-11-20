import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import type { PrincipalSitesMenuView } from '@lfd/contracts';
import {
  FoldBackLinkComponent,
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldEmptyStateComponent,
  FoldIconComponent,
  FoldLoadingStateComponent,
} from 'fold-ng';

import { NotifyService } from '../../../notify.service';
import { siteMenuCopy } from '../../copy/screens/site-menu.copy';
import { screenCopy } from '../../copy/shop-copy-composer';
import { ClientBannerOutlet } from '../../nav/client-banner';
import { ClientBannerBlock } from '../../nav/client-banner-block/client-banner-block';
import { ShopCatalogue } from '../../shop/shop-catalogue.store';
import { ManageableSites } from '../manageable-sites';
import { SiteMenuGateway } from '../site-menu.gateway';
import { draftOf, type MenuDraft, payloadOf } from '../site-menu-draft';
import { SiteMenuEditor } from '../site-menu-editor/site-menu-editor';

/** Les états de l'écran, exclusifs. */
type CommonMenuScreen = 'loading' | 'unknown' | 'failed' | 'ready';

/**
 * `/mes-sites/carte-commune` — **la carte commune des sites** de l'espace
 * affiché (`carte-des-sites.md`, § 6.1) : elle vaut pour chaque site qui n'a
 * pas de carte propre, jamais pour le principal lui-même. Réglée par son
 * propriétaire ou son administrateur, avec le même éditeur que la carte d'un
 * site.
 */
@Component({
  selector: 'app-common-menu-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ClientBannerBlock,
    ClientBannerOutlet,
    FoldBackLinkComponent,
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldEmptyStateComponent,
    FoldIconComponent,
    FoldLoadingStateComponent,
    SiteMenuEditor,
  ],
  templateUrl: './common-menu-page.html',
  styleUrl: './common-menu-page.scss',
})
export class CommonMenuPage {
  protected readonly copy = screenCopy('siteMenu', siteMenuCopy);
  private readonly manageable = inject(ManageableSites);
  private readonly gateway = inject(SiteMenuGateway);
  private readonly catalogue = inject(ShopCatalogue);
  private readonly notify = inject(NotifyService);

  private readonly menuStatus = signal<'loading' | 'failed' | 'ready'>('loading');
  private readonly view = signal<PrincipalSitesMenuView | null>(null);

  protected readonly screen = computed<CommonMenuScreen>(() => {
    if (!this.manageable.settled()) {
      return 'loading';
    }
    if (this.manageable.principalId() === null) {
      return 'unknown';
    }
    const catalogue = this.catalogue.status();
    if (this.menuStatus() === 'failed' || catalogue === 'failed') {
      return 'failed';
    }
    return this.menuStatus() === 'ready' && catalogue === 'ready' ? 'ready' : 'loading';
  });

  protected readonly initial = computed<MenuDraft>(() => draftOf(this.view()?.menu ?? null));

  protected readonly save = async (draft: MenuDraft): Promise<string | null> => {
    const id = this.manageable.principalId();
    if (id === null) {
      return null;
    }
    const refused = await this.gateway.saveSitesMenu(id, payloadOf(draft));
    if (refused === null) {
      this.notify.success(this.copy().commonSaved);
    }
    return refused;
  };

  constructor() {
    void this.catalogue.hydrate();
    effect(() => {
      const id = this.manageable.principalId();
      if (id !== null) {
        untracked(() => void this.load(id));
      }
    });
  }

  protected retry(): void {
    const id = this.manageable.principalId();
    void this.catalogue.hydrate();
    if (id !== null) {
      void this.load(id);
    }
  }

  private async load(principalId: string): Promise<void> {
    this.menuStatus.set('loading');
    try {
      this.view.set(await this.gateway.readSitesMenu(principalId));
      this.menuStatus.set('ready');
    } catch {
      this.menuStatus.set('failed');
    }
  }
}
