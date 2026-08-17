import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { FoldButtonComponent } from 'fold-ng';

/**
 * **Le bandeau de synthèse** — les trois questions qu'on se pose en arrivant :
 * combien d'articles, combien portent une décision, et qu'est-ce qui cloche.
 *
 * Les deux tuiles d'alerte ne s'allument **que** si elles ont quelque chose à
 * dire. Un tableau de bord dont tous les chiffres crient n'en dit aucun — et
 * celui-ci se relit chaque matin.
 *
 * La tuile allumée porte une **barre** en plus de sa couleur : une couleur seule
 * ne se lit ni en daltonien, ni imprimée, ni en contraste forcé.
 */
@Component({
  selector: 'app-tarification-summary',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldButtonComponent],
  templateUrl: './summary-bar.html',
  styleUrl: './summary-bar.scss',
})
export class TarificationSummaryBar {
  /** Le dénominateur : sans lui, « 12 altérés » ne veut rien dire. */
  readonly itemCount = input.required<number>();
  readonly alteredCount = input.required<number>();
  /** Un prix relevé est une règle qui n'a pas produit son effet. */
  readonly flooredCount = input.required<number>();
  /** Des intentions qui ont vieilli — comptées par portée, pas par article. */
  readonly staleFloorCount = input.required<number>();

  readonly archivesRequested = output<void>();
}
