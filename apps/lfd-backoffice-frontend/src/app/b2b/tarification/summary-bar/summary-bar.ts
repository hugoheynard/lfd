import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/**
 * **La ligne de synthèse** — les trois questions qu'on se pose en arrivant :
 * combien d'articles, combien portent une décision, et qu'est-ce qui cloche.
 *
 * Une ligne et non des tuiles : cinq faits du même ordre se lisent d'un balayage
 * quand ils partagent une ligne de base, alors qu'en cartes chacun réclame son
 * cadre et l'œil se met à les compter.
 *
 * Les deux compteurs d'alerte ne prennent leur teinte **que** s'ils ont quelque
 * chose à dire. Un tableau de bord dont tous les chiffres crient n'en dit aucun —
 * et celui-ci se relit chaque matin. Le chiffre reste **écrit** dans tous les
 * cas : la couleur accélère la lecture, elle ne la porte pas.
 */
@Component({
  selector: 'app-tarification-summary',
  changeDetection: ChangeDetectionStrategy.OnPush,
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
  /**
   * Des prix que la chaîne a poussés **sous zéro**, ramenés à zéro.
   *
   * La tuile la plus grave de l'écran : ce n'est pas une intention qui vieillit,
   * c'est une règle qui donne la marchandise. Le cas arrive dès qu'une baisse en
   * euros dépasse le prix d'un article — « −5 € » sur un croissant à 2 € — et il
   * ne peut pas se refuser à la saisie, puisqu'il dépend de l'article.
   */
  readonly clampedCount = input.required<number>();
}
