import { ChangeDetectionStrategy, Component } from '@angular/core';

/**
 * **Qui porte le risque** — le schéma central de la page.
 *
 * Deux courbes sur une saison, et l'aire entre elles. À gauche du schéma, le
 * coût monte ; le prix vivant le suit, le prix bloqué ne bouge pas. L'aire
 * hachurée EST le risque, et elle change de propriétaire selon le chemin.
 *
 * C'est le seul endroit de la page où une aire vaut mieux qu'une phrase : « le
 * client assume la hausse » et « la maison l'absorbe » se lisent en une seconde
 * quand on voit de quel côté de la ligne se trouve la surface.
 */
@Component({
  selector: 'app-risk-schema',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './risk-schema.html',
  styleUrl: './risk-schema.scss',
})
export class RiskSchema {}
