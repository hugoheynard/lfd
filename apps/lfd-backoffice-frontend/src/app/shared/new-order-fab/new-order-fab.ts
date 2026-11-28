import { ChangeDetectionStrategy, Component, inject, input, signal } from '@angular/core';
import { Router } from '@angular/router';
import { FoldIconComponent } from 'fold-ng';

import {
  PARTICULAR_ORDER_LINK,
  PRO_ORDER_LINK,
} from '../../comptoir/order-kind-choice-page/order-kind-choice-page';
import { orderEntryParams } from '../../commandes/nouvelle-commande/order-entry-return';

/**
 * **« Nouvelle commande » au téléphone** (Hugo, 2026-11-28) : un bouton rond
 * en bas à droite, sous le pouce. Touché, il devient une croix et fait
 * monter les deux cas au-dessus de lui — Pro, Particulier — sur un voile qui
 * les referme. Le même choix que le dialogue de la saisie, sans dialogue :
 * chaque cas ouvre la saisie en notant l'origine (et le point du comptoir).
 */
@Component({
  selector: 'app-new-order-fab',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldIconComponent],
  templateUrl: './new-order-fab.html',
  styleUrl: './new-order-fab.scss',
})
export class NewOrderFab {
  /** L'écran où « Terminer » ramène. */
  readonly origin = input.required<string>();
  /** Le point de retrait ouvert, pour le « Retrait immédiat » ; `null` ailleurs. */
  readonly point = input<string | null>(null);

  private readonly router = inject(Router);

  protected readonly open = signal(false);
  protected readonly pro = PRO_ORDER_LINK;
  protected readonly particular = PARTICULAR_ORDER_LINK;

  protected toggle(): void {
    this.open.update((open) => !open);
  }

  protected go(link: string): void {
    this.open.set(false);
    void this.router.navigate([link], {
      queryParams: orderEntryParams(this.origin(), this.point()),
    });
  }
}
