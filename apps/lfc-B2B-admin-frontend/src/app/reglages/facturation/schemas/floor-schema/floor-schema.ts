import { ChangeDetectionStrategy, Component } from '@angular/core';

/**
 * **Le mur et la porte** — la limite à deux étages.
 *
 * Dessiné en VERTICAL, contrairement au pipeline : ici il n'est plus question
 * d'ordre mais de hauteur. Un prix descend, et deux lignes l'arrêtent — l'une
 * toujours, l'autre seulement si le volume a payé le droit de passer.
 */
@Component({
  selector: 'app-floor-schema',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './floor-schema.html',
  styleUrl: './floor-schema.scss',
})
export class FloorSchema {}
