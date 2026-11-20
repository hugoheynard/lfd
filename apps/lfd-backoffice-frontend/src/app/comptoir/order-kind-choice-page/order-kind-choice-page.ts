import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { FoldCardComponent, FoldElementTitleComponent, FoldPageLayoutComponent } from 'fold-ng';

/** Les deux saisies du comptoir, et l'adresse de chacune. */
export const PRO_ORDER_LINK = '/comptoir/nouvelle-commande/pro';
export const PARTICULAR_ORDER_LINK = '/comptoir/nouvelle-commande/particulier';

/**
 * **Nouvelle commande** — le choix entre la saisie pro et la saisie
 * particulier (`plan-commande-particulier-reglee-en-boutique.md`, § 2).
 *
 * Deux cartes, deux écrans, deux routes d'API : les deux saisies ne se
 * mélangent pas. Chaque carte est un contrôle unique, d'où `interactive`.
 */
@Component({
  selector: 'app-order-kind-choice-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldCardComponent, FoldElementTitleComponent, FoldPageLayoutComponent],
  templateUrl: './order-kind-choice-page.html',
  styleUrl: './order-kind-choice-page.scss',
})
export class OrderKindChoicePage {
  private readonly router = inject(Router);

  protected go(link: string): void {
    void this.router.navigateByUrl(link);
  }

  protected readonly pro = PRO_ORDER_LINK;
  protected readonly particular = PARTICULAR_ORDER_LINK;
}
