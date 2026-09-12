import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { PortfolioMetricsView } from '@lfd/contracts';

import { Chart, type ChartOption } from '../../../shared/chart/chart';
import { dayLabel, type TomorrowOrders } from './tomorrow-orders';

/** Une mesure de croissance : un chiffre, ce qu'il compte. */
export interface CockpitKpi {
  readonly label: string;
  readonly value: string;
}

/**
 * **La bande de tête du tableau de bord commercial** — ce qu'on vient chercher
 * en arrivant, avant d'avoir décidé quoi que ce soit.
 *
 * Deux questions d'exploitation d'abord, une de pilotage ensuite :
 *
 * - **combien de clients servons-nous** — le parc, et ce qui y est entré ce
 *   mois-ci. Elle mène aux comptes : c'est le seul chiffre de la bande dont on
 *   veut voir le détail ligne à ligne ;
 * - **combien de commandes pour demain** — la règle de la maison est J pour J+1,
 *   donc ce compte dit *ce qui se passe*, pendant qu'on peut encore agir. Il
 *   mène au prévisionnel, où il se décompose par produit ;
 * - **la croissance**, en quatre mesures et une courbe, qui mène à l'analyse.
 *
 * Trois cartes **détachées**, et chacune porte son lien en bas plutôt que d'être
 * cliquable en entier : un support qui réagit au survol n'annonce aucune
 * destination, et le lecteur ne savait pas où il atterrirait.
 *
 * Elle vit dans le **bandeau de la coquille** (`providePageHeader`) et non sur
 * le papier : c'est le verdict de l'écran, au même endroit et sur le même
 * support que l'état du portefeuille sur les Comptes clients.
 */
@Component({
  selector: 'app-cockpit-bar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Chart, RouterLink],
  templateUrl: './cockpit-bar.html',
  styleUrl: './cockpit-bar.scss',
})
export class CockpitBar {
  /** L'état du parc — `null` tant qu'on ne sait pas, et si la lecture échoue. */
  readonly portfolio = input.required<PortfolioMetricsView | null>();
  /** Ce qui est rentré pour J+1 — `null` si le prévisionnel n'a pas répondu. */
  readonly tomorrow = input.required<TomorrowOrders | null>();
  readonly kpis = input.required<readonly CockpitKpi[]>();
  readonly spark = input.required<ChartOption | null>();

  /** `mardi 16 septembre` — pour quel jour ce compte vaut. */
  protected readonly tomorrowLabel = computed<string>(() => {
    const day = this.tomorrow();
    return day === null ? '' : dayLabel(day.date);
  });
}
