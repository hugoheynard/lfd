import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/**
 * Le contenu du bandeau : ce que l'écran dit, sur le registre sombre.
 *
 * Extrait au SECOND usage. L'accueil et la nouvelle commande veulent la même
 * chose — un titre, une ligne, parfois une action — et la même typographie sur
 * la descente. Deux copies auraient dérivé au premier ajustement.
 *
 * L'écran garde son balisage pour l'ACTION : ce qui varie d'un écran à l'autre,
 * c'est ce qu'on y met (une carte, un lien, rien), pas la façon de l'écrire.
 *
 * La règle de composition tient en une ligne de CSS : **sans action, le texte
 * se centre**. Un titre seul aligné à gauche laisse une moitié de bandeau vide
 * qui ne dit rien ; avec une action, la lecture se fait d'un bord à l'autre —
 * le titre à gauche, ce qu'on peut faire à droite.
 */
@Component({
  selector: 'app-client-banner-block',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './client-banner-block.html',
  styleUrl: './client-banner-block.scss',
})
export class ClientBannerBlock {
  /**
   * Le sur-titre, en capitales — de quel chemin cet écran est l'étape.
   *
   * Il double celui de la barre, et c'est voulu : la barre est du chrome qu'on
   * ne regarde pas, le bandeau est le début de la page. Vide, il ne prend pas
   * de place.
   */
  readonly kicker = input('');

  /** Le titre. Un retour à la ligne y est rendu tel quel. */
  readonly title = input.required<string>();

  /** La ligne sous le titre. Vide, elle ne prend pas de place. */
  readonly lead = input('');
}
