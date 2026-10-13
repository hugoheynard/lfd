import { ChangeDetectionStrategy, Component } from '@angular/core';
import { FoldPageLayoutComponent } from 'fold-ng';

import { MarketCard } from '../market-card/market-card';

/**
 * La définition des marchés : zones et codes NAF visés, avec leur comptage.
 *
 * Réglages › Commercial depuis le 2026-10-13 (Hugo) — venue de la section
 * « Réglages » de l'espace Commercial. La coquille des Réglages ne dessine
 * rien : la page porte donc son `fold-page-layout`, et son titre, son icône et
 * sa description ne s'affichent qu'une fois.
 */
@Component({
  selector: 'app-marches-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MarketCard, FoldPageLayoutComponent],
  templateUrl: './marches-page.html',
})
export class MarchesPage {}
