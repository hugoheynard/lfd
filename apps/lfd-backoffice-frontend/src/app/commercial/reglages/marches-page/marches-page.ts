import { ChangeDetectionStrategy, Component } from '@angular/core';

import { MarketCard } from '../../../reglages/commercial/market-card/market-card';

/**
 * La définition des marchés : zones et codes NAF visés, avec leur comptage.
 *
 * Vue de l'espace Commercial, sous sa section « Réglages » (Hugo,
 * 2026-10-13) : l'en-tête — titre, icône, description — est celui de la
 * coquille `CommercialPage`, lu dans `COMMERCIAL_VIEWS`. La page ne pose donc
 * pas de `fold-page-layout` à elle : elle vit déjà dans celui de la coquille.
 */
@Component({
  selector: 'app-marches-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MarketCard],
  templateUrl: './marches-page.html',
})
export class MarchesPage {}
