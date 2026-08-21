import { ChangeDetectionStrategy, Component } from '@angular/core';

/**
 * Schéma « flux des collections » — taux de TVA + catégorie → produit
 * (héritage / override) → fiches → les trois familles de collections. Couleurs
 * par tokens (thème-aware).
 */
@Component({
  selector: 'app-flow-diagram',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './flow-diagram.html',
  styleUrl: './flow-diagram.scss',
})
export class FlowDiagram {}
