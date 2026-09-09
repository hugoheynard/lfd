import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import type {
  BillingAddressPayload,
  CustomerOrderLineView,
  CustomerOrderView,
} from '@lfd/contracts';

import {
  entryPriceOf,
  orderTotalRows,
  priceStepLabels,
  wasFloored,
  type TotalRow,
} from '../order-pricing';
import {
  FoldAsideLayoutComponent,
  FoldBadgeComponent,
  FoldIconComponent,
  FoldTimelineComponent,
  type FoldIconName,
  type FoldTimelineNode,
} from 'fold-ng';

import {
  formatCents,
  formatOrderDate,
  formatOrderInstant,
  formatMillicents,
  formatVatPercent,
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
import { QrCode } from '../qr-code/qr-code';

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

/** Une ligne retirée du gabarit récurrent, prête à afficher. */
interface RemovedLine {
  readonly sku: string;
  readonly name: string;
  readonly quantity: number;
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
  imports: [
    FoldAsideLayoutComponent,
    FoldBadgeComponent,
    FoldIconComponent,
    FoldTimelineComponent,
    QrCode,
  ],
  templateUrl: './order-detail.html',
  styleUrl: './order-detail.scss',
})
export class OrderDetail {
  /**
   * **La vue CLIENT, et non la vue staff** — alors que le back-office monte ce
   * même composant.
   *
   * Ce n'est pas un appauvrissement : `OrderView` est structurellement
   * assignable à {@link CustomerOrderView}, donc l'admin passe sa vue entière
   * sans rien convertir. Ce que le type change est ce que le GABARIT peut
   * atteindre — un champ réservé au comptoir (l'identifiant d'une règle, le
   * plancher qui l'a bornée) ne compile pas ici, et ne peut donc pas s'afficher
   * par accident sur l'écran que le client ouvre (R27, 2026-09-09).
   *
   * Le jour où le back-office aura son écran d'explication de la trace, il
   * prendra la vue staff — dans SON composant, pas dans celui-ci.
   */
  readonly order = input.required<CustomerOrderView>();

  /**
   * **Les lignes offrent-elles d'expliquer leur prix ?** Faux par défaut.
   *
   * 🔴 Le drapeau existe pour que le COMPTOIR gagne un geste sans que le client
   * en hérite : l'explication s'appuie sur la trace entière, que les routes
   * clientes ne servent plus (R27). Un bouton qui n'ouvrirait rien serait pire
   * qu'une absence de bouton.
   */
  readonly selectableLines = input(false);

  /** Le SKU de la ligne dont on demande l'explication. */
  readonly lineSelected = output<string>();

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
   * L'URL que le **QR de retrait** encode, ou `null` pour ne rien afficher.
   *
   * Construite par l'app, pas ici : elle pointe vers l'app **admin** (c'est le
   * staff qui scanne), et seule l'app connaît l'origine de ses voisines. Le
   * composant sait dessiner un QR, il n'a pas à savoir où vit le back-office.
   */
  readonly handoverUrl = input<string | null>(null);

  /**
   * Le QR ne s'affiche que s'il **sert** : une commande déjà retirée n'a plus
   * rien à faire scanner, et l'afficher quand même ferait présenter au comptoir
   * un code que le staff verra refusé. La confirmation prend alors sa place.
   */
  protected readonly showQr = computed(
    () => this.handoverUrl() !== null && this.order().handedOverAt === null,
  );

  /** « Retirée le 12 août, 09:14 », ou `null` tant que la remise n'a pas eu lieu. */
  protected readonly handedOverAt = computed<string | null>(() => {
    const at = this.order().handedOverAt;
    return at === null ? null : formatOrderInstant(at);
  });

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

  /** Le récapitulatif des montants — assemblé par `orderTotalRows`, pas ici. */
  protected readonly totals = computed<readonly TotalRow[]>(() => orderTotalRows(this.order()));

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

  /** Cf. `order-pricing.ts` — la dérivation vit là, pure et éprouvée. */
  protected readonly entryPriceOf = entryPriceOf;
  protected readonly priceStepLabels = priceStepLabels;
  protected readonly wasFloored = wasFloored;

  protected isAdded(line: CustomerOrderLineView): boolean {
    return this.addedSkus().has(line.sku);
  }

  protected fmtCents(cents: number): string {
    return formatCents(cents);
  }

  /**
   * Un prix **unitaire**, qui vit en millicentimes.
   *
   * 🔴 Le gabarit passait `unitPriceMillicents` à `fmtCents`, qui divise par
   * CENT : un croissant à 1,38445 € s'affichait « 1 384,45 € » sur l'écran d'une
   * commande, et le prix barré d'un étage tarifaire avec lui. Mille fois trop,
   * sur la page que le bureau lit au téléphone.
   */
  protected fmtMillicents(millicents: number): string {
    return formatMillicents(millicents);
  }

  /**
   * Le taux de TVA d'une ligne — **en pourcentage**, pas en fraction.
   *
   * 🔴 Le gabarit passait `line.vatRate` à `formatVatRate`, qui MULTIPLIE par
   * cent : « 5,5 » devenait « 550 % ». La colonne `vat_rate` est un pourcentage
   * (`Decimal(5,2)`, « %, ex. 5.50 »), et `formatVatPercent` existait déjà pour
   * ce cas — c'est le commentaire de `formatVatRate` qui affirmait le contraire.
   */
  protected fmtVat(percent: number): string {
    return formatVatPercent(percent);
  }

  protected fmtDate(iso: string): string {
    return formatOrderDate(iso);
  }
}
