import { ChangeDetectionStrategy, Component, computed, input, model, output } from '@angular/core';
import type { ShortfallAwaitingDecision, WithdrawnPackingSheet } from '@lfd/contracts';
import { RouterLink } from '@angular/router';
import type { FoldBadgeVariant } from 'fold-ng';
import {
  FoldBadgeComponent,
  FoldButtonComponent,
  FoldCardComponent,
  FoldEmptyStateComponent,
  FoldIconComponent,
  FoldMeterComponent,
} from 'fold-ng';

import { AbandonedRemainder } from '../../commandes/abandoned-remainder/abandoned-remainder';
import { DeliveryNotePrintNotice } from '../../commandes/delivery-note-print-notice/delivery-note-print-notice';
import { AwaitingBadge } from '../../shared/awaiting-badge/awaiting-badge';
import {
  ALL_POINTS,
  PACKING_VISIBLE_MAX,
  packingMeta,
  type PackingBoard,
  type PackingCard,
  type PackingState,
  type UpcomingOrder,
} from '../packing-cards';
import { PackingShortfall } from '../packing-shortfall/packing-shortfall';
import { NO_QUALITY, type QualityBadge, type QualityRequest } from '../quality-badges';
import { countLabel } from '../supervision-labels';
import { SUPERVISION_LINKS } from '../supervision-links';
import { NO_MATCHES } from '../supervision-search';

/**
 * La pastille Mono de chaque état ouvert : le libellé porte l'état, jamais la
 * couleur seule. « Attend le four » n'y est plus : c'est `app-awaiting-badge`,
 * « Att. prod x/n », le mot du poste de colisage (Hugo, 2026-10-25).
 */
const BADGES: Readonly<
  Record<
    Exclude<PackingState, 'packed' | 'awaiting_oven'>,
    { label: string; variant: FoldBadgeVariant }
  >
> = {
  in_progress: { label: 'En cours', variant: 'accent' },
  to_pack: { label: 'À coliser', variant: 'neutral' },
};

/**
 * **Colonne 2 · Colisage — l'unité est la commande.** Seule colonne où une
 * carte = un client. Ni cases de colis, ni Étiquettes, ni Bon de commande :
 * ce sont les gestes du poste, et la carte y renvoie (plan §1).
 *
 * Une commande COLISÉE se juge (`plan-controle-qualite.md`, §5) : elle porte
 * la pastille de son contrôle et, pour qui a le droit, « Contrôler ».
 *
 * Supervision v2 (A4, A5, A7, B7) : la colonne ne décide pas de la mise en
 * avant, elle la DEMANDE (`awaitedToggle`) et la LIT (`matches`, `awaitedOpen`).
 * Le filtre par point se choisit dans `app-packing-band` et se lit ici.
 */
@Component({
  selector: 'app-packing-column',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    AbandonedRemainder,
    AwaitingBadge,
    DeliveryNotePrintNotice,
    PackingShortfall,
    RouterLink,
    FoldBadgeComponent,
    FoldButtonComponent,
    FoldCardComponent,
    FoldEmptyStateComponent,
    FoldIconComponent,
    FoldMeterComponent,
  ],
  templateUrl: './packing-column.html',
  styleUrl: './packing-column.scss',
})
export class PackingColumn {
  readonly board = input.required<PackingBoard>();
  readonly showLinks = input(false);
  readonly narrow = input(false);
  /** Ce que la mise en avant désigne (recherche, pastille, commande dépliée). */
  readonly matches = input(NO_MATCHES);
  /**
   * La commande « attend le four » dépliée, par numéro — la carte SOURCE de la
   * mise en avant produits. `matches` ne la distingue pas d'une pastille « four »
   * qui vise plusieurs commandes : il faut la lire à part.
   */
  readonly awaitedOpen = input<string | null>(null);
  /** Les pastilles du contrôle qualité, par numéro de commande. */
  readonly quality = input(NO_QUALITY);
  /** `b2b_supervision:write` : le bouton « Contrôler ». */
  readonly canCheck = input(false);
  readonly check = output<QualityRequest>();
  /** « n produits attendus du four » ou double-clic : bascule le dépliage de CETTE commande. */
  readonly awaitedToggle = output<string>();
  /** `production_resupply:write` (plan A1, lot A1.4) : « Envoyer en boutique ». */
  readonly canSendToShop = input(false);
  /** Le pain rendu par une feuille retirée part en boutique — la page ouvre le panneau. */
  readonly sendToShop = output<WithdrawnPackingSheet>();
  /**
   * **Manque signalé — décision attendue**, par numéro de commande : la carte
   * passe au fond d'alerte, dit ce qui manque, et porte la décision.
   */
  readonly shortfalls = input<ReadonlyMap<string, ShortfallAwaitingDecision>>(new Map());
  /** Une décision est enregistrée sur une carte : à la page de relire. */
  readonly shortfallDecided = output<void>();
  /** Un BL vient d'être ouvert pour impression : à la page de relire (« Nouveau BL imprimé »). */
  readonly deliveryNotePrinted = output<void>();
  /** Mobile (B7) : « Voir en Préparation → » sur la commande dépliée. */
  readonly showPreparation = output();

  protected readonly link = SUPERVISION_LINKS.packing;

  /**
   * Le point retenu — `[(point)]`, partagé avec `app-packing-band` que la
   * page pose dans le slot `columnBand` ; `''` = tous.
   */
  readonly point = model(ALL_POINTS);

  /** Les commandes en décision attendue d'abord : ce sont elles qui demandent un geste. */
  private readonly open = computed(() => {
    const cards = this.inPoint(this.board().visible);
    const shortfalls = this.shortfalls();
    return [
      ...cards.filter((card) => shortfalls.has(card.reference)),
      ...cards.filter((card) => !shortfalls.has(card.reference)),
    ];
  });

  protected readonly visible = computed(() => this.open().slice(0, PACKING_VISIBLE_MAX));

  protected readonly overflow = computed(() =>
    Math.max(0, this.open().length - PACKING_VISIBLE_MAX),
  );

  protected readonly packed = computed(() => this.inPoint(this.board().packed));

  protected readonly empty = computed(
    () => this.visible().length === 0 && this.packed().length === 0,
  );

  protected readonly packedCount = computed(() => `Colisées · ${String(this.packed().length)}`);

  /** Plan A1, lot A1.3 : les feuilles retirées, tous points confondus. */
  protected readonly withdrawnCount = computed(
    () => `Annulées après l'arrêt · ${String(this.board().withdrawn.length)}`,
  );

  protected readonly overflowLabel = computed(
    () => `+ ${countLabel(this.overflow(), 'commande', 'commandes')} · triées par heure de retrait`,
  );

  /** Une mise en avant PRODUITS : les commandes non visées reculent. */
  protected readonly productsMode = computed(() => this.matches().mode === 'products');

  protected isHit(reference: string): boolean {
    return this.matches().references.has(reference);
  }

  protected isCurrent(reference: string): boolean {
    return this.matches().current === reference;
  }

  /** La carte dépliée, source de la mise en avant produits. */
  protected isSource(card: PackingCard): boolean {
    return card.state === 'awaiting_oven' && this.awaitedOpen() === card.reference;
  }

  /**
   * La carte « four » que l'on SUIT — dépliée, ou visée par la pastille du four :
   * c'est elle qui explique pourquoi les lignes de la colonne 1 ressortent, elle
   * ressort donc aussi (Hugo, 2026-09-28 : « un jaune plus marqué, une bordure
   * nette »).
   */
  protected isSelected(card: PackingCard): boolean {
    return (
      this.isSource(card) ||
      (this.productsMode() && card.state === 'awaiting_oven' && this.isHit(card.reference))
    );
  }

  /** Contour primaire — sauf sur une commande « four » quand on suit des produits. */
  protected outlined(card: PackingCard): boolean {
    return this.isHit(card.reference) && !(this.productsMode() && card.state === 'awaiting_oven');
  }

  protected receded(reference: string): boolean {
    return this.productsMode() && !this.isHit(reference);
  }

  protected toggleAwaited(card: PackingCard): void {
    if (card.state === 'awaiting_oven') {
      this.awaitedToggle.emit(card.reference);
    }
  }

  protected qualityOf(card: PackingCard): QualityBadge | null {
    return this.quality().orders.get(card.reference) ?? null;
  }

  protected requestCheck(card: PackingCard): void {
    if (card.orderId === null) {
      return;
    }
    this.check.emit({
      target: { kind: 'order', orderId: card.orderId },
      title: card.customerLabel,
      subtitle: `Commande ${card.reference}`,
    });
  }

  protected shortfallOf(card: PackingCard): ShortfallAwaitingDecision | null {
    return this.shortfalls().get(card.reference) ?? null;
  }

  protected badgeLabel(card: PackingCard): string {
    return card.state === 'packed' || card.state === 'awaiting_oven'
      ? ''
      : BADGES[card.state].label;
  }

  protected badgeVariant(card: PackingCard): FoldBadgeVariant {
    return card.state === 'packed' || card.state === 'awaiting_oven'
      ? 'success'
      : BADGES[card.state].variant;
  }

  protected meta(card: PackingCard): string {
    return packingMeta(card);
  }

  protected awaitedLabel(card: PackingCard): string {
    const count = card.awaited.length;
    return `${String(count)} ${count > 1 ? 'produits attendus' : 'produit attendu'} du four`;
  }

  protected upcomingUnits(order: UpcomingOrder): string {
    return countLabel(order.totalUnits, 'pièce', 'pièces');
  }

  protected progressLabel(card: PackingCard): string {
    return `${String(card.packedLines)} références sur ${String(card.lineCount)} posées`;
  }

  private inPoint(cards: readonly PackingCard[]): readonly PackingCard[] {
    const point = this.point();
    return point === ALL_POINTS ? cards : cards.filter((card) => card.destination === point);
  }
}
