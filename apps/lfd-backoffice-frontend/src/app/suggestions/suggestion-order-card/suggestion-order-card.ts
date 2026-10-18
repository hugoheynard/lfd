import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import type { StaffSuggestionOrder } from '@lfd/contracts';
import {
  FoldCalloutComponent,
  FoldCardComponent,
  FoldElementTitleComponent,
  FoldViewToggleComponent,
} from 'fold-ng';

import { PermissionsStore } from '../../auth/permissions.store';
import { StaffSuggestionsService } from '../staff-suggestions.service';
import { isSuggestionOrder, ORDER_OPTIONS, refusalOf } from '../suggestion-format';

/**
 * **L'ordre entre suggestions concurrentes** (Q3, Hugo, 2026-10-18) — un
 * réglage unique de la boutique : la plus récente d'abord, ou par priorité.
 *
 * Le choix s'enregistre au clic, sans bouton : c'est un interrupteur, pas un
 * formulaire. Sans `lfc_suggestions:write`, il se lit sans se changer. Un
 * refus remet l'ordre lu et le dit.
 */
@Component({
  selector: 'app-suggestion-order-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldCalloutComponent,
    FoldCardComponent,
    FoldElementTitleComponent,
    FoldViewToggleComponent,
  ],
  templateUrl: './suggestion-order-card.html',
  styleUrl: './suggestion-order-card.scss',
})
export class SuggestionOrderCard {
  private readonly api = inject(StaffSuggestionsService);
  private readonly permissions = inject(PermissionsStore);

  protected readonly options = ORDER_OPTIONS;
  protected readonly order = signal<StaffSuggestionOrder | null>(null);
  protected readonly failure = signal<string | null>(null);
  protected readonly canWrite = computed(() => this.permissions.can('lfc_suggestions:write'));
  protected readonly label = computed(
    () => ORDER_OPTIONS.find((option) => option.value === this.order())?.label ?? '',
  );

  constructor() {
    void this.load();
  }

  protected async load(): Promise<void> {
    try {
      this.order.set((await this.api.order()).order);
      this.failure.set(null);
    } catch (error) {
      this.failure.set(refusalOf(error, 'L’ordre des suggestions n’a pas pu être lu.'));
    }
  }

  protected async choose(value: string): Promise<void> {
    if (!isSuggestionOrder(value) || value === this.order()) {
      return;
    }
    const before = this.order();
    this.order.set(value);
    try {
      await this.api.setOrder(value);
      this.failure.set(null);
    } catch (error) {
      this.order.set(before);
      this.failure.set(refusalOf(error, 'L’ordre des suggestions n’a pas pu être enregistré.'));
    }
  }
}
