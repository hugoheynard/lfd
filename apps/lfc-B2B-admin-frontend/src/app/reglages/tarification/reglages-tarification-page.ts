import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import type {
  NegotiationRoom,
  PriceFloorView,
  PriceRuleView,
  PriceScopePayload,
  PricingBoardView,
  PricingCategoryView,
  PricingItemView,
} from '@lfd/contracts';
import { formatEuros } from '@lfd/catalog-ui';

import { deltaLabel, isDiscount, roomEuros, roomPercent, ruleSentence } from './pricing-format';
import {
  FoldBadgeComponent,
  FoldButtonComponent,
  FoldEmptyStateComponent,
  FoldPanelHostService,
} from 'fold-ng';

import { ArchivePanel, type ArchivePanelData } from './archive-panel/archive-panel';
import { ArchivesPanel } from './archives-panel/archives-panel';
import { FloorPanel, type FloorPanelData } from './floor-panel/floor-panel';
import { GridSkeleton } from './grid-skeleton/grid-skeleton';
import { RuleChip } from './rule-chip/rule-chip';
import { TarificationSummaryBar } from './summary-bar/summary-bar';
import { VolumeEffort } from './volume-effort/volume-effort';
import { JournalPanel, type JournalPanelData } from './journal-panel/journal-panel';
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
    FoldEmptyStateComponent,
    GridSkeleton,
    RuleChip,
    TarificationSummaryBar,
    VolumeEffort,
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

  // La mise en forme vit à côté, en fonctions pures : le composant expose, il ne
  // calcule pas.
  protected readonly deltaLabel = deltaLabel;
  protected readonly isDiscount = isDiscount;

  /** Les deux unités de la marge, prises sur la vue plutôt que sur deux nombres. */
  protected roomEuros(room: NegotiationRoom): string {
    return roomEuros(room.maxDiscountCents);
  }

  protected roomPercent(room: NegotiationRoom): string {
    return roomPercent(room.maxDiscountBp);
  }

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

  /** Le dénominateur : sans lui, « 12 altérés » ne veut rien dire. */
  protected readonly itemCount = computed(
    () => this.categories().flatMap((category) => category.items).length,
  );

  /**
   * Combien de limites ont **vieilli** — le tarif a bougé sous elles.
   *
   * Compté par PORTÉE et non par article : une limite de famille qui a dérivé
   * est UNE décision à revoir, pas quarante. Compter les articles ferait passer
   * une seule intention datée pour une avalanche.
   */
  protected readonly staleFloorCount = computed(() => {
    const scopes = new Set<string>();
    for (const category of this.categories()) {
      for (const item of category.items) {
        const floor = item.effectiveFloor;
        if (floor?.drift?.stale === true) {
          scopes.add(floor.id);
        }
      }
    }
    return scopes.size;
  });

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

  /**
   * **Suspendre ou reprendre** — un seul bouton, parce que c'est un seul geste
   * vu de l'utilisateur : arrêter ce qui tourne, rallumer ce qui est arrêté.
   */
  protected async toggleRule(rule: PriceRuleView): Promise<void> {
    if (rule.status === 'paused') {
      await this.tarification.resumeRule(rule.id);
    } else {
      await this.tarification.pauseRule(rule.id, null);
    }
    await this.load();
  }

  /**
   * **Retirer** ouvre le panneau d'archivage, qui demande pourquoi.
   *
   * Un panneau plutôt qu'une confirmation en ligne : « êtes-vous sûr ? » ne
   * demande rien, alors que la seule question utile six mois plus tard est le
   * motif. Le mot ne change pas pour autant — « retirer » dit bien ce que le
   * staff veut faire ; ce qui a changé est dessous, plus rien ne s'efface.
   */
  protected async removeRule(rule: PriceRuleView): Promise<void> {
    await this.openArchive({
      subject: { kind: 'rule', id: rule.id },
      target: rule.label,
      summary: `${ruleSentence(rule)} — ${rule.label}`,
    });
  }

  /**
   * **Les archives** — ce qui a été retiré du tableau.
   *
   * Une liste à part plutôt que des lignes grisées dans la grille : ranger sert
   * à ne plus voir, et l'écran qui répond à « quel est le prix ? » doit rester
   * le plus net de tous. Encore faut-il pouvoir retrouver.
   */
  protected async openArchives(): Promise<void> {
    await this.panels.open<boolean>(ArchivesPanel, { width: 'md' }).closed;
  }

  /** **Le journal d'une règle** : qui l'a posée, qui l'a suspendue, quand. */
  protected async openRuleJournal(rule: PriceRuleView): Promise<void> {
    await this.openJournal({ subjectType: 'rule', subjectId: rule.id, target: rule.label });
  }

  private async openJournal(data: JournalPanelData): Promise<void> {
    await this.panels.open<JournalPanelData, boolean>(JournalPanel, { data, width: 'md' }).closed;
  }

  private async openArchive(data: ArchivePanelData): Promise<void> {
    await this.reloadIfChanged(
      this.panels.open<ArchivePanelData, boolean>(ArchivePanel, { data, width: 'md' }).closed,
    );
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

  protected scopeKey(scope: PriceScopePayload): string {
    return `${scope.type}:${scope.id ?? ''}`;
  }
}

/** La grandeur d'une altération, avec son unité. */
