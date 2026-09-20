import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';

import { type DatedEvent } from '../../mock-event';

/**
 * L'OPÉRATION DATÉE, en tête de l'accueil.
 *
 * Elle passe avant le reste parce qu'elle a une fin : une collection de Pâques
 * ne se rattrape pas la semaine suivante. Le compte à rebours n'est pas un
 * ornement, c'est l'information.
 *
 * Deux gabarits, et ce n'est pas la même carte dépliée. En pile, la photo est
 * un fond de 132 px sur lequel le texte descend, voilé du haut vers le bas. Au
 * bureau, elle devient une bande de 152 px voilée LATÉRALEMENT : le texte tient
 * sur une ligne à gauche, la photo reste lisible à droite, et l'action se range
 * au bout. Un voile vertical y aurait assombri une image qu'on a la place de
 * montrer.
 */
@Component({
  selector: 'app-event-banner',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink],
  host: { '[style.--event-photo]': '"url(" + event().image + ")"' },
  templateUrl: './event-banner.html',
  styleUrl: './event-banner.scss',
})
export class EventBanner {
  readonly event = input.required<DatedEvent>();

  /** Le libellé de l'action — il vient de la copie, pas de l'opération. */
  readonly cta = input.required<string>();
}
