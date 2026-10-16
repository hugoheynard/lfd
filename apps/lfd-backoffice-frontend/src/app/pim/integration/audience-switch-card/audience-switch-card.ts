import { NgTemplateOutlet, isPlatformBrowser } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  PLATFORM_ID,
  computed,
  inject,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import type {
  AudienceSwitchAppliedView,
  AudienceSwitchItemView,
  AudienceSwitchPreviewView,
} from '@lfd/pim-contracts';
import { httpErrorMessage } from '@lfd/endpoints';
import {
  FoldBadgeComponent,
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldCardComponent,
  FoldDisclosureComponent,
  FoldElementTitleComponent,
  FoldEmptyStateComponent,
  FoldInlineConfirmComponent,
  FoldLoadingStateComponent,
} from 'fold-ng';

import { PermissionsStore } from '../../../auth/permissions.store';
import { NotifyService } from '../../../notify.service';
import { AudienceSwitchApi, type ReemissionReportView } from '../audience-switch-api';

type LoadState = 'loading' | 'ready' | 'error';

/** Une ligne d'une déclinaison incomplète : son SKU, et ce qui lui manque. */
interface GapLine {
  readonly variantSku: string;
  readonly missing: string;
}

/**
 * **Basculer vers les faits** — la procédure « Basculer le catalogue vers les
 * faits (lot 2b) » de `documentation/ops/runbook.md`, étapes 3, 4 et 7, rendue
 * faisable à l'écran.
 *
 * L'écran ne décide rien : il lit l'aperçu, déclenche les deux gestes, et
 * affiche ce que le serveur rend — refus compris, mot pour mot. Les deux
 * gestes sont des gestes de publication : le serveur les refuse (409) quand la
 * publication est fermée, et la page entière est déjà derrière ce garde.
 */
@Component({
  selector: 'app-audience-switch-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    NgTemplateOutlet,
    RouterLink,
    FoldBadgeComponent,
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldCardComponent,
    FoldDisclosureComponent,
    FoldElementTitleComponent,
    FoldEmptyStateComponent,
    FoldInlineConfirmComponent,
    FoldLoadingStateComponent,
  ],
  templateUrl: './audience-switch-card.html',
  styleUrl: './audience-switch-card.scss',
})
export class AudienceSwitchCard {
  private readonly api = inject(AudienceSwitchApi);
  private readonly permissions = inject(PermissionsStore);
  private readonly notify = inject(NotifyService);

  /** `POST /audience-switch` est muré par `@AdminSurface("pim_catalog")`. */
  protected readonly canApply = computed(() => this.permissions.can('pim_catalog:write'));
  /** `POST /reemit` l'est par `@AdminSurface("pim_channels")` — un autre droit. */
  protected readonly canReemit = computed(() => this.permissions.can('pim_channels:write'));

  protected readonly state = signal<LoadState>('loading');
  protected readonly loadError = signal<string | null>(null);
  protected readonly preview = signal<AudienceSwitchPreviewView | null>(null);

  protected readonly applying = signal(false);
  protected readonly applied = signal<AudienceSwitchAppliedView | null>(null);
  protected readonly applyError = signal<string | null>(null);

  /** `'all'` pendant « Réémettre tout », l'id de la fiche pendant une réémission ciblée. */
  protected readonly reemitting = signal<string | null>(null);
  protected readonly reemitted = signal<ReemissionReportView | null>(null);
  protected readonly reemitError = signal<string | null>(null);
  /** Les fiches réémises une à une avec succès depuis le dernier « Réémettre tout ». */
  protected readonly recovered = signal<ReadonlySet<string>>(new Set());

  protected readonly stillFailed = computed(() => {
    const done = this.recovered();
    return (this.reemitted()?.failedProducts ?? []).filter((id) => !done.has(id));
  });

  constructor() {
    if (isPlatformBrowser(inject(PLATFORM_ID))) {
      void this.load();
    }
  }

  protected async load(): Promise<void> {
    this.state.set('loading');
    this.loadError.set(null);
    try {
      this.preview.set(await this.api.preview());
      this.state.set('ready');
    } catch (error) {
      this.loadError.set(httpErrorMessage(error, 'Aperçu illisible — API injoignable.'));
      this.state.set('error');
    }
  }

  /** Étape 4. Relit l'aperçu ensuite : les fiches désactivées en sortent. */
  async apply(): Promise<void> {
    if (this.applying()) {
      return;
    }
    this.applying.set(true);
    this.applyError.set(null);
    try {
      this.applied.set(await this.api.apply());
    } catch (error) {
      this.applyError.set(httpErrorMessage(error, 'La bascule a échoué.'));
      return;
    } finally {
      this.applying.set(false);
    }
    await this.load();
  }

  /** Étape 7 — tout. */
  async reemitAll(): Promise<void> {
    if (this.reemitting() !== null) {
      return;
    }
    this.reemitting.set('all');
    this.reemitError.set(null);
    try {
      this.reemitted.set(await this.api.reemit());
      this.recovered.set(new Set());
    } catch (error) {
      this.reemitError.set(httpErrorMessage(error, 'La réémission a échoué.'));
    } finally {
      this.reemitting.set(null);
    }
  }

  /** Étape 7 — une fiche nommée par `failedProducts`. */
  async reemitOne(productId: string): Promise<void> {
    if (this.reemitting() !== null) {
      return;
    }
    this.reemitting.set(productId);
    this.reemitError.set(null);
    try {
      await this.api.reemit(productId);
      this.recovered.update((done) => new Set([...done, productId]));
    } catch (error) {
      this.reemitError.set(httpErrorMessage(error, `La fiche ${productId} n'a pas été réémise.`));
    } finally {
      this.reemitting.set(null);
    }
  }

  /** La liste du retour arrière — une fiche par ligne : id, SKU, nom. */
  protected async copyDeactivated(): Promise<void> {
    const text = deactivatedList(this.applied()?.deactivated ?? []);
    try {
      await navigator.clipboard.writeText(text);
      this.notify.success('Liste copiée.');
    } catch {
      this.notify.success(`Liste à copier :\n${text}`);
    }
  }

  protected gapLines(gaps: Readonly<Record<string, readonly string[]>>): readonly GapLine[] {
    return Object.entries(gaps).map(([variantSku, missing]) => ({
      variantSku,
      missing: missing.join(', '),
    }));
  }
}

/** Le format copié : une ligne par fiche, l'identifiant d'abord (c'est lui qu'on réactive). */
export function deactivatedList(items: readonly AudienceSwitchItemView[]): string {
  return items.map((item) => `${item.id}\t${item.sku}\t${item.name}`).join('\n');
}
