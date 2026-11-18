import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import {
  PACKING_TRACKING_LEVELS,
  type PackingSettingsView,
  type PackingTrackingLevel,
} from '@lfd/contracts';
import { httpErrorMessage } from '@lfd/endpoints';
import {
  FoldCalloutComponent,
  FoldCardComponent,
  FoldElementTitleComponent,
  FoldLoadingStateComponent,
  FoldViewToggleComponent,
  type FoldViewToggleOption,
} from 'fold-ng';

import { PermissionsStore } from '../../../auth/permissions.store';
import { PackingSettingsService } from '../../../production/packing-settings.service';

const LEVEL_LABEL: Readonly<Record<PackingTrackingLevel, string>> = {
  simple: 'Simple',
  detailed: 'Détaillé',
};

type LoadState = 'loading' | 'ready' | 'error';

function isLevel(value: string): value is PackingTrackingLevel {
  return PACKING_TRACKING_LEVELS.some((level) => level === value);
}

/**
 * **« Colisage — retrait »** sur la page Niveau de suivi (plan des niveaux de
 * suivi du colisage, D2) : Simple (« Tout est prêt » ou « Problème ») ou
 * Détaillé (contenants et répartition). Une livraison reste détaillée.
 *
 * La carte ne possède rien : elle lit et écrit le réglage du colisage par sa
 * route (`admin/packing/settings`), sous ses droits (`delivery_settings`).
 * La route pose des valeurs, rejouables telles quelles : pas de clé
 * d'intention. Le partage d'une moitié est renvoyé tel que servi.
 */
@Component({
  selector: 'app-packing-pickup-level-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldCalloutComponent,
    FoldCardComponent,
    FoldElementTitleComponent,
    FoldLoadingStateComponent,
    FoldViewToggleComponent,
  ],
  templateUrl: './packing-pickup-level-card.html',
  styleUrl: './packing-pickup-level-card.scss',
})
export class PackingPickupLevelCard {
  private readonly service = inject(PackingSettingsService);
  private readonly permissions = inject(PermissionsStore);

  protected readonly state = signal<LoadState>('loading');
  protected readonly settings = signal<PackingSettingsView | null>(null);
  protected readonly saving = signal(false);
  protected readonly refusal = signal<string | null>(null);

  protected readonly canWrite = computed(() => this.permissions.can('delivery_settings:write'));

  protected readonly options: readonly FoldViewToggleOption[] = PACKING_TRACKING_LEVELS.map(
    (value) => ({ value, label: LEVEL_LABEL[value] }),
  );

  protected readonly level = computed(() => this.settings()?.pickupTrackingLevel ?? null);
  protected readonly levelLabel = computed(() => {
    const level = this.level();
    return level === null ? '' : LEVEL_LABEL[level];
  });

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

  /** Pose le niveau tout de suite, puis relit. Un refus laisse le niveau servi, avec la raison. */
  protected async choose(value: string): Promise<void> {
    const served = this.settings();
    if (!isLevel(value) || served === null || value === served.pickupTrackingLevel) {
      return;
    }
    if (this.saving() || !this.canWrite()) {
      return;
    }
    this.saving.set(true);
    this.refusal.set(null);
    try {
      await this.service.update({ halfSharing: served.halfSharing, pickupTrackingLevel: value });
      this.settings.set(await this.service.read());
    } catch (error) {
      this.refusal.set(
        httpErrorMessage(error, "Le niveau du colisage n'a pas pu être enregistré."),
      );
      // Le sélecteur revient au niveau servi : rien n'a été appliqué.
      this.settings.set({ ...served });
    } finally {
      this.saving.set(false);
    }
  }
}
