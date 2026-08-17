import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import type {
  ElasticityComparison,
  ItemElasticityView,
  NegotiationRoom,
  PriceFloorView,
  PriceRuleView,
  PriceScopePayload,
  PricingBoardView,
  PricingCategoryView,
  PricingItemView,
} from '@lfd/contracts';
import { PRICE_STAGE_LABELS } from '@lfd/contracts';
import { formatEuros } from '@lfd/catalog-ui';
import {
  FoldBadgeComponent,
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldEmptyStateComponent,
  FoldLoadingStateComponent,
  FoldPanelHostService,
} from 'fold-ng';

import { FloorPanel, type FloorPanelData } from './floor-panel/floor-panel';
import { RulePanel, type RulePanelData } from './rule-panel/rule-panel';
import { TarificationService } from './tarification.service';

type LoadState = 'loading' | 'ready' | 'error';

/**
 * Sous-page **Tarification** des Réglages (staff) — le point de manipulation du
 * prix.
 *
 * Elle se lit de **gauche à droite**, comme le prix se construit : l'article et
 * son tarif, la limite qui le protège, l'altération de sa famille, la sienne, et
 * le prix qui en sort. Chaque cellule vide porte un `+` en pointillés : la
 * colonne dit où poser, sans qu'on ait à chercher dans un menu.
 *
 * Deux colonnes suivent, qui ne construisent plus le prix mais le **commentent** :
 *
 * - **la remise encore accordable**, en euros ET en pourcent — le commercial
 *   choisit celle qu'il annonce dans son appel, donc aucune n'est un sous-titre
 *   de l'autre ;
 * - **l'effort de volume** que l'altération impose : « ×1,25 pour le même
 *   chiffre », et où en est le réalisé. Deux comparaisons, parce qu'elles
 *   répondent à deux questions — celle qui juge la règle (avant/après) et celle
 *   qui dit où on en est (fenêtre glissante).
 *
 * **Trois choses que cet écran doit dire sous peine de mentir**, et qu'il dit :
 *
 * - la limite s'applique **en fin de chaîne**, pas à la place qu'elle occupe
 *   dans la lecture. Sa colonne est un garde-fou, pas un étage : elle ne
 *   s'allume que lorsqu'elle a réellement relevé le prix ;
 * - dans un même étage, l'altération de l'article **remplace** celle de sa
 *   famille — elles ne s'enchaînent pas. Le nœud supplanté est barré, sinon le
 *   lecteur additionnerait deux remises dont une seule agit ;
 * - l'objectif de volume se calcule **à chiffre d'affaires constant**, jamais à
 *   marge constante : le prix de revient n'existe nulle part dans le modèle, et
 *   un coût inventé afficherait une marge fausse avec l'aplomb d'un tableau de
 *   bord ;
 * - un objectif manqué reste **neutre** à l'écran. Peindre en rouge tout ce qui
 *   est sous 100 % ferait paniquer sur des remises trop récentes pour avoir
 *   produit quoi que ce soit — d'où `conclusive`, qui dit « trop tôt » ;
 * - le prix montré est celui d'**un** article pour **quelqu'un sans tarif
 *   négocié**, aujourd'hui. Mercuriales et paliers de volume existent et ne se
 *   voient pas ici — c'est le prix de vitrine, et l'en-tête l'écrit.
 */
@Component({
  selector: 'app-reglages-tarification-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldBadgeComponent,
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldEmptyStateComponent,
    FoldLoadingStateComponent,
  ],
  templateUrl: './reglages-tarification-page.html',
  styleUrl: './reglages-tarification-page.scss',
})
export class ReglagesTarificationPage {
  private readonly tarification = inject(TarificationService);
  private readonly panels = inject(FoldPanelHostService);

  protected readonly state = signal<LoadState>('loading');
  protected readonly board = signal<PricingBoardView | null>(null);

  protected readonly euros = formatEuros;

  protected readonly categories = computed<readonly PricingCategoryView[]>(
    () => this.board()?.categories ?? [],
  );

  /** Combien de prix ont été relevés par une limite — le chiffre qui alerte. */
  protected readonly flooredCount = computed(
    () =>
      this.categories()
        .flatMap((category) => category.items)
        .filter((item) => item.floored).length,
  );

  /** Combien d'articles portent au moins une altération, tous étages confondus. */
  protected readonly alteredCount = computed(
    () =>
      this.categories()
        .flatMap((category) => category.items)
        .filter((item) => item.steps.length > 0).length,
  );

  constructor() {
    void this.load();
  }

  protected async load(): Promise<void> {
    this.state.set('loading');
    try {
      this.board.set(await this.tarification.read());
      this.state.set('ready');
    } catch {
      this.state.set('error');
    }
  }

  /** Ce qu'une règle fait, en une ligne — c'est ce que le nœud affiche. */
  protected ruleSummary(rule: PriceRuleView): string {
    const effect =
      rule.effect.nature === 'replace'
        ? `à ${formatEuros(rule.effect.amountCents)}`
        : `${rule.effect.direction === 'increase' ? '+' : '−'}${magnitude(rule)}`;
    const tier = rule.minQuantity === null ? '' : ` dès ${String(rule.minQuantity)}`;
    return `${PRICE_STAGE_LABELS[rule.stage]} ${effect}${tier}`;
  }

  /** Une limite, mise en forme selon son unité. */
  protected floorLabel(floor: PriceFloorView): string {
    return floor.mode === 'percent'
      ? `${String(floor.value / 100)} % du tarif`
      : formatEuros(floor.value);
  }

  /** La limite de l'article vient-elle d'ailleurs ? Le nœud le dit alors. */
  protected isInherited(item: PricingItemView): boolean {
    return item.ownFloor === null && item.effectiveFloor !== null;
  }

  protected isSuperseded(rule: PriceRuleView, category: PricingCategoryView): boolean {
    return category.items.some((item) => item.supersededRuleIds.includes(rule.id));
  }

  protected addCategoryRule(category: PricingCategoryView): void {
    void this.openRule({ scope: { type: 'category', id: category.id }, target: category.name });
  }

  protected addItemRule(item: PricingItemView): void {
    void this.openRule({ scope: { type: 'product', id: item.sku }, target: item.name });
  }

  protected editItemFloor(item: PricingItemView): void {
    void this.openFloor({
      scope: { type: 'product', id: item.sku },
      target: item.name,
      current: item.ownFloor,
      inherited: item.effectiveFloor,
      canonicalCents: item.canonicalCents,
    });
  }

  protected editCategoryFloor(category: PricingCategoryView): void {
    void this.openFloor({
      scope: { type: 'category', id: category.id },
      target: category.name,
      current: category.floor,
      inherited: this.board()?.globalFloor ?? null,
      canonicalCents: null,
    });
  }

  protected async removeRule(rule: PriceRuleView): Promise<void> {
    await this.tarification.removeRule(rule.id);
    await this.load();
  }

  private async openRule(data: RulePanelData): Promise<void> {
    await this.reloadIfChanged(
      this.panels.open<RulePanelData | undefined, boolean>(RulePanel, { data, width: 'md' }).closed,
    );
  }

  private async openFloor(data: FloorPanelData): Promise<void> {
    await this.reloadIfChanged(
      this.panels.open<FloorPanelData | undefined, boolean>(FloorPanel, { data, width: 'md' })
        .closed,
    );
  }

  /**
   * Recharger depuis le **serveur** plutôt que de recoudre l'état localement.
   * Poser une règle peut en supplanter une autre trois lignes plus bas : le seul
   * endroit qui sait ce que l'écran est devenu est celui qui a résolu les prix.
   */
  private async reloadIfChanged(closed: Promise<boolean | undefined>): Promise<void> {
    if ((await closed) === true) {
      await this.load();
    }
  }

  /**
   * Le ratio iso-chiffre, en clair : « ×1,25 ».
   *
   * `null` quand il n'a pas de valeur finie — un article offert n'atteint le
   * chiffre d'origine à aucun volume, et « ×∞ » n'aide personne.
   */
  protected ratioLabel(elasticity: ItemElasticityView): string | null {
    const ratio = elasticity.isoRevenueRatioBp;
    return ratio === null ? null : `×${(ratio / 10_000).toFixed(2).replace('.', ',')}`;
  }

  /** Où en est le réalisé vis-à-vis de l'objectif, en pourcent entier. */
  protected attainmentLabel(comparison: ElasticityComparison): string | null {
    return comparison.attainmentBp === null
      ? null
      : `${String(Math.round(comparison.attainmentBp / 100))} %`;
  }

  /** L'objectif est-il tenu ? Sert à colorer, jamais à cacher le chiffre. */
  protected isOnTrack(comparison: ElasticityComparison): boolean {
    return comparison.attainmentBp !== null && comparison.attainmentBp >= 10_000;
  }

  /**
   * La marge négociable, dans les DEUX unités.
   *
   * Le commercial choisit laquelle il annonce dans son appel : ni l'une ni
   * l'autre n'est un sous-titre, et l'écran les met au même poids.
   */
  protected roomEuros(room: NegotiationRoom): string {
    return formatEuros(room.maxDiscountCents);
  }

  protected roomPercent(room: NegotiationRoom): string {
    return `${(room.maxDiscountBp / 100).toFixed(1).replace('.', ',')} %`;
  }

  /** La portée d'un nœud, pour l'attribut de test — utile aux specs. */
  protected scopeKey(scope: PriceScopePayload): string {
    return `${scope.type}:${scope.id ?? ''}`;
  }
}

/** La grandeur d'une altération, avec son unité. */
function magnitude(rule: PriceRuleView): string {
  if (rule.effect.nature === 'replace') {
    return formatEuros(rule.effect.amountCents);
  }
  return rule.effect.mode === 'percent'
    ? `${String(rule.effect.value / 100)} %`
    : formatEuros(rule.effect.value);
}
