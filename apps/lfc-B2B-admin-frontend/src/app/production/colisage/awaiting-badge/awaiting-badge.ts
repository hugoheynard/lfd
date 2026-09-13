import { ChangeDetectionStrategy, Component } from '@angular/core';
import { FoldIconComponent } from 'fold-ng';

/**
 * **« En attente de la prod »** — l'article n'est pas encore sorti du four.
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
export class AwaitingBadge {}
