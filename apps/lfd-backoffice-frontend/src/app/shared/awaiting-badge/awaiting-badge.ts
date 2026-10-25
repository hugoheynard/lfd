import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { FoldIconComponent } from 'fold-ng';

/**
 * **« Att. prod »** (« en attente de la prod », raccourci par Hugo le 2026-10-25) — l'article n'est pas encore sorti du four.
 *
 * 🔴 **Ce n'est pas une anomalie.** En début de fournée, la moitié de l'écran
 * est dans cet état : le badge dit donc l'ATTENTE, pas l'erreur — un
 * avertissement posé, jamais l'alerte, qui est réservée au manque. Ce qui
 * l'entoure reste pleinement lisible : on le lit pour savoir quoi sortir du
 * four.
 *
 * **Un composant pour deux colonnes**, la ligne d'une commande et la
 * marchandise à répartir, parce que c'est le même FAIT. Deux dessins auraient
 * demandé de l'apprendre deux fois, et auraient divergé au premier réglage.
 *
 * **Le compte, facultatif** (Hugo, 2026-10-25) : avec `waiting` et `total`,
 * « Att. prod 2/5 » — les lignes encore au four sur les lignes de la commande,
 * comme la Supervision le dit d'une carte. Sans, « Att. prod » seul : une
 * ligne du colisage n'a rien à compter. L'horloge se retire par `icon`.
 *
 * Sa classe `co-awaiting` est posée sur l'hôte : l'écran la lit depuis ses deux
 * colonnes sans avoir à connaître l'intérieur du badge.
 */
@Component({
  selector: 'app-awaiting-badge',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldIconComponent],
  templateUrl: './awaiting-badge.html',
  styleUrl: './awaiting-badge.scss',
  host: { class: 'co-awaiting' },
})
export class AwaitingBadge {
  /** L'horloge devant le libellé ; vraie par défaut, comme au colisage. */
  readonly icon = input(true);
  /** Les lignes encore au four ; ne s'affiche qu'avec `total`. */
  readonly waiting = input<number | null>(null);
  /** Les lignes de la commande. */
  readonly total = input<number | null>(null);

  protected readonly label = computed(() => {
    const waiting = this.waiting();
    const total = this.total();
    return waiting === null || total === null
      ? 'Att. prod'
      : `Att. prod ${String(waiting)}/${String(total)}`;
  });
}
