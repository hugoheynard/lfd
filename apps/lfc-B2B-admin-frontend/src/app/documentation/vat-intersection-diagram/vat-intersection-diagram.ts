import { ChangeDetectionStrategy, Component } from '@angular/core';

/**
 * Schéma « le taux vit à l'intersection » — une carte de capacité ne PORTE pas
 * de taux. C'est le couple (article, carte) qui en porte un : le croissant est
 * à 5,5 % à emporter et à 10 % sur place, et c'est la même carte « sur place »
 * pour tous les articles.
 *
 * Le schéma existe parce que le premier jet mettait « TVA 10 % » au-dessus de
 * la carte, avec une flèche — on y lisait « la carte est à 10 % », ce qui est
 * faux et changerait tout le modèle.
 *
 * Purement présentationnel ; couleurs par tokens (thème-aware).
 */
@Component({
  selector: 'app-vat-intersection-diagram',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './vat-intersection-diagram.html',
  styleUrl: './vat-intersection-diagram.scss',
})
export class VatIntersectionDiagram {}
