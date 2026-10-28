import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import {
  FoldBadgeComponent,
  FoldButtonComponent,
  FoldCardComponent,
  FoldElementTitleComponent,
  FoldMeterComponent,
  type FoldBadgeVariant,
  type FoldMeterTone,
} from 'fold-ng';

import type { WorkshopLine } from '@lfd/contracts';

import { beforeLabel, type DeadlineSlot, type SlotRow, slots } from '../workshop-deadlines';

/** Une quantité à déclarer sur une ligne. */
export interface SlotRecord {
  readonly line: WorkshopLine;
  readonly quantity: number;
}

/** « Saisir » depuis une tranche : la ligne, et le manque de son palier. */
export interface SlotEntry {
  readonly line: WorkshopLine;
  readonly preset: number;
}

/** Une tranche, avec ce que sa carte dit. */
interface ShownSlot {
  readonly slot: DeadlineSlot;
  readonly title: string;
  readonly badge: string;
  readonly variant: FoldBadgeVariant;
}

/**
 * **La vue par tranche** (plan `documentation/fournil/plan-fournee-v3.md` §4.8,
 * SPEC v3 §4) — une carte par heure limite, dans l'ordre : Dépassée, La
 * prochaine (une seule), À venir, Tenue ; une rangée par produit qui a un
 * palier à cette heure.
 *
 * Elle ne décide rien : « + 1 plaque » remonte une fournée, « Saisir » demande
 * au parent de basculer en vue produit, pavé ouvert.
 */
@Component({
  selector: 'app-worksheet-slots',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldBadgeComponent,
    FoldButtonComponent,
    FoldCardComponent,
    FoldElementTitleComponent,
    FoldMeterComponent,
  ],
  templateUrl: './worksheet-slots.html',
  styleUrl: './worksheet-slots.scss',
})
export class WorksheetSlots {
  readonly lines = input.required<readonly WorkshopLine[]>();
  /** « Maintenant », en minutes depuis minuit. */
  readonly now = input.required<number>();
  /** Les SKU dont un geste est en vol. */
  readonly busy = input<ReadonlySet<string>>(new Set());
  /** Téléphone : un seul bouton par rangée. */
  readonly compact = input(false);

  readonly recorded = output<SlotRecord>();
  readonly entered = output<SlotEntry>();

  protected readonly shown = computed<readonly ShownSlot[]>(() =>
    slots(this.lines(), this.now()).map((slot) => ({
      slot,
      title: beforeLabel(slot.before),
      ...badgeOf(slot),
    })),
  );

  protected sub(row: SlotRow): string {
    const container = row.line.container;
    const size =
      container === null ? null : `${container.singular} de ${String(container.unitsPerContainer)}`;
    const parts = [
      row.count > 1 ? `palier ${String(row.index + 1)} sur ${String(row.count)}` : null,
      size ?? (row.count > 1 ? null : 'pas de contenant réglé'),
    ];
    return parts.filter((part) => part !== null).join(' · ');
  }

  protected tone(slot: DeadlineSlot, row: SlotRow): FoldMeterTone {
    if (row.missing === 0) {
      return 'success';
    }
    return slot.state === 'over' ? 'alert' : 'accent';
  }

  protected record(row: SlotRow): void {
    const container = row.line.container;
    if (container !== null) {
      this.recorded.emit({ line: row.line, quantity: container.unitsPerContainer });
    }
  }

  protected enter(row: SlotRow): void {
    this.entered.emit({ line: row.line, preset: row.missing });
  }
}

function badgeOf(slot: DeadlineSlot): { badge: string; variant: FoldBadgeVariant } {
  switch (slot.state) {
    case 'over':
      return { badge: `Dépassée · ${String(slot.lateBy)} min`, variant: 'alert' };
    case 'next':
      return { badge: 'La prochaine', variant: 'info' };
    case 'met':
      return { badge: 'Tenue', variant: 'success' };
    default:
      return { badge: 'À venir', variant: 'neutral' };
  }
}
