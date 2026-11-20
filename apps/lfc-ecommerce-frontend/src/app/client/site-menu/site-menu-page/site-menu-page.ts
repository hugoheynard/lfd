import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';
import type { SubAccountMenuBody, SubAccountMenuView } from '@lfd/contracts';
import {
  FoldBackLinkComponent,
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldEmptyStateComponent,
  FoldIconComponent,
  FoldLoadingStateComponent,
} from 'fold-ng';
import { map } from 'rxjs';

import { NotifyService } from '../../../notify.service';
import { companyName } from '../../client-workspace.service';
import { fill } from '../../copy/client-copy.service';
import { siteMenuCopy } from '../../copy/screens/site-menu.copy';
import { screenCopy } from '../../copy/shop-copy-composer';
import { ClientBannerOutlet } from '../../nav/client-banner';
import { ClientBannerBlock } from '../../nav/client-banner-block/client-banner-block';
import { ShopCatalogue } from '../../shop/shop-catalogue.store';
import { ManageableSites } from '../manageable-sites';
import { SiteMenuGateway } from '../site-menu.gateway';
import { draftOf, isExemption, type MenuDraft, payloadOf } from '../site-menu-draft';
import { type MenuSource, SiteMenuEditor } from '../site-menu-editor/site-menu-editor';

/** Les états de l'écran, exclusifs. */
type MenuScreen = 'loading' | 'unknown' | 'failed' | 'ready';

/**
 * `/mes-sites/:subAccountId/carte` — **la carte propre d'un site**, réglée par
 * le propriétaire ou l'administrateur de son compte principal
 * (`documentation/comptes-client/carte-des-sites.md`, § 2, § 3.3, § 6).
 *
 * L'écran dit d'abord ce qui compte pour le site : sa carte propre, la carte
 * commune qu'il suit, ou aucune. Un site qui suit la carte commune part
 * d'elle : enregistrer lui fait une carte propre, qui la remplace (« faire
 * une carte propre »). Un site qui a sa carte propre peut revenir à la carte
 * commune ; la sienne dort alors en base.
 */
@Component({
  selector: 'app-site-menu-page',
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
  templateUrl: './site-menu-page.html',
  styleUrl: './site-menu-page.scss',
})
export class SiteMenuPage {
  protected readonly copy = screenCopy('siteMenu', siteMenuCopy);
  private readonly manageable = inject(ManageableSites);
  private readonly gateway = inject(SiteMenuGateway);
  private readonly catalogue = inject(ShopCatalogue);
  private readonly notify = inject(NotifyService);

  private readonly subAccountId = toSignal(
    inject(ActivatedRoute).paramMap.pipe(map((params) => params.get('subAccountId') ?? '')),
    { initialValue: '' },
  );

  protected readonly site = computed(() => this.manageable.siteOf(this.subAccountId()));
  /** Un booléen : un `/me` relu rend un autre objet, pas un autre site — la carte ne se relit pas. */
  private readonly siteKnown = computed(() => this.site() !== null);

  private readonly menuStatus = signal<'loading' | 'failed' | 'ready'>('loading');
  protected readonly view = signal<SubAccountMenuView | null>(null);
  protected readonly switching = signal(false);
  protected readonly switchRefusal = signal<string | null>(null);

  protected readonly screen = computed<MenuScreen>(() => {
    if (!this.manageable.settled()) {
      return 'loading';
    }
    if (this.site() === null) {
      return 'unknown';
    }
    const catalogue = this.catalogue.status();
    if (this.menuStatus() === 'failed' || catalogue === 'failed') {
      return 'failed';
    }
    return this.menuStatus() === 'ready' && catalogue === 'ready' ? 'ready' : 'loading';
  });

  protected readonly lead = computed(() => {
    const site = this.site();
    return site === null ? '' : fill(this.copy().lead, { site: companyName(site) });
  });

  /** La carte propre, endormie ou non ; à défaut, la carte commune dont on part. */
  protected readonly initial = computed<MenuDraft>(() => {
    const view = this.view();
    return draftOf(view?.menu ?? view?.common ?? null);
  });

  /** Ce qui est montré n'est pas la carte propre active : l'enregistrer en fait une. */
  protected readonly unsaved = computed(() => {
    const view = this.view();
    return view !== null && view.state !== 'own' && (view.menu ?? view.common) !== null;
  });

  protected readonly stateLine = computed(() => {
    const view = this.view();
    const copy = this.copy();
    if (view === null) {
      return '';
    }
    switch (view.state) {
      case 'common':
        return copy.lineCommon;
      case 'none':
        return copy.lineNone;
      case 'own': {
        const line = view.common === null ? copy.lineOwn : copy.lineOwnMasks;
        const exempt = view.menu !== null && isExemption(draftOf(view.menu));
        return exempt ? `${line} ${copy.lineExempt}` : line;
      }
    }
  });

  protected readonly canFollowCommon = computed(() => {
    const view = this.view();
    return view !== null && view.state === 'own' && view.common !== null;
  });

  /** Les autres sites du même principal, dont on peut reprendre la carte (Q4). */
  protected readonly otherSites = computed<readonly MenuSource[]>(() =>
    this.manageable
      .sites()
      .filter((site) => site.id !== this.subAccountId())
      .map((site) => ({ value: site.id, label: companyName(site) })),
  );

  protected readonly readSite = (siteId: string): Promise<SubAccountMenuBody | null> =>
    this.gateway.read(siteId).then((view) => view.menu);

  protected readonly saveOwn = async (draft: MenuDraft): Promise<string | null> => {
    const id = this.subAccountId();
    const refused = await this.gateway.save(id, payloadOf(draft));
    if (refused === null) {
      this.notify.success(this.copy().saved);
      await this.reread(id);
    }
    return refused;
  };

  constructor() {
    void this.catalogue.hydrate();
    effect(() => {
      const id = this.subAccountId();
      if (this.siteKnown()) {
        untracked(() => void this.load(id));
      }
    });
  }

  protected retry(): void {
    void this.catalogue.hydrate();
    void this.load(this.subAccountId());
  }

  protected async followCommon(): Promise<void> {
    if (this.switching()) {
      return;
    }
    const id = this.subAccountId();
    this.switching.set(true);
    this.switchRefusal.set(null);
    const refused = await this.gateway.setState(id, 'follows_common');
    this.switching.set(false);
    if (refused !== null) {
      this.switchRefusal.set(refused);
      return;
    }
    this.notify.success(this.copy().followed);
    await this.reread(id);
  }

  /** Relit l'état après un geste ; un échec de relecture laisse l'écran tel quel. */
  private async reread(id: string): Promise<void> {
    try {
      this.view.set(await this.gateway.read(id));
    } catch {
      // Le geste est fait ; l'écran garde ce qu'il montrait.
    }
  }

  private async load(subAccountId: string): Promise<void> {
    this.menuStatus.set('loading');
    this.switchRefusal.set(null);
    try {
      this.view.set(await this.gateway.read(subAccountId));
      this.menuStatus.set('ready');
    } catch {
      this.menuStatus.set('failed');
    }
  }
}
