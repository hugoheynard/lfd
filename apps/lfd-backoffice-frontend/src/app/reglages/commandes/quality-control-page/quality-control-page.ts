import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import type { QualityControlSettingsPayload, QualityControlSettingsView } from '@lfd/contracts';
import { httpErrorMessage } from '@lfd/endpoints';
import {
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldCardComponent,
  FoldCheckboxComponent,
  FoldElementTitleComponent,
  FoldEmptyStateComponent,
  FoldLoadingStateComponent,
  FoldPageLayoutComponent,
} from 'fold-ng';

import { PermissionsStore } from '../../../auth/permissions.store';
import { QualityControlSettingsService } from '../quality-control-settings.service';

type LoadState = 'loading' | 'ready' | 'error';

/** L'un des deux interrupteurs. */
type QualityLevel = keyof QualityControlSettingsPayload;

/**
 * **Contrôle qualité** — Réglages › Commandes (décision de Hugo, 2026-10-26,
 * `plan-controle-qualite.md`, D10). Deux cases : au fournil (lignes de
 * préparation, désactivé par défaut) et au colisage (commandes colisées,
 * activé par défaut).
 *
 * Désactivé, « Contrôler » disparaît de la Supervision à ce niveau et le
 * serveur refuse le verdict ; ce qui est déjà rendu reste lisible, et une
 * retenue Bloquante en cours reste jusqu'à sa levée. Sous `lfc_order_settings`,
 * comme les réglages voisins — la page se fige sans `:write`. Chaque bascule
 * s'applique tout de suite, puis relit.
 */
@Component({
  selector: 'app-quality-control-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldCardComponent,
    FoldCheckboxComponent,
    FoldElementTitleComponent,
    FoldEmptyStateComponent,
    FoldLoadingStateComponent,
    FoldPageLayoutComponent,
  ],
  templateUrl: './quality-control-page.html',
})
export class QualityControlPage {
  private readonly service = inject(QualityControlSettingsService);
  private readonly permissions = inject(PermissionsStore);

  protected readonly canWrite = computed(() => this.permissions.can('lfc_order_settings:write'));

  protected readonly state = signal<LoadState>('loading');
  protected readonly settings = signal<QualityControlSettingsView | null>(null);
  /** Par l'identité de la vue : un refus remet une vue neuve, et les cases reviennent à l'état servi. */
  protected readonly shown = computed<readonly QualityControlSettingsView[]>(() => {
    const view = this.settings();
    return view === null ? [] : [view];
  });
  protected readonly saving = signal(false);
  /** Le dernier refus, en clair ; `null` quand le dernier envoi a abouti. */
  protected readonly failure = signal<string | null>(null);

  constructor() {
    void this.load();
  }

  protected async load(): Promise<void> {
    this.state.set('loading');
    try {
      this.settings.set(await this.service.read());
      this.state.set('ready');
    } catch {
      this.state.set('error');
    }
  }

  /** Bascule un niveau, garde l'autre tel qu'il est servi, puis relit. */
  protected async set(level: QualityLevel, enabled: boolean): Promise<void> {
    const current = this.settings();
    if (this.saving() || current === null) {
      return;
    }
    this.saving.set(true);
    this.failure.set(null);
    try {
      await this.service.update({
        lineChecks: current.lineChecks,
        orderChecks: current.orderChecks,
        [level]: enabled,
      });
      this.settings.set(await this.service.read());
    } catch (error) {
      this.failure.set(
        httpErrorMessage(error, "Le réglage du contrôle qualité n'a pas pu être enregistré."),
      );
      // Les cases reviennent à l'état servi : rien n'a été appliqué.
      this.settings.update((view) => (view === null ? null : { ...view }));
    } finally {
      this.saving.set(false);
    }
  }
}
