import { DatePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
} from '@angular/core';
import type { AdminOrderShortfall, OrderLineView, OrderSaleUnit, StaffNote } from '@lfd/contracts';
import { saleQuantityLabel } from '@lfd/b2b-ui/catalog';
import { httpErrorMessage } from '@lfd/endpoints';
import { FoldButtonComponent, FoldCalloutComponent, FoldInlineConfirmComponent } from 'fold-ng';

import { PermissionsStore } from '../../auth/permissions.store';
import { NotifyService } from '../../notify.service';
import { DeliveryNotesService, REPRINT_SENTENCE } from '../delivery-notes.service';
import { AbandonedRemainder } from '../abandoned-remainder/abandoned-remainder';
import { AdminOrdersService } from '../orders.service';
import { abandonedOfShortfall } from '../shortfall-remainder';

/** Une ligne qui part, nommée par la commande. */
interface DepartingLine {
  readonly sku: string;
  readonly name: string;
  readonly packed: number;
  readonly due: number;
  /** Au poids, `packed` et `due` sont des grammes (P6). */
  readonly saleUnit: OrderSaleUnit;
}

/**
 * **« Décider du départ »** (lot E6b,
 * plan E6 (`documentation/commandes/bon-de-livraison.md`) § 12.2 et § 14),
 * sous le bandeau du manque signalé.
 *
 * Les quantités sont en lecture : ce qui part est ce que le colisage a figé.
 * Le reste est abandonné — « à relivrer » arrive avec E7. Absent sans
 * `b2b_orders_shortfall:write`. Une fois la décision prise, il la dit, et dit
 * « réimprimez-le » si le BL avait été imprimé avant (calculé par le serveur).
 */
@Component({
  selector: 'app-order-shortfall-decision',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    AbandonedRemainder,
    DatePipe,
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldInlineConfirmComponent,
  ],
  templateUrl: './order-shortfall-decision.html',
  styleUrl: './order-shortfall-decision.scss',
})
export class OrderShortfallDecision {
  readonly orderId = input.required<string>();
  readonly shortfall = input.required<AdminOrderShortfall | null>();
  readonly lines = input.required<readonly Pick<OrderLineView, 'sku' | 'productName'>[]>();

  /** « 3 » ou « 750 g » : une quantité dans l'unité de l'article. */
  protected figure(quantity: number, unit: OrderSaleUnit): string {
    return saleQuantityLabel(quantity, unit);
  }

  /** La décision est enregistrée : au parent de relire le détail. */
  readonly decided = output<void>();

  private readonly api = inject(AdminOrdersService);
  private readonly notes = inject(DeliveryNotesService);
  private readonly notify = inject(NotifyService);
  private readonly permissions = inject(PermissionsStore);

  protected readonly allowed = computed(() => this.permissions.can('b2b_orders_shortfall:write'));
  protected readonly reprintSentence = REPRINT_SENTENCE;
  protected readonly open = signal(false);
  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);
  /** Les BL imprimés puis changés, relus après la décision. */
  protected readonly toReprint = signal<readonly StaffNote[]>([]);

  /** Le départ décidé : ce qui n'est pas parti, ligne par ligne (Hugo, 2026-10-25). */
  protected readonly abandoned = computed(() =>
    abandonedOfShortfall(
      this.shortfall(),
      new Map(this.lines().map((line) => [line.sku, line.productName])),
    ),
  );

  protected readonly departing = computed<readonly DepartingLine[]>(() => {
    const shortfall = this.shortfall();
    if (shortfall === null) {
      return [];
    }
    const names = new Map(this.lines().map((line) => [line.sku, line.productName]));
    return shortfall.lines.map((line) => ({ ...line, name: names.get(line.sku) ?? line.sku }));
  });

  constructor() {
    effect(() => {
      const decided = this.shortfall()?.decision ?? null;
      const id = this.orderId();
      untracked(() => {
        if (decided !== null) {
          void this.loadReprints(id);
        }
      });
    });
  }

  protected async confirm(): Promise<void> {
    this.saving.set(true);
    this.error.set(null);
    try {
      await this.api.decideShortfall(this.orderId(), { remainder: 'abandoned' });
      this.open.set(false);
      this.decided.emit();
    } catch (caught) {
      this.error.set(httpErrorMessage(caught, "La décision n'a pas été enregistrée. Réessayez."));
    } finally {
      this.saving.set(false);
    }
  }

  protected async reprint(note: StaffNote): Promise<void> {
    try {
      await this.notes.openCarrier(this.orderId(), note.number);
      await this.loadReprints(this.orderId());
    } catch (error) {
      this.notify.error(error, `Le bon de livraison ${note.number} n'a pas pu être ouvert.`);
    }
  }

  private async loadReprints(orderId: string): Promise<void> {
    try {
      this.toReprint.set((await this.notes.ofOrder(orderId)).filter((note) => note.reprintNeeded));
    } catch {
      // La carte des bons de livraison dit déjà son propre échec de lecture.
      this.toReprint.set([]);
    }
  }
}
