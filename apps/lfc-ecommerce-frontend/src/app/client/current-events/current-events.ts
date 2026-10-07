import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

import { EventBanner } from '../event-banner/event-banner';
import { EventCard } from '../event-card/event-card';
import { type DatedEvent } from '../mock-event';

/**
 * **EN CE MOMENT** — le panneau des opérations datées de l'accueil public.
 *
 * Sorti de `accueil-public` le 2026-10-07 : sa feuille pesait 9,97 kB compilés
 * pour un budget qui est une ERREUR à 10 kB en configuration `cloudflare`, et
 * le moindre style ajouté cassait le déploiement de la boutique (audit
 * livraisons, § 3.3). Le rendu ne change pas ; les règles partagées avec
 * l'accueil (voix, jetons) sont recopiées ici, où elles ne pèsent que pour ce
 * panneau.
 *
 * L'or est réservé à ce bloc, et c'est le panneau qui le porte. L'hôte décide
 * s'il existe : hors période, il n'est pas rendu.
 */
@Component({
  selector: 'app-current-events',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [EventBanner, EventCard],
  templateUrl: './current-events.html',
  styleUrl: './current-events.scss',
})
export class CurrentEvents {
  readonly event = input.required<DatedEvent>();
  readonly heading = input.required<string>();
  readonly lead = input.required<string>();
  readonly cta = input.required<string>();

  /** « Voir la boutique » depuis la carte. */
  readonly opened = output();
}
