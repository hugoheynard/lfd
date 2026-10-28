import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { FoldBackLinkComponent } from 'fold-ng';

import { BakehouseResupplyCard } from '../bakehouse-resupply-card/bakehouse-resupply-card';

/** L'onglet de la liste, où l'on revient après un envoi. */
const LIST = '/prod-manager/reassorts';

/**
 * **Composer un réassort du fournil** — sa propre page (Hugo, 2026-10-28 :
 * « en arrivant sur la page réassort, juste la liste des réassorts demandés et
 * un bouton créer un réassort »). `…/nouveau` part d'une carte vide ;
 * `…/brouillon/:draftId` reprend un brouillon. Envoyer ramène à la liste.
 */
@Component({
  selector: 'app-bakehouse-resupply-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [BakehouseResupplyCard, FoldBackLinkComponent, RouterLink],
  templateUrl: './bakehouse-resupply-page.html',
  styleUrl: './bakehouse-resupply-page.scss',
})
export class BakehouseResupplyPage {
  private readonly router = inject(Router);

  /** Le paramètre de route `:draftId` (liaison des entrées par le routeur). */
  readonly draftId = input<string | undefined>(undefined);

  protected readonly list = LIST;

  protected back(): void {
    void this.router.navigateByUrl(LIST);
  }
}
