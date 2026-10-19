import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import type { BundleView } from '@lfd/contracts';
import {
  FoldBadgeComponent,
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldCardComponent,
  FoldEmptyStateComponent,
  FoldIconComponent,
  FoldLoadingStateComponent,
  FoldPageLayoutComponent,
  FoldPanelHostService,
} from 'fold-ng';

import { PermissionsStore } from '../../auth/permissions.store';
import { articleCount, inadmissibleCount } from '../bundle-draft';
import { BundlesService } from '../bundles.service';
import { CreateBundlePanel } from '../create-bundle-panel/create-bundle-panel';

type LoadState = 'loading' | 'error' | 'ready';

/**
 * **Les formules** — `/formules`, en Gestion Boutique, sous `shop_bundles`
 * (`documentation/formules/plan-les-formules.md` §5, lot F2a : la
 * composition seule, ni prix ni mise en vente). Une ligne par formule, la
 * plus récemment écrite d'abord ; un article devenu inadmissible se signale.
 */
@Component({
  selector: 'app-bundles-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldBadgeComponent,
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldCardComponent,
    FoldEmptyStateComponent,
    FoldIconComponent,
    FoldLoadingStateComponent,
    FoldPageLayoutComponent,
    RouterLink,
  ],
  templateUrl: './bundles-page.html',
  styleUrl: './bundles-page.scss',
})
export class BundlesPage {
  private readonly api = inject(BundlesService);
  private readonly permissions = inject(PermissionsStore);
  private readonly panels = inject(FoldPanelHostService);
  private readonly router = inject(Router);

  protected readonly state = signal<LoadState>('loading');
  protected readonly bundles = signal<readonly BundleView[]>([]);
  protected readonly canWrite = computed(() => this.permissions.can('shop_bundles:write'));

  protected readonly inadmissible = inadmissibleCount;

  protected summary(bundle: BundleView): string {
    const groups = bundle.groups.length;
    const articles = articleCount(bundle);
    return (
      `${String(groups)} groupe${groups > 1 ? 's' : ''} · ` +
      `${String(articles)} article${articles > 1 ? 's' : ''}`
    );
  }

  constructor() {
    void this.load();
  }

  protected async load(): Promise<void> {
    this.state.set('loading');
    try {
      this.bundles.set(await this.api.list());
      this.state.set('ready');
    } catch {
      this.state.set('error');
    }
  }

  /** Créée, la formule s'ouvre sur sa page. */
  protected create(): void {
    void this.panels.open<string>(CreateBundlePanel).closed.then((key) => {
      if (key !== undefined) {
        void this.router.navigate(['/formules', key]);
      }
    });
  }
}
