import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  output,
  signal,
} from '@angular/core';
import type { OrderCutoffSettingsPatch, OrderCutoffSettingsView } from '@lfd/contracts';
import { httpErrorMessage } from '@lfd/endpoints';
import {
  FoldBadgeComponent,
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldCardComponent,
  FoldElementTitleComponent,
  FoldEmptyStateComponent,
  FoldInlineConfirmComponent,
  FoldLoadingStateComponent,
} from 'fold-ng';

import { PermissionsStore } from '../../../auth/permissions.store';
import { OrderCutoffSettingsService } from '../order-cutoff-settings.service';

type LoadState = 'loading' | 'ready' | 'error';

/** Ce que la confirmation annonce avant de désactiver. */
const DISABLE_EFFECT =
  'La limite générale et son rattrapage ne s’appliqueront plus : sans limite propre à l’article, une commande passera pour une journée tant que son plan de production n’est pas arrêté. L’heure d’arrêt du fournil ne sera plus bornée. La règle reste enregistrée.';
/** Ce que la confirmation annonce avant de réactiver. */
const ENABLE_EFFECT =
  'La limite générale enregistrée s’appliquera de nouveau, telle quelle, à toute commande dont l’article n’a pas sa propre limite.';
/** Ce que la confirmation annonce avant d'ouvrir le jour même. */
const SAME_DAY_OPEN_EFFECT =
  'Une commande pourra viser aujourd’hui, en boutique comme à la saisie, tant que l’heure limite et le plan de production du jour le permettent.';
/** Ce que la confirmation annonce avant de fermer le jour même. */
const SAME_DAY_CLOSE_EFFECT =
  'Plus aucune commande pour aujourd’hui : le premier jour proposé et accepté sera demain. Une saisie de l’équipe sur un plan déjà arrêté reste reçue « hors plan ».';

/**
 * **L'interrupteur de l'heure limite générale** (Hugo, 2026-10-14 —
 * `documentation/commandes/plan-reglages-commandes.md`, §8 et §8.1, lot O3).
 *
 * Désactivée, la règle du commerce n'est plus servie (passation, boutique,
 * fournil) mais reste en base ; les limites produit gardent leur rattrapage,
 * leurs dérogations et leur surtaxe, et l'arrêt du plan ferme toujours sa
 * journée. La bascule passe par une confirmation qui dit son effet, comme
 * l'ouverture du e-commerce : un clic de travers ouvrirait toutes les
 * commandes tardives.
 *
 * Porte aussi « Autoriser les commandes pour le jour même » (§8.3, Hugo
 * 2026-10-14) : le délai minimum est ce réglage, aucune règle codée en dur.
 *
 * Émet l'état servi (`enabledChange`) pour que la page grise ce qui
 * n'appartient qu'à la règle générale. Écriture sous
 * `lfc_order_settings:write`, comme la règle.
 */
@Component({
  selector: 'app-cutoff-switch-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldBadgeComponent,
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldCardComponent,
    FoldElementTitleComponent,
    FoldEmptyStateComponent,
    FoldInlineConfirmComponent,
    FoldLoadingStateComponent,
  ],
  templateUrl: './cutoff-switch-card.html',
  styleUrl: './cutoff-switch-card.scss',
})
export class CutoffSwitchCard {
  private readonly service = inject(OrderCutoffSettingsService);
  private readonly permissions = inject(PermissionsStore);

  /** L'état servi, après chaque lecture réussie. */
  readonly enabledChange = output<boolean>();

  protected readonly canWrite = computed(() => this.permissions.can('lfc_order_settings:write'));
  protected readonly state = signal<LoadState>('loading');
  protected readonly settings = signal<OrderCutoffSettingsView | null>(null);
  /** Le réglage dont la bascule est en vol ; `null` au repos. */
  protected readonly pending = signal<'enabled' | 'sameDay' | null>(null);
  protected readonly failure = signal<string | null>(null);

  protected readonly enabled = computed(() => this.settings()?.enabled ?? true);
  protected readonly effect = computed(() => (this.enabled() ? DISABLE_EFFECT : ENABLE_EFFECT));
  protected readonly sameDay = computed(() => this.settings()?.sameDayAllowed ?? false);
  protected readonly sameDayEffect = computed(() =>
    this.sameDay() ? SAME_DAY_CLOSE_EFFECT : SAME_DAY_OPEN_EFFECT,
  );

  constructor() {
    void this.load();
  }

  protected async load(): Promise<void> {
    this.state.set('loading');
    try {
      this.serve(await this.service.read());
      this.state.set('ready');
    } catch {
      this.state.set('error');
    }
  }

  /** Bascule l'heure limite générale, puis relit. */
  protected toggle(): Promise<void> {
    return this.send('enabled', { enabled: !this.enabled() });
  }

  /** Bascule le jour même, puis relit. */
  protected toggleSameDay(): Promise<void> {
    return this.send('sameDay', { sameDayAllowed: !this.sameDay() });
  }

  /** Envoie, puis relit. Un refus laisse l'état servi, avec la raison. */
  private async send(key: 'enabled' | 'sameDay', patch: OrderCutoffSettingsPatch): Promise<void> {
    if (this.pending() !== null) {
      return;
    }
    this.pending.set(key);
    this.failure.set(null);
    try {
      await this.service.update(patch);
      this.serve(await this.service.read());
    } catch (error) {
      this.failure.set(httpErrorMessage(error, "Le réglage n'a pas pu être enregistré."));
    } finally {
      this.pending.set(null);
    }
  }

  private serve(view: OrderCutoffSettingsView): void {
    this.settings.set(view);
    this.enabledChange.emit(view.enabled);
  }
}
