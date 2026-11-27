import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { PlannedLineCheckView } from '@lfd/contracts';
import {
  FoldButtonComponent,
  FoldButtonIconComponent,
  FoldCalloutComponent,
  FoldCardComponent,
  FoldDropdownComponent,
  FoldDropdownItemComponent,
  FoldElementTitleComponent,
  FoldPopoverTriggerDirective,
} from 'fold-ng';

import { ClientLocale } from '../../client-locale.service';
import { plannerCopy } from '../../copy/screens/planner.copy';
import { screenCopy } from '../../copy/shop-copy-composer';
import { formatCents } from '../../format-money';
import { nextQuantity, previousQuantity, quantityLabel } from '../../shop/sale-unit';
import { ShopCatalogue } from '../../shop/shop-catalogue.store';
import type { CellTotal } from '../planner-board.store';
import { lineCheckOf, type PlannerCell } from '../planner-grid';

/** Une case vers laquelle une ligne peut aller, et pourquoi elle ne le peut pas. */
export interface PlannerTarget {
  readonly key: string;
  readonly label: string;
  /** La phrase du refus quand l'article ne passe pas ce jour-là, sinon `null`. */
  readonly refusal: string | null;
}

/** Une ligne de case, prête à dessiner. */
interface LineRow {
  readonly sku: string;
  readonly name: string;
  readonly quantity: number;
  readonly quantityText: string;
  readonly blocking: string | null;
  readonly targets: readonly PlannerTarget[];
}

/**
 * **Une case du planificateur** — un jour × un créneau, un panier (plan
 * `planificateur/plan-planificateur-de-commandes.md`, § 3.2, § 4 bis, § 6.1).
 *
 * En tête : le total HT du devis, indicatif. Ses lignes, avec − et ＋, et
 * « Déplacer vers… / Retirer » au menu ; une ligne qui bloquerait la
 * commande est en avertissement, avec la phrase du refus réel (annoncée au
 * lecteur d'écran quand elle paraît). En pied : quand elle se commande, ou ce
 * qu'elle est devenue.
 *
 * Pendant un glisser, une case où l'article ne passe pas est grisée et dit
 * pourquoi ; elle refuse le dépôt.
 */
@Component({
  selector: 'app-planner-cell',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldButtonComponent,
    FoldButtonIconComponent,
    FoldCalloutComponent,
    FoldCardComponent,
    FoldDropdownComponent,
    FoldDropdownItemComponent,
    FoldElementTitleComponent,
    FoldPopoverTriggerDirective,
    RouterLink,
  ],
  templateUrl: './planner-cell.html',
  styleUrl: './planner-cell.scss',
})
export class PlannerCellComponent {
  readonly cell = input.required<PlannerCell>();
  readonly label = input.required<string>();
  readonly checks = input.required<readonly PlannedLineCheckView[]>();
  readonly total = input<CellTotal | undefined>(undefined);
  readonly editable = input.required<boolean>();
  /** Les autres cases, pour « Déplacer vers… », chacune avec son refus pour un SKU. */
  readonly targetsFor = input.required<(sku: string) => readonly PlannerTarget[]>();
  /** Pendant un glisser : la phrase du refus de cette case, `''` si elle accepte, `null` hors glisser. */
  readonly dropState = input<string | null>(null);

  readonly quantityChange = output<{ readonly sku: string; readonly quantity: number }>();
  readonly moveLine = output<{ readonly sku: string; readonly to: string }>();
  readonly lineDragStart = output<string>();
  readonly lineDragEnd = output<void>();
  readonly dropped = output<void>();

  protected readonly copy = screenCopy('planner', plannerCopy);
  private readonly catalogue = inject(ShopCatalogue);
  private readonly locale = inject(ClientLocale);

  protected readonly rows = computed<readonly LineRow[]>(() => {
    const cell = this.cell();
    const checks = this.checks();
    const targetsFor = this.targetsFor();
    return cell.lines.map((line) => {
      const item = this.catalogue.itemOf(line.sku);
      return {
        sku: line.sku,
        name: item?.name ?? line.sku,
        quantity: line.quantity,
        quantityText: `×${quantityLabel(line.quantity, item?.saleUnit)}`,
        blocking: lineCheckOf(checks, cell.columnId, line.sku)?.blocking?.reason ?? null,
        targets: targetsFor(line.sku),
      };
    });
  });

  protected readonly blockingCount = computed(
    () => this.rows().filter((row) => row.blocking !== null).length,
  );

  protected readonly blockingText = computed(() => {
    const count = this.blockingCount();
    const copy = this.copy();
    return count === 1 ? copy.blockingOne : copy.blockingMany.replace('{n}', String(count));
  });

  protected readonly totalText = computed(() => {
    const total = this.total();
    const copy = this.copy();
    if (total === 'pending' || total === undefined) {
      return this.cell().lines.length === 0
        ? copy.totalHt.replace('{amount}', formatCents(0))
        : copy.totalPending;
    }
    if (total === 'failed') {
      return copy.totalFailed;
    }
    return copy.totalHt.replace('{amount}', formatCents(total));
  });

  /** « se commande mar. 2 déc. à 14:00 », en heure de Paris. */
  protected readonly convertsText = computed(() => {
    const at = this.cell().convertsAt;
    const copy = this.copy();
    if (at === null) {
      return copy.convertsUnknown;
    }
    const when = new Intl.DateTimeFormat(this.locale.current(), {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'Europe/Paris',
    }).format(new Date(at));
    return copy.convertsAt.replace('{when}', when);
  });

  protected readonly stateText = computed(() => {
    const status = this.cell().status;
    return status === 'draft' ? null : this.copy().states[status];
  });

  protected increase(sku: string, quantity: number): void {
    const item = this.catalogue.itemOf(sku);
    this.quantityChange.emit({
      sku,
      quantity: item === null ? quantity + 1 : nextQuantity(item, quantity),
    });
  }

  protected decrease(sku: string, quantity: number): void {
    const item = this.catalogue.itemOf(sku);
    this.quantityChange.emit({
      sku,
      quantity: item === null ? quantity - 1 : previousQuantity(item, quantity),
    });
  }

  protected remove(sku: string): void {
    this.quantityChange.emit({ sku, quantity: 0 });
  }

  protected named(template: string, name: string): string {
    return template.replace('{name}', name);
  }

  protected onDragStart(event: DragEvent, sku: string): void {
    event.dataTransfer?.setData('text/plain', sku);
    if (event.dataTransfer !== null) {
      event.dataTransfer.effectAllowed = 'move';
    }
    this.lineDragStart.emit(sku);
  }

  /** Un dépôt n'est permis que là où l'article passe : ailleurs, le navigateur le refuse. */
  protected onDragOver(event: DragEvent): void {
    if (this.dropState() === '' && this.editable()) {
      event.preventDefault();
    }
  }

  protected onDrop(event: DragEvent): void {
    event.preventDefault();
    if (this.dropState() === '' && this.editable()) {
      this.dropped.emit();
    }
  }
}
