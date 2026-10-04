import { ChangeDetectionStrategy, Component, computed, input, model, signal } from '@angular/core';
import type { DeliverySlot } from '@lfd/contracts';
import {
  FoldBadgeComponent,
  FoldButtonComponent,
  FoldButtonIconComponent,
  FoldTimeComponent,
} from 'fold-ng';

import { formatSlot } from '../delivery-format';
import { canAddSlot, isSlot, withoutSlot, withSlot } from '../slot-list.model';

/** Les mots du champ — fournis par `lfd-delivery-specs`, dans la langue de l'app. */
export interface SlotListFieldLabels {
  /** Les libellés des deux champs horaires ; le nom de la ligne les suit. */
  readonly start: string;
  readonly end: string;
  readonly add: string;
  /** `{slot}` : le créneau retiré. */
  readonly remove: string;
  readonly none: string;
  /** Dit quand le créneau tapé en chevauche un déjà posé. */
  readonly overlap: string;
}

/**
 * **Une liste de créneaux à éditer** — ajouter un créneau, en retirer un
 * (plan composition automatique §14.1, CA3b : une adresse commande parfois le
 * matin ET pour une soirée). Le miroir de `lfd-deadline-list-field`.
 *
 * L'ordre et l'absence de chevauchement sont tenus à chaque geste
 * (`slot-list.model.ts`) : la liste rendue est toujours celle que le contrat
 * accepte.
 */
@Component({
  selector: 'lfd-slot-list-field',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldBadgeComponent, FoldButtonComponent, FoldButtonIconComponent, FoldTimeComponent],
  templateUrl: './slot-list-field.html',
  styleUrl: './slot-list-field.scss',
})
export class SlotListField {
  /** Les créneaux, triés et sans chevauchement (two-way). */
  readonly value = model.required<readonly DeliverySlot[]>();
  /** Le nom de la ligne : « Tous les jours », « Lundi »… */
  readonly name = input.required<string>();
  readonly labels = input.required<SlotListFieldLabels>();

  /** Les bornes tapées, pas encore ajoutées. */
  protected readonly pendingStart = signal('');
  protected readonly pendingEnd = signal('');

  private readonly pending = computed<DeliverySlot>(() => ({
    start: this.pendingStart(),
    end: this.pendingEnd(),
  }));

  protected readonly canAdd = computed(() => canAddSlot(this.value(), this.pending()));

  /** Un créneau lisible, mais qui en chevauche un autre : on dit pourquoi « Ajouter » reste fermé. */
  protected readonly overlaps = computed(() => {
    const slot = this.pending();
    return isSlot(slot.start, slot.end) && !this.canAdd();
  });

  protected readonly startLabel = computed(() => `${this.labels().start} · ${this.name()}`);
  protected readonly endLabel = computed(() => `${this.labels().end} · ${this.name()}`);

  protected text(slot: DeliverySlot): string {
    return formatSlot(slot);
  }

  protected removeLabel(slot: DeliverySlot): string {
    return this.labels().remove.replace('{slot}', this.text(slot));
  }

  protected add(): void {
    if (!this.canAdd()) {
      return;
    }
    this.value.update((slots) => withSlot(slots, this.pending()));
    this.pendingStart.set('');
    this.pendingEnd.set('');
  }

  protected remove(slot: DeliverySlot): void {
    this.value.update((slots) => withoutSlot(slots, slot));
  }
}
