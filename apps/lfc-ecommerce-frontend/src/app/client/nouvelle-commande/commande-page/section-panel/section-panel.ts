import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/**
 * Le registre d'une section : le PUITS creuse dans la feuille, la BANDE se pose
 * dessus. Le puits porte le sujet de l'écran, la bande ce qui l'accompagne.
 */
export type SectionTone = 'well' | 'band';

/**
 * Un panneau de section : un aplat coloré, un en-tête, et les offres dedans.
 *
 * Le fond n'est pas une décoration : il dit à quoi appartiennent les cartes
 * qu'il contient. Deux offres posées à nu sur la feuille se liraient comme deux
 * choix indépendants ; dans le puits, elles se lisent comme les deux réponses à
 * la seule question de l'en-tête.
 */
@Component({
  selector: 'app-section-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[attr.data-tone]': 'tone()' },
  templateUrl: './section-panel.html',
  styleUrl: './section-panel.scss',
})
export class SectionPanel {
  readonly tone = input.required<SectionTone>();

  /** Le signe dans la tuile — `+` pour ce qui s'ouvre, `★` pour ce qui passe. */
  readonly sign = input.required<string>();

  readonly title = input.required<string>();

  /** La question que l'en-tête pose, quand il en pose une. */
  readonly sub = input<string | null>(null);
}
