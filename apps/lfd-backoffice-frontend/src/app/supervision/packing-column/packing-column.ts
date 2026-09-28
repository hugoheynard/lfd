import { ChangeDetectionStrategy, Component, computed, input, model, output } from '@angular/core';
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

import {
  ALL_POINTS,
  PACKING_VISIBLE_MAX,
  packingMeta,
  type PackingBoard,
  type PackingCard,
  type PackingState,
  type UpcomingOrder,
} from '../packing-cards';
import { NO_QUALITY, type QualityBadge, type QualityRequest } from '../quality-badges';
import { countLabel } from '../supervision-labels';
import { SUPERVISION_LINKS } from '../supervision-links';
import { NO_MATCHES } from '../supervision-search';

/** La pastille Mono de chaque état ouvert : le libellé porte l'état, jamais la couleur seule. */
const BADGES: Readonly<
  Record<Exclude<PackingState, 'packed'>, { label: string; variant: FoldBadgeVariant }>
> = {
  awaiting_oven: { label: 'Attend le four', variant: 'warning' },
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
  /** Mobile (B7) : « Voir en Préparation → » sur la commande dépliée. */
  readonly showPreparation = output();

  protected readonly link = SUPERVISION_LINKS.packing;

  /**
   * Le point retenu — `[(point)]`, partagé avec `app-packing-band` que la
   * page pose dans le slot `columnBand` ; `''` = tous.
   */
  readonly point = model(ALL_POINTS);

  private readonly open = computed(() => this.inPoint(this.board().visible));

  protected readonly visible = computed(() => this.open().slice(0, PACKING_VISIBLE_MAX));

  protected readonly overflow = computed(() =>
    Math.max(0, this.open().length - PACKING_VISIBLE_MAX),
  );

  protected readonly packed = computed(() => this.inPoint(this.board().packed));

  protected readonly empty = computed(
    () => this.visible().length === 0 && this.packed().length === 0,
  );

  protected readonly packedCount = computed(() => `Colisées · ${String(this.packed().length)}`);

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

  protected badgeLabel(card: PackingCard): string {
    return card.state === 'packed' ? '' : BADGES[card.state].label;
  }

  protected badgeVariant(card: PackingCard): FoldBadgeVariant {
    return card.state === 'packed' ? 'success' : BADGES[card.state].variant;
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
