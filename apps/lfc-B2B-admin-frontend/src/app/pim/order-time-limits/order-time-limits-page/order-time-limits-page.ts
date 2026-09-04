import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { readLocalized, SOURCE_LOCALE, type OrderTimeLimitView } from '@lfd/pim-contracts';
import {
  FoldBadgeComponent,
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldCardComponent,
  FoldEmptyStateComponent,
  FoldIconComponent,
  FoldLoadingStateComponent,
  FoldPageLayoutComponent,
  FoldPanelHostService,
} from 'fold-ng';

import { NotifyService } from '../../../notify.service';
import { CategoryStore } from '../../catalogue/category-store';
import { LimitPanel, type LimitPanelData } from '../limit-panel/limit-panel';
import { OrderTimeLimitsService } from '../order-time-limits.service';
import {
  byPrecision,
  daysPhrase,
  gracePhrase,
  scopeKind,
  scopeLabel,
  timePhrase,
} from '../limit-format';

type LoadState = 'loading' | 'ready' | 'error';

/**
 * **Limites de commande** — jusqu'à quand on prend commande, par portée du
 * catalogue.
 *
 * ## Pourquoi cet écran a sa propre entrée
 *
 * Le réglage a vécu sous « Réglages → Retraits & livraisons », entre les points
 * de retrait et les zones. Cette place-là n'était pas neutre : elle affirmait
 * que l'heure limite est une affaire d'acheminement, et tout le monde l'a lue
 * ainsi — y compris ceux qui écrivaient le code.
 *
 * Or un point de retrait n'est ni un lieu de production ni un lieu de
 * livraison : c'est l'endroit où un client vient chercher. Ce qui fait varier
 * une limite, c'est **ce qu'on produit**. L'emplacement d'un écran est une
 * affirmation sur le modèle ; celui-ci en fait une juste.
 *
 * ## L'héritage se lit du général au précis
 *
 * Les règles sont triées du plus général au plus précis, parce que l'écran
 * raconte un héritage et qu'un héritage se lit en partant de ce dont on hérite.
 * Chaque champ non renseigné affiche **Hérité** — pas un vide : un blanc se lit
 * « aucune limite », et c'est l'inverse.
 *
 * ## Ce que cet écran ne fait pas
 *
 * Il ne **pose** pas de limite sur un produit ni sur une déclinaison — il les
 * montre et permet de les retirer. Poser se fait depuis la fiche du produit :
 * c'est là qu'on regarde quand on se demande ce que CET article demande, et un
 * sélecteur de produit ici ferait chercher au mauvais endroit.
 */
@Component({
  selector: 'app-order-time-limits-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldPageLayoutComponent,
    FoldCardComponent,
    FoldBadgeComponent,
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldEmptyStateComponent,
    FoldIconComponent,
    FoldLoadingStateComponent,
  ],
  templateUrl: './order-time-limits-page.html',
  styleUrl: './order-time-limits-page.scss',
})
export class OrderTimeLimitsPage {
  private readonly api = inject(OrderTimeLimitsService);
  private readonly categoryStore = inject(CategoryStore);
  private readonly panelHost = inject(FoldPanelHostService);
  private readonly notify = inject(NotifyService);

  protected readonly state = signal<LoadState>('loading');
  protected readonly rules = signal<readonly OrderTimeLimitView[]>([]);
  protected readonly pendingRemoval = signal<string | null>(null);

  /** Les règles, du plus général au plus précis — l'ordre de l'héritage. */
  protected readonly ordered = computed(() => [...this.rules()].sort(byPrecision));

  /**
   * Vrai quand **aucune règle globale** n'existe alors que d'autres rangs se
   * prononcent.
   *
   * Ça se dit, parce que le résultat est contre-intuitif : sans global, une
   * famille qui ne pose qu'une heure n'a pas de délai, donc **aucune limite ne
   * s'applique** — l'échelle exige le jour ET l'heure. On croirait avoir réglé
   * quelque chose ; on n'a rien réglé.
   */
  protected readonly hasNoGlobal = computed(
    () => this.rules().length > 0 && !this.rules().some((rule) => rule.scope.type === 'global'),
  );

  /** Les familles proposables au panneau, nommées en français. */
  private readonly categoryChoices = computed(() =>
    this.categoryStore
      .items()
      .filter((category) => !category.isArchived)
      // Le français, et pas la langue lue : les libellés de ce panneau le sont
      // tous, et une famille en anglais au milieu de « Hériter du rang
      // supérieur » se lirait comme une erreur.
      .map((category) => ({ id: category.id, label: readLocalized(category.name, SOURCE_LOCALE) })),
  );

  constructor() {
    void this.load();
  }

  protected async load(): Promise<void> {
    this.state.set('loading');
    try {
      this.rules.set(await this.api.list());
      this.state.set('ready');
    } catch {
      this.state.set('error');
    }
  }

  protected add(): void {
    this.open({ rule: null, categories: this.categoryChoices() });
  }

  protected edit(rule: OrderTimeLimitView): void {
    this.open({ rule, categories: this.categoryChoices() });
  }

  protected askRemove(rule: OrderTimeLimitView): void {
    this.pendingRemoval.set(rule.id);
  }

  protected cancelRemove(): void {
    this.pendingRemoval.set(null);
  }

  protected async remove(rule: OrderTimeLimitView): Promise<void> {
    this.pendingRemoval.set(null);
    try {
      await this.api.remove(rule.id);
      this.notify.success('Limite retirée.');
      await this.load();
    } catch (error) {
      this.notify.error(error);
    }
  }

  protected scope(rule: OrderTimeLimitView): string {
    return scopeLabel(rule);
  }

  protected kind(rule: OrderTimeLimitView): string {
    return scopeKind(rule.scope.type);
  }

  protected days(rule: OrderTimeLimitView): string {
    return daysPhrase(rule.daysBefore);
  }

  protected time(rule: OrderTimeLimitView): string {
    return timePhrase(rule.time);
  }

  protected grace(rule: OrderTimeLimitView): string {
    return gracePhrase(rule.graceMinutes);
  }

  /** Poser se fait ici pour le global et les familles ; le reste vient des fiches. */
  protected editable(rule: OrderTimeLimitView): boolean {
    return rule.scope.type === 'global' || rule.scope.type === 'category';
  }

  private open(data: LimitPanelData): void {
    const ref = this.panelHost.open(LimitPanel, { data });
    void ref.closed.then((saved) => {
      if (saved === true) {
        void this.load();
      }
    });
  }
}
