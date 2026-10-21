import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import type { OrderCutoffSettingsView } from '@lfd/contracts';
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
  FoldPageLayoutComponent,
} from 'fold-ng';

import { PermissionsStore } from '../../../auth/permissions.store';
import { OrderCutoffSettingsService } from '../order-cutoff-settings.service';

type LoadState = 'loading' | 'ready' | 'error';

/** Ce que la confirmation annonce avant d'ouvrir le jour même. */
const OPEN_EFFECT =
  'Une commande pourra viser aujourd’hui, en boutique comme à la saisie, tant que l’heure limite et le plan de production du jour le permettent.';
/** Ce que la confirmation annonce avant de fermer le jour même. */
const CLOSE_EFFECT =
  'Plus aucune commande pour aujourd’hui : le premier jour proposé et accepté sera demain. Une saisie de l’équipe sur un plan déjà arrêté reste reçue « hors plan ».';

/**
 * **Jour même** — Réglages › Commandes (Hugo, 2026-10-21 —
 * `documentation/limites-de-commande/plan-une-seule-heure.md` §6).
 *
 * Le réglage vivait sur l'écran de l'heure limite, à côté de l'interrupteur
 * de l'heure limite générale. L'interrupteur est retiré le même jour ; le
 * jour même, lui, garde son comportement (`same_day_allowed`) et son droit
 * (`lfc_order_settings`), sur une page à lui « car nous y réfléchirons après »
 * — la commande pour aujourd'hui sur le stock de la vitrine (schéma des
 * réglages §0).
 *
 * La bascule passe par une confirmation qui dit son effet, comme l'ouverture
 * du e-commerce. Écriture sous `lfc_order_settings:write`.
 */
@Component({
  selector: 'app-same-day-page',
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
    FoldPageLayoutComponent,
  ],
  templateUrl: './same-day-page.html',
  styleUrl: './same-day-page.scss',
})
export class SameDayPage {
  private readonly service = inject(OrderCutoffSettingsService);
  private readonly permissions = inject(PermissionsStore);

  protected readonly canWrite = computed(() => this.permissions.can('lfc_order_settings:write'));
  protected readonly state = signal<LoadState>('loading');
  protected readonly settings = signal<OrderCutoffSettingsView | null>(null);
  protected readonly pending = signal(false);
  protected readonly failure = signal<string | null>(null);

  protected readonly allowed = computed(() => this.settings()?.sameDayAllowed ?? false);
  protected readonly effect = computed(() => (this.allowed() ? CLOSE_EFFECT : OPEN_EFFECT));

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

  /** Bascule, puis relit. Un refus laisse l'état servi, avec la raison. */
  protected async toggle(): Promise<void> {
    if (this.pending()) {
      return;
    }
    this.pending.set(true);
    this.failure.set(null);
    try {
      await this.service.update({ sameDayAllowed: !this.allowed() });
      this.settings.set(await this.service.read());
    } catch (error) {
      this.failure.set(httpErrorMessage(error, "Le réglage n'a pas pu être enregistré."));
    } finally {
      this.pending.set(false);
    }
  }
}
