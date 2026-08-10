import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import type { BillingAddressPayload, OrderLineView, OrderView } from '@lfd/contracts';
import {
  FoldAsideLayoutComponent,
  FoldBadgeComponent,
  FoldIconComponent,
  FoldTimelineComponent,
  type FoldIconName,
  type FoldTimelineNode,
} from 'fold-ng';

import {
  formatAdjustment,
  formatCents,
  formatOrderDate,
  formatVatRate,
  fulfillmentLabel,
  orderStatusLabel,
  orderStatusVariant,
  paymentStatusLabel,
  paymentStatusVariant,
} from '../order-format';
import {
  buildTimeline,
  toTimelineNodes,
  type OrderAudience,
  type TimelineStep,
} from '../order-timeline';

/**
 * Un document rattaché à une commande (bon de livraison, facture…).
 *
 * L'**indisponibilité est un cas de premier ordre**, pas une absence : une
 * facture qui n'est pas encore émise doit se voir, avec sa raison. La masquer
 * ferait chercher ailleurs un document qui n'existe pas encore, et un bouton
 * inerte ne dirait pas pourquoi.
 */
export interface OrderDocument {
  /** Ce que l'app reçoit sur `documentAsked` — à elle de savoir quoi en faire. */
  readonly key: string;
  readonly label: string;
  /**
   * Le glyphe de la pièce. Une facture et un bon de livraison ne se cherchent
   * pas de la même façon dans une liste : la forme aide avant le mot.
   */
  readonly icon?: FoldIconName;
  /** Précision sous le lien (« généré depuis la commande »). */
  readonly hint?: string;
  /** Renseigné = pas de lien, et cette phrase explique pourquoi. */
  readonly unavailable?: string;
}

/**
 * D'où vient la remise. Une seule source aujourd'hui — le point de retrait — et
 * son nom est déjà figé dans le snapshot d'adresse : on ne le redemande pas au
 * serveur, et il reste juste même si le point est renommé ou supprimé après coup.
 */
function discountLabel(order: OrderView): string {
  const point = order.fulfillmentMethod === 'pickup' ? order.pickupAddress : null;
  return point === null || point.label === '' ? 'Remise' : `Retrait — ${point.label}`;
}

/** Une ligne retirée du gabarit récurrent, prête à afficher. */
interface RemovedLine {
  readonly sku: string;
  readonly name: string;
  readonly quantity: number;
}

/** Une ligne du récapitulatif de montants, dans le rail droit. */
interface TotalRow {
  readonly key: string;
  readonly label: string;
  readonly value: string;
  /** Second niveau sous le libellé — le taux d'une remise, par exemple. */
  readonly hint?: string;
  /** Le total TTC — mis en avant, et lui seul. */
  readonly strong: boolean;
}

/**
 * Le **détail d'une commande** — la même page pour le client et pour le
 * commercial.
 *
 * Partagée volontairement : quand un client appelle au sujet de sa commande, le
 * commercial doit avoir **exactement** son écran sous les yeux. Deux rendus
 * distincts, et la conversation se met à porter sur ce que chacun voit plutôt
 * que sur la commande.
 *
 * Purement présentationnel : aucun appel réseau, aucune route. Les actions
 * (régler, transformer en récurrent, changer le statut côté staff) sont
 * **projetées** dans le slot `[actions]` — elles n'ont rien de commun entre les
 * deux côtés, et c'est la seule chose qui diffère.
 */
@Component({
  selector: 'lfd-order-detail',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldAsideLayoutComponent, FoldBadgeComponent, FoldIconComponent, FoldTimelineComponent],
  templateUrl: './order-detail.html',
  styleUrl: './order-detail.scss',
})
export class OrderDetail {
  readonly order = input.required<OrderView>();

  /**
   * À qui s'adresse la page. Le parcours est le même des deux côtés ; seul le
   * **niveau de détail** de la frise change — le staff voit ce que chaque jalon
   * veut dire dans l'atelier, le client voit l'étape.
   *
   * Défaut `client` : c'est le public le plus large, et l'oubli du réglage doit
   * pencher vers le moins de détail, pas vers le plus.
   */
  readonly audience = input<OrderAudience>('client');

  /**
   * Noms de produits par SKU, pour les lignes **retirées** d'une échéance
   * récurrente. Elles ne portent qu'un SKU (elles ne figurent pas dans la
   * commande), donc rien d'autre ne peut les nommer. À défaut, le SKU s'affiche
   * tel quel — laid mais vrai, ce qui vaut mieux qu'une ligne muette.
   */
  readonly nameBySku = input<ReadonlyMap<string, string>>(new Map());

  /**
   * Les documents de la commande. **L'app décide** de la liste et de ce qui est
   * disponible : côté client on ne propose pas les mêmes pièces qu'au staff, et
   * seule l'app sait ce qui existe réellement derrière (un fichier stocké, un
   * document généré, ou rien encore).
   */
  readonly documents = input<readonly OrderDocument[]>([]);

  /** Un document a été demandé — la `key` de l'entrée cliquée. */
  readonly documentAsked = output<string>();

  /**
   * La frise, en nœuds `fold-timeline`. Le rail, les points, la barre de
   * progression et le libellé de progression appartiennent au composant fold ;
   * on ne lui projette que la zone de libellé, pour teinter l'échec et mettre en
   * retrait les jalons que rien ne suit encore.
   */
  protected readonly steps = computed<readonly TimelineStep[]>(() =>
    buildTimeline(this.order(), this.audience()),
  );

  protected readonly nodes = computed<readonly FoldTimelineNode[]>(() =>
    toTimelineNodes(this.steps()),
  );

  /**
   * Le détail d'un jalon, par clé. Le gabarit projeté ne reçoit qu'un
   * `FoldTimelineNode` — un type de fold, qu'on n'étend pas avec nos champs.
   * On le rejoint donc par sa clé, ce qui garde le contrat de fold intact.
   */
  private readonly detailByKey = computed<ReadonlyMap<string, string>>(
    () =>
      new Map(
        this.steps()
          .filter((step): step is TimelineStep & { detail: string } => step.detail !== null)
          .map((step) => [step.key, step.detail]),
      ),
  );

  protected detailOf(key: string): string | null {
    return this.detailByKey().get(key) ?? null;
  }

  protected readonly statusLabel = computed(() => orderStatusLabel(this.order().status));
  protected readonly statusVariant = computed(() => orderStatusVariant(this.order().status));
  protected readonly paymentLabel = computed(() => paymentStatusLabel(this.order().paymentStatus));
  protected readonly paymentVariant = computed(() =>
    paymentStatusVariant(this.order().paymentStatus),
  );
  protected readonly fulfillment = computed(() => fulfillmentLabel(this.order().fulfillmentMethod));

  /** L'adresse figée de l'acheminement : celle du coursier, ou celle du retrait. */
  protected readonly address = computed<BillingAddressPayload | null>(() => {
    const order = this.order();
    return order.fulfillmentMethod === 'delivery' ? order.deliveryAddress : order.pickupAddress;
  });

  /**
   * Le récapitulatif des montants, dans le rail droit. Remise et livraison ne
   * sont **rendues que si elles existent** : une ligne « Remise 0,00 € » invite
   * à chercher une remise qu'on n'a pas eue.
   */
  protected readonly totals = computed<readonly TotalRow[]>(() => {
    const order = this.order();
    const rows: TotalRow[] = [
      {
        key: 'subtotal',
        label: 'Sous-total HT',
        value: formatCents(order.subtotalCents),
        strong: false,
      },
    ];
    if (order.discountCents > 0) {
      // La remise se NOMME : d'où elle vient, à quel taux, pour combien. « Remise
      // 70,68 € » toute seule oblige à ouvrir les réglages pour comprendre.
      const adjustment = order.discountAdjustment;
      rows.push({
        key: 'discount',
        label: discountLabel(order),
        ...(adjustment === null ? {} : { hint: formatAdjustment(adjustment) }),
        value: `− ${formatCents(order.discountCents)}`,
        strong: false,
      });
    }
    if (order.deliveryFeeCents > 0) {
      rows.push({
        key: 'delivery',
        label: 'Livraison HT',
        value: formatCents(order.deliveryFeeCents),
        strong: false,
      });
    }
    rows.push({ key: 'vat', label: 'TVA', value: formatCents(order.vatCents), strong: false });
    rows.push({
      key: 'total',
      label: 'Total TTC',
      value: formatCents(order.totalCents),
      strong: true,
    });
    return rows;
  });

  /** SKU ajoutés pour cette échéance vis-à-vis du gabarit récurrent. */
  protected readonly addedSkus = computed<ReadonlySet<string>>(
    () => new Set((this.order().recurringDeltas?.added ?? []).map((line) => line.sku)),
  );

  protected readonly removed = computed<readonly RemovedLine[]>(() =>
    (this.order().recurringDeltas?.removed ?? []).map((line) => ({
      sku: line.sku,
      name: this.nameBySku().get(line.sku) ?? line.sku,
      quantity: line.quantity,
    })),
  );

  protected isAdded(line: OrderLineView): boolean {
    return this.addedSkus().has(line.sku);
  }

  protected fmtCents(cents: number): string {
    return formatCents(cents);
  }

  protected fmtVat(rate: number): string {
    return formatVatRate(rate);
  }

  protected fmtDate(iso: string): string {
    return formatOrderDate(iso);
  }
}
