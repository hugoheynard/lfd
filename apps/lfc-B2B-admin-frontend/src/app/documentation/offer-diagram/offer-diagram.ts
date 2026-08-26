import { ChangeDetectionStrategy, Component } from '@angular/core';

/**
 * Schéma « l'offre » — quel point de vente propose quelles cartes, et ce que la
 * famille peut cocher ensuite. Les deux étages se lisent l'un sous l'autre :
 * l'offre BORNE la matrice, elle ne la remplit pas.
 *
 * Purement présentationnel ; couleurs par tokens (thème-aware).
 */
@Component({
  selector: 'app-offer-diagram',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './offer-diagram.html',
  styleUrl: './offer-diagram.scss',
})
export class OfferDiagram {}
