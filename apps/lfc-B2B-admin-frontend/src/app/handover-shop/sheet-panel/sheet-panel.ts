import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import type { HandoverQueueWindowView, OrderHandoverView } from '@lfd/contracts';
import {
  FoldButtonComponent,
  FoldPanelBodyComponent,
  FoldPanelFooterComponent,
  FoldPanelHeaderComponent,
  FoldPanelRef,
  type FoldPanelContent,
  type FoldPanelDefaults,
} from 'fold-ng';

import { NotifyService } from '../../notify.service';
import { AdminOrdersService } from '../../commandes/orders.service';
import { saveBlob } from '../../shared/download/save-blob';
import { formatWindow } from '../handover-queue';

/**
 * Ce que la file remet au bon : la commande déjà lue par le rail, **dans la vue
 * de la remise**, plus ce que la ligne de file sait et que cette vue n'a pas.
 *
 * 🔴 `order` était une `OrderView` jusqu'au 2026-09-11 — celle du client, avec
 * ses prix et sa trace de négociation. Ce panneau jure ne montrer aucun montant
 * et il tenait ce serment par son gabarit seul ; il le tient maintenant par sa
 * forme, comme les deux autres surfaces de remise.
 */
export interface SheetPanelData {
  readonly order: OrderHandoverView;
  /** Le point de retrait tel que la commande l'a figé, ou `null`. */
  readonly pickupLabel: string | null;
  readonly customerLabel: string;
  /**
   * Le créneau convenu, **repris de la ligne de file** et non relu.
   *
   * La vue de remise ne le porte pas : elle sert d'abord l'écran du scan, qui
   * n'a pas de file derrière lui. Le rail, lui, a la ligne sous la main — la
   * redemander au serveur ferait un aller-retour pour une donnée déjà à
   * l'écran, et ouvrirait la porte à deux heures différentes sur le même bon.
   */
  readonly window: HandoverQueueWindowView | null;
}

const PLACED_AT = new Intl.DateTimeFormat('fr-FR', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});

/**
 * **Le bon, tel qu'on le coche au comptoir** — et sans un seul montant.
 *
 * ## Pourquoi il n'imprime aucun prix
 *
 * Parce qu'on ne facture pas au comptoir. Un total affiché pendant qu'on tend
 * un sac se lit comme une somme à encaisser, et quelqu'un finit par la
 * demander. Ce n'est pas une option de rendu qu'un drapeau rallumerait : cette
 * surface n'a **jamais** de prix à montrer, comme la file qui l'ouvre.
 *
 * ⚠️ Le PDF, lui, est le document COMPLET — c'est celui que le client a reçu, et
 * il porte les prix. Le proposer ici reste juste : quand on tire un papier,
 * c'est ce papier-là qu'on veut. Le bouton le dit.
 *
 * ## Pourquoi il ne relit rien
 *
 * La commande est déjà chargée par le rail qui l'ouvre. La redemander ferait un
 * aller-retour pour des octets qu'on a sous la main, et laisserait le bon
 * afficher un état plus récent que la ligne d'où il sort — deux vérités à
 * l'écran en même temps.
 */
@Component({
  selector: 'app-sheet-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldButtonComponent,
    FoldPanelBodyComponent,
    FoldPanelFooterComponent,
    FoldPanelHeaderComponent,
  ],
  templateUrl: './sheet-panel.html',
  styleUrl: './sheet-panel.scss',
})
export class SheetPanel implements FoldPanelContent<SheetPanelData> {
  static readonly foldPanel: FoldPanelDefaults = { width: 'md' };

  readonly data = input<SheetPanelData | undefined>();

  private readonly api = inject(AdminOrdersService);
  private readonly notify = inject(NotifyService);
  private readonly panel = inject(FoldPanelRef);

  protected readonly busy = signal(false);

  protected readonly order = computed<OrderHandoverView | null>(() => this.data()?.order ?? null);

  protected readonly customerLabel = computed<string>(() => this.data()?.customerLabel ?? '');

  /** « Retrait » ou « Livraison », puis où. Jamais l'un sans l'autre. */
  protected readonly fulfillment = computed<string>(() => {
    const order = this.order();
    if (order === null) {
      return '';
    }
    const how = order.fulfillmentMethod === 'delivery' ? 'Livraison' : 'Retrait';
    // ⚠️ Plus de repli sur la ville de livraison : elle vivait sur l'`OrderView`
    // du client, et la file ne montre plus que des retraits. Une commande de
    // retrait sans point figé — il en reste d'avant les points — dit « Retrait »
    // et rien de plus, ce qui est vrai.
    const where = this.data()?.pickupLabel ?? null;
    return where === null ? how : `${how} · ${where}`;
  });

  /** Le créneau convenu, ou `null` — aucune heure n'est inventée ici non plus. */
  protected readonly window = computed<string | null>(() =>
    formatWindow(this.data()?.window ?? null),
  );

  protected readonly day = computed<string>(() => {
    const date = this.order()?.requestedDeliveryDate;
    return date === null || date === undefined ? '' : PLACED_AT.format(new Date(date));
  });

  protected readonly totalUnits = computed<number>(() =>
    (this.order()?.lines ?? []).reduce((sum, line) => sum + line.quantity, 0),
  );

  /**
   * Le document complet, celui que le client a reçu. **Il porte les prix** — le
   * bouton le dit, parce qu'on ne tire pas un papier tarifé sans le savoir.
   */
  protected async download(): Promise<void> {
    const order = this.order();
    if (order === null) {
      return;
    }
    this.busy.set(true);
    try {
      const pdf = await this.api.sheetPdf(order.orderId);
      saveBlob(pdf, `bon-de-commande-${order.orderNumber}.pdf`);
    } catch (caught) {
      this.notify.error(caught, "Le bon de commande n'a pas pu être téléchargé.");
    } finally {
      this.busy.set(false);
    }
  }

  protected close(): void {
    this.panel.close();
  }
}
