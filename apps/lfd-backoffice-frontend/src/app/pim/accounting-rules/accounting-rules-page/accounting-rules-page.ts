import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';

import { FoldCalloutComponent, FoldPageLayoutComponent } from 'fold-ng';

/**
 * **Règles comptables** — un écran qui n'a plus de règle à régler.
 *
 * Sa seule règle, le rapport prix pro / prix public, est retirée le
 * 2026-10-27 (lot R3 de `documentation/pricing/plan-retirer-le-rapport-pro.md`) :
 * le prix pro HT se saisit sur chaque déclinaison, et c'est sa seule source.
 * Méthode, rapport, simulateur et « Passer au prix saisi » sont partis avec
 * lui, et le serveur ne sert plus `/pim/accounting-rules`.
 *
 * L'écran reste, et dit où le prix pro se règle désormais : un lien du rail
 * qui mènerait à une page blanche ferait croire à une panne. Le retirer — page,
 * route et entrée du rail — est une décision à prendre, pas un nettoyage.
 */
@Component({
  selector: 'app-accounting-rules-page',
  imports: [FoldPageLayoutComponent, FoldCalloutComponent, RouterLink],
  templateUrl: './accounting-rules-page.html',
  styleUrl: './accounting-rules-page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AccountingRulesPage {}
