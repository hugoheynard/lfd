import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import type { ResupplyTemplateView } from '@lfd/contracts';
import {
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldCardComponent,
  FoldElementTitleComponent,
  FoldEmptyStateComponent,
  FoldIconComponent,
  FoldListboxComponent,
  FoldLoadingStateComponent,
  FoldPageLayoutComponent,
  type FoldSelectOption,
} from 'fold-ng';

import { PermissionsStore } from '../../../auth/permissions.store';
import { PickupAddressesService } from '../../../b2b/reglages/pickup-addresses.service';
import { RESUPPLY_TARGET_LABELS } from '../../../shared/resupply-labels';
import { timeLabel } from '../../../shared/window-label';
import { staleCount } from '../resupply-template-composition';
import { ResupplyTemplatesStore } from '../resupply-templates.store';

/** Un point proposé. */
interface SiteChoice {
  readonly id: string;
  readonly label: string;
}

/** Une carte de la bibliothèque : ce que la liste en dit. */
export interface TemplateCard {
  readonly id: string;
  readonly name: string;
  readonly summary: string;
  /** « 2 lignes ne s'appliqueraient pas aujourd'hui », ou `null`. */
  readonly warning: string | null;
}

/**
 * « Pour demain, 6 h 30 · 12 articles » (l'heure seulement si le modèle en
 * porte une) ; l'avertissement des lignes inapplicables à part.
 */
export function templateCardOf(template: ResupplyTemplateView): TemplateCard {
  const count = template.lines.length;
  const target =
    template.target === 'tomorrow' && template.arrivalBy !== null
      ? `${RESUPPLY_TARGET_LABELS[template.target]}, ${timeLabel(template.arrivalBy)}`
      : RESUPPLY_TARGET_LABELS[template.target];
  const stale = staleCount(template);
  return {
    id: template.id,
    name: template.name,
    summary: `${target} · ${String(count)} article${count > 1 ? 's' : ''}`,
    warning:
      stale === 0
        ? null
        : stale === 1
          ? "1 ligne ne s'appliquerait pas aujourd'hui : l'article a quitté le réassort ou changé d'unité."
          : `${String(stale)} lignes ne s'appliqueraient pas aujourd'hui : leurs articles ont quitté le réassort ou changé d'unité.`,
  };
}

/**
 * **Les modèles de réassort** (`/comptoir/modeles-reassort`, plan
 * `documentation/reassort-boutiques/commander.md § 6`, § 6) — la
 * bibliothèque d'un point : choisir le point, voir ses modèles actifs, en
 * créer ou en ajuster un (page de composition).
 *
 * Le point choisi vit dans l'adresse (`?point=`) : le retour depuis la
 * composition y revient, et un favori aussi.
 */
@Component({
  selector: 'app-resupply-templates-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldCardComponent,
    FoldElementTitleComponent,
    FoldEmptyStateComponent,
    FoldIconComponent,
    FoldListboxComponent,
    FoldLoadingStateComponent,
    FoldPageLayoutComponent,
    RouterLink,
  ],
  providers: [ResupplyTemplatesStore],
  templateUrl: './resupply-templates-page.html',
  styleUrl: './resupply-templates-page.scss',
})
export class ResupplyTemplatesPage {
  private readonly pickups = inject(PickupAddressesService);
  private readonly router = inject(Router);
  private readonly permissions = inject(PermissionsStore);
  protected readonly store = inject(ResupplyTemplatesStore);

  /** Le point choisi, lu dans `?point=`. */
  readonly point = input<string | undefined>(undefined);

  protected readonly sites = signal<readonly SiteChoice[] | null>(null);
  protected readonly sitesFailed = signal(false);
  protected readonly canWrite = computed(() => this.permissions.can('resupply_templates:write'));

  protected readonly siteOptions = computed<FoldSelectOption<string>[]>(() =>
    (this.sites() ?? []).map((site) => ({ value: site.id, label: site.label })),
  );
  protected readonly siteId = computed(() => this.point() ?? null);
  protected readonly siteLabel = computed(
    () => this.sites()?.find((site) => site.id === this.siteId())?.label ?? null,
  );
  protected readonly cards = computed(() => this.store.templates().map(templateCardOf));

  constructor() {
    void this.loadSites();
    effect(() => {
      const siteId = this.siteId();
      if (siteId !== null) {
        untracked(() => void this.store.open(siteId));
      }
    });
  }

  protected async loadSites(): Promise<void> {
    this.sitesFailed.set(false);
    try {
      const list = await this.pickups.list();
      this.sites.set(list.map((site) => ({ id: site.id, label: site.label })));
    } catch {
      this.sitesFailed.set(true);
    }
  }

  protected pickSite(siteId: string): void {
    void this.router.navigate([], { queryParams: { point: siteId }, replaceUrl: true });
  }

  protected retry(): void {
    const siteId = this.siteId();
    if (siteId !== null) {
      void this.store.open(siteId);
    }
  }
}
