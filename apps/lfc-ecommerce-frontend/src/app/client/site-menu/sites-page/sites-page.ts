import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import type { SiteMenuStanding, SubAccountMenuBody, SubAccountMenuView } from '@lfd/contracts';
import {
  FoldBadgeComponent,
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldCardComponent,
  FoldElementTitleComponent,
  FoldEmptyStateComponent,
  FoldIconComponent,
  FoldLoadingStateComponent,
  type FoldBadgeVariant,
} from 'fold-ng';

import { NotifyService } from '../../../notify.service';
import { companyName } from '../../client-workspace.service';
import { fill } from '../../copy/client-copy.service';
import { screenCopy } from '../../copy/shop-copy-composer';
import { siteMenuCopy } from '../../copy/screens/site-menu.copy';
import { ClientBannerOutlet } from '../../nav/client-banner';
import { ClientBannerBlock } from '../../nav/client-banner-block/client-banner-block';
import { ManageableSites } from '../manageable-sites';
import { SiteMenuGateway } from '../site-menu.gateway';

/** Une ligne de site : son nom, et ce qui compte pour lui, une fois lu. */
interface SiteRow {
  readonly id: string;
  readonly name: string;
  readonly raisonSociale: string;
  readonly state: SiteMenuStanding | null;
  readonly stateLabel: string;
  readonly stateTone: FoldBadgeVariant;
  readonly canFollowCommon: boolean;
}

/**
 * `/mes-sites` — **les sites d'un compte principal** (`carte-des-sites.md`,
 * § 2, § 6) : en tête, la carte commune ; puis chaque site, ce qui compte pour
 * lui (carte commune, carte propre, pas de carte) et ses gestes — régler sa
 * carte propre, ou revenir à la carte commune. Au propriétaire et à
 * l'administrateur du principal seulement ; le menu n'y mène pas les autres.
 *
 * L'état de chaque site se lit par sa carte (`GET /companies/:id/menu`) : la
 * boutique n'a pas de liste des sites qui le porte. Une lecture manquée laisse
 * la ligne sans état, et l'écran le dit.
 */
@Component({
  selector: 'app-sites-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ClientBannerBlock,
    ClientBannerOutlet,
    FoldBadgeComponent,
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldCardComponent,
    FoldElementTitleComponent,
    FoldEmptyStateComponent,
    FoldIconComponent,
    FoldLoadingStateComponent,
    RouterLink,
  ],
  templateUrl: './sites-page.html',
  styleUrl: './sites-page.scss',
})
export class SitesPage {
  protected readonly copy = screenCopy('siteMenu', siteMenuCopy);
  protected readonly manageable = inject(ManageableSites);
  private readonly gateway = inject(SiteMenuGateway);
  private readonly notify = inject(NotifyService);

  /** La carte commune lue : `undefined` tant qu'elle ne l'est pas, ou si la lecture a échoué. */
  private readonly common = signal<SubAccountMenuBody | null | undefined>(undefined);
  private readonly views = signal<ReadonlyMap<string, SubAccountMenuView>>(new Map());
  protected readonly readFailed = signal(false);
  protected readonly switching = signal<string | null>(null);
  protected readonly switchRefusal = signal<string | null>(null);

  protected readonly commonLine = computed(() => {
    const common = this.common();
    if (common === undefined) {
      return null;
    }
    return common === null
      ? this.copy().commonNone
      : fill(this.copy().commonSet, { entries: String(common.entries.length) });
  });

  protected readonly rows = computed<readonly SiteRow[]>(() => {
    const views = this.views();
    const copy = this.copy();
    return this.manageable.sites().map((site) => {
      const view = views.get(site.id);
      const state = view?.state ?? null;
      return {
        id: site.id,
        name: companyName(site),
        raisonSociale: site.raisonSociale,
        state,
        stateLabel:
          state === 'common'
            ? copy.stateCommon
            : state === 'own'
              ? copy.stateOwn
              : state === 'none'
                ? copy.stateNone
                : '',
        stateTone: state === 'own' ? 'info' : state === 'common' ? 'success' : 'neutral',
        canFollowCommon: state === 'own' && view?.common !== null,
      };
    });
  });

  /** Les sites en une chaîne d'ids : un `/me` relu, qui rend d'autres objets, ne relit rien. */
  private readonly siteIds = computed(() =>
    this.manageable
      .sites()
      .map((site) => site.id)
      .join(','),
  );

  constructor() {
    effect(() => {
      const principalId = this.manageable.principalId();
      const ids = this.siteIds();
      if (principalId !== null) {
        untracked(() => void this.load(principalId, ids === '' ? [] : ids.split(',')));
      }
    });
  }

  protected async followCommon(siteId: string): Promise<void> {
    if (this.switching() !== null) {
      return;
    }
    this.switching.set(siteId);
    this.switchRefusal.set(null);
    const refused = await this.gateway.setState(siteId, 'follows_common');
    this.switching.set(null);
    if (refused !== null) {
      this.switchRefusal.set(refused);
      return;
    }
    this.notify.success(this.copy().followed);
    await this.readSite(siteId);
  }

  private async load(principalId: string, siteIds: readonly string[]): Promise<void> {
    this.readFailed.set(false);
    const common = this.gateway.readSitesMenu(principalId).then(
      (view) => this.common.set(view.menu),
      () => this.readFailed.set(true),
    );
    await Promise.all([common, ...siteIds.map((id) => this.readSite(id))]);
  }

  private async readSite(siteId: string): Promise<void> {
    try {
      const view = await this.gateway.read(siteId);
      this.views.update((views) => new Map(views).set(siteId, view));
    } catch {
      this.readFailed.set(true);
    }
  }
}
