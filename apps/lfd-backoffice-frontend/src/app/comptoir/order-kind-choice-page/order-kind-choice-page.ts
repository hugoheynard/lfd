import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { Router } from '@angular/router';
import {
  FoldBackLinkComponent,
  FoldCardComponent,
  FoldElementTitleComponent,
  FoldPageLayoutComponent,
} from 'fold-ng';

import {
  returnLabelOf,
  returnTargetOf,
} from '../../commandes/nouvelle-commande/order-entry-return';

/** Les deux saisies du comptoir, et l'adresse de chacune. */
export const PRO_ORDER_LINK = '/nouvelle-commande/pro';
export const PARTICULAR_ORDER_LINK = '/nouvelle-commande/particulier';

/**
 * **Nouvelle commande** — le choix entre la saisie pro et la saisie
 * particulier (`commande-particulier-reglee-en-boutique.md`, § 2).
 *
 * Deux cartes, deux écrans, deux routes d'API : les deux saisies ne se
 * mélangent pas. Page à part, elle retient d'où l'on vient (`order-entry-return.ts`). Chaque carte est un contrôle unique, d'où `interactive`.
 */
@Component({
  selector: 'app-order-kind-choice-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldBackLinkComponent,
    FoldCardComponent,
    FoldElementTitleComponent,
    FoldPageLayoutComponent,
  ],
  templateUrl: './order-kind-choice-page.html',
  styleUrl: './order-kind-choice-page.scss',
})
export class OrderKindChoicePage {
  private readonly router = inject(Router);
  /** D'où l'on vient (`?retour=`) : le lien de retour y mène. */
  readonly retour = input<string>();
  protected readonly target = computed(() => returnTargetOf(this.retour()));
  protected readonly backLabel = computed(() => returnLabelOf(this.target()));

  protected go(link: string): void {
    // L'origine et le point suivent l'étape suivante.
    void this.router.navigate([link], { queryParamsHandling: 'preserve' });
  }

  protected readonly pro = PRO_ORDER_LINK;
  protected readonly particular = PARTICULAR_ORDER_LINK;
}
