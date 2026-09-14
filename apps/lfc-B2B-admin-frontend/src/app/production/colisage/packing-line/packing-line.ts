import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { FoldCheckboxComponent } from 'fold-ng';

import type { PackingLine as PackingLineView } from '@lfd/contracts';

import { AwaitingBadge } from '../awaiting-badge/awaiting-badge';

/**
 * **Une ligne de commande au colisage** — case, quantité, produit, initiales.
 *
 * Sœur de `app-worksheet-line`, et séparée d'elle parce qu'elle ne répond pas à
 * la même question : la fiche d'atelier coche un article tous clients
 * confondus, ici on coche la ligne d'UN bon. Elles ne portent ni le même type,
 * ni les mêmes raisons de refuser la coche.
 *
 * 🔴 **Deux raisons de ne rien pouvoir cocher, et elles ne se disent pas
 * pareil.** Une commande déclarée prête ne revient pas dessus ; une ligne dont
 * l'article n'est pas sorti du four redeviendra cochable dès que le four
 * l'aura sorti — d'où un badge qui dit l'attente, et non l'erreur.
 *
 * Sa classe `co-line` est posée sur l'hôte : la page l'atteint depuis ses
 * propres règles (le retrait pendant une recherche, le soulèvement de ce qui
 * est trouvé) sans rien savoir de l'intérieur de la ligne.
 */
@Component({
  selector: 'app-packing-line',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [AwaitingBadge, FoldCheckboxComponent],
  templateUrl: './packing-line.html',
  styleUrl: './packing-line.scss',
  host: {
    class: 'co-line',
    '[class.is-packed]': 'line().packed',
    '[class.is-awaiting]': 'line().awaitingProduction',
    '[class.is-hit]': 'hit()',
  },
})
export class PackingLine {
  readonly line = input.required<PackingLineView>();

  /** La commande est déclarée prête : plus rien ne bouge, et pour toujours. */
  readonly locked = input(false);

  /** La recherche désigne cet article — une SÉLECTION, pas un état. */
  readonly hit = input(false);

  /** L'état demandé par la personne. Le parent écrit d'abord, envoie ensuite. */
  readonly toggled = output<boolean>();

  /** Figée par la déclaration, ou par un four qui n'a pas encore sorti l'article. */
  protected readonly frozen = computed(() => this.locked() || this.line().awaitingProduction);

  /**
   * Le nom accessible de la case. Sans lui, la case s'annonce « case à cocher »
   * et rien d'autre — huit fois de suite, elles sont indiscernables.
   */
  protected readonly boxLabel = computed(
    () => `${this.line().quantity} ${this.line().productName}`,
  );
}
