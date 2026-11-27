import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
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
import { NgTemplateOutlet } from '@angular/common';
import { lineOptionMentions } from '../../line-options/line-options';
import {
  FoldAsideLayoutComponent,
  FoldBadgeComponent,
  FoldCardComponent,
  FoldIconComponent,
  FoldTimelineComponent,
  type FoldIconName,
  type FoldTimelineNode,
  FoldViewToggleComponent,
  type FoldViewToggleOption,
} from 'fold-ng';

import {
  formatCents,
  formatOrderInstant,
  formatMillicents,
  formatVatPercent,
  fulfillmentLabel,
  IN_HOUSE_ORDER_MENTION,
  isPricedOrder,
} from '../order-format';
import { OrderDetailHead } from '../order-detail-head/order-detail-head';
import { SectionTitle } from '../section-title/section-title';
import { OrderDocumentsList } from '../order-documents-list/order-documents-list';
import {
  buildTimeline,
  toTimelineNodes,
  type OrderAudience,
  type TimelineStep,
} from '../order-timeline';
import { QrCode } from '../qr-code/qr-code';
import { saleQuantityLabel } from '../../catalog/sale-terms';

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
 * **Qui a pris la commande**, côté staff : le titre de la première étape
 * (« Prise par l'équipe », « Prise par le client »…) et, sur la ligne en
 * dessous, qui l'a saisie — `null` quand personne de l'équipe ne l'a fait.
 */
export interface OrderEntryStep {
  readonly label: string;
  readonly detail: string | null;
}

/**
 * Ce que montre la page quand elle manque de place, côté staff : sur une seule
 * colonne, un des trois blocs ; en tablette paysage, la colonne de droite
 * montre les infos (`composition` s'y lit comme `info`) ou l'avancement.
 */
type PaneView = 'composition' | 'info' | 'progress';

/** Une seule colonne (téléphone, tablette en portrait) : un bloc à la fois. */
const PANE_VIEW_OPTIONS: readonly FoldViewToggleOption[] = [
  { value: 'composition', label: 'Composition' },
  { value: 'info', label: 'Infos' },
  { value: 'progress', label: 'Avancement' },
];

/** Tablette paysage : la colonne de droite, la composition restant à gauche. */
const RAIL_VIEW_OPTIONS: readonly FoldViewToggleOption[] = [
  { value: 'info', label: 'Infos' },
  { value: 'progress', label: 'Avancement' },
];

/** La première étape côté staff : qui a pris la commande, et quand. */
function entryStepOf(entry: OrderEntryStep, placedAt: string): TimelineStep {
  return {
    key: 'entry',
    label: entry.label,
    state: 'done',
    icon: 'user',
    tracked: true,
    detail: entry.detail,
    at: formatOrderInstant(placedAt),
    expectedAt: null,
  };
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
/** Une case de la colonne « Parti » : la quantité partie, et le reste s'il y en a un. */
export interface DepartedCell {
  /** « 3 », « 750 g ». */
  readonly label: string;
  /** « 2 en reliquat » ; `null` quand tout est parti. */
  readonly remainder: string | null;
}

@Component({
  selector: 'lfd-order-detail',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldAsideLayoutComponent,
    FoldBadgeComponent,
    FoldCardComponent,
    FoldIconComponent,
    FoldTimelineComponent,
    FoldViewToggleComponent,
    NgTemplateOutlet,
    OrderDetailHead,
    OrderDocumentsList,
    QrCode,
    SectionTitle,
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
   * La langue du lecteur, pour le libellé d'une promotion figé dans les
   * trois langues (lot L10 du plan des promotions). Défaut `fr` : le
   * back-office, et toute trace d'avant, qui n'a que le français.
   */
  readonly locale = input('fr');

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
   * **L'en-tête est-il rendu ici ?** Vrai par défaut — la boutique.
   *
   * Le back-office le tait pour le rendre dans sa bande de tête
   * (`lfd-order-detail-head`, le même composant) : un en-tête dans la bande et
   * un second dans le corps diraient deux fois la même commande.
   */
  readonly showHead = input(true);

  /**
   * **Les documents sont-ils au rail ?** Vrai par défaut — la boutique.
   *
   * Le back-office les sort dans son onglet « Documents »
   * (`lfd-order-documents-list`, la même liste), à côté des bons, factures et
   * e-mails de la commande.
   */
  readonly showDocuments = input(true);

  /**
   * **Qui a pris la commande** (« Prise par l'équipe », puis « saisie par … »
   * en dessous ; « Prise par le client »), en première étape de l'avancement,
   * à l'instant de la passation. `null` par défaut, et ignoré hors de `audience="staff"` :
   * le libellé est calculé par le back-office, et la boutique n'a pas cette
   * étape.
   */
  readonly entryStep = input<OrderEntryStep | null>(null);

  /**
   * **Les blocs en cartes fold** (`fold-card` + `lfd-section-title`) — la
   * composition et le rail. Faux par défaut : la
   * boutique garde ses sections ; le back-office aligne ces blocs sur ses
   * autres cartes, sous un seul style de titre.
   */
  readonly framed = input(false);

  /**
   * **Ce qu'on lit quand la place manque**, côté staff (`framed`). Sur une
   * seule colonne, un des trois blocs — la composition d'abord ; en tablette
   * paysage, où fold range l'avancement SOUS les infos, la colonne de droite
   * montre l'un ou l'autre. Au bureau, rien n'est masqué. Les bascules ne se
   * voient que dans leur plage (voir le SCSS).
   */
  protected readonly paneView = signal<PaneView>('composition');
  protected readonly paneViewOptions = PANE_VIEW_OPTIONS;
  protected readonly railViewOptions = RAIL_VIEW_OPTIONS;
  /** La colonne de droite en tablette : les infos, sauf si l'avancement est choisi. */
  protected readonly railView = computed(() =>
    this.paneView() === 'progress' ? 'progress' : 'info',
  );

  protected choosePaneView(value: string): void {
    this.paneView.set(value === 'info' || value === 'progress' ? value : 'composition');
  }

  /**
   * Une marque par ligne (SKU → mot), posée en badge après le nom — côté staff,
   * « hors délai » sur une ligne dont la limite a été passée. Vide par défaut :
   * la boutique ne reçoit pas ces données.
   */
  readonly lineBadges = input<ReadonlyMap<string, string>>(new Map());

  /**
   * **Ce qui est parti**, par SKU (`documentation/commandes/reliquat/reliquat.md`, § 7) — côté
   * staff, sur une commande au départ décidé : la colonne « Qté » devient
   * « Commandé » et une colonne « Parti » la suit ; un article dont une part
   * est restée le marque sous la quantité partie. `null` (par défaut) : pas
   * de colonne — la boutique et toute commande sans décision.
   */
  readonly departed = input<ReadonlyMap<string, DepartedCell> | null>(null);

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
  protected readonly steps = computed<readonly TimelineStep[]>(() => {
    const steps = buildTimeline(this.order(), this.audience());
    const entry = this.entryStep();
    return entry === null || this.audience() !== 'staff'
      ? steps
      : [entryStepOf(entry, this.order().placedAt), ...steps];
  });

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

  protected readonly fulfillment = computed(() => {
    const order = this.order();
    return fulfillmentLabel(order.fulfillmentMethod, order.pickupAddress?.label);
  });

  /** L'adresse figée de l'acheminement : celle du coursier, ou celle du retrait. */
  protected readonly address = computed<BillingAddressPayload | null>(() => {
    const order = this.order();
    return order.fulfillmentMethod === 'delivery' ? order.deliveryAddress : order.pickupAddress;
  });

  /**
   * **La commande montre-t-elle ses prix ?** Faux pour une commande interne
   * (`isPricedOrder`) : les quantités seules, et la mention à la place des
   * montants.
   */
  protected readonly priced = computed(() => isPricedOrder(this.order()));
  protected readonly inHouseMention = IN_HOUSE_ORDER_MENTION;

  /** Le récapitulatif des montants — assemblé par `orderTotalRows`, pas ici. */
  protected readonly totals = computed<readonly TotalRow[]>(() =>
    orderTotalRows(this.order(), this.locale()),
  );

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

  /** La quantité dite : « 12 », ou « 1,25 kg » au poids (`vente-au-poids.md`, P5). */
  protected quantityOf(line: CustomerOrderLineView): string {
    return saleQuantityLabel(line.quantity, line.saleUnit);
  }

  /** « dont 2 tranché » — les options figées de la ligne, une mention par choix (G4). */
  protected optionMentions(line: CustomerOrderLineView): readonly string[] {
    return lineOptionMentions(line);
  }

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
}
