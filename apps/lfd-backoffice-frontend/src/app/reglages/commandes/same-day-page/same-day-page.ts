import { ChangeDetectionStrategy, Component } from '@angular/core';
import { FoldPageLayoutComponent } from 'fold-ng';

import { SameDayCircuitCard } from '../same-day-circuit-card/same-day-circuit-card';

/**
 * **Jour même** — Réglages › Commandes (Hugo, 2026-10-21 —
 * `documentation/limites-de-commande/plan-une-seule-heure.md` §6).
 *
 * La page ne porte plus que les réglages du circuit du jour J
 * (`SameDayCircuitCard`, lot L3 de
 * `documentation/limites-de-commande/plan-jour-meme-sur-stock.md`).
 * L'interrupteur unique `same_day_allowed` qu'elle montrait n'est plus lu par
 * aucune décision depuis le lot L4 : il est retiré de l'écran au lot L6
 * (2026-11-02), la colonne reste en base.
 */
@Component({
  selector: 'app-same-day-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldPageLayoutComponent, SameDayCircuitCard],
  templateUrl: './same-day-page.html',
})
export class SameDayPage {}
