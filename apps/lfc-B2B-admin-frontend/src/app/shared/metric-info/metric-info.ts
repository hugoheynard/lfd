import { ChangeDetectionStrategy, Component, input, signal } from '@angular/core';

/**
 * **Bulle d'aide** d'une métrique — le petit « i » en haut à droite d'une carte de
 * dashboard. Au survol / focus / clic, révèle une bulle décrivant ce que la
 * visualisation mesure. Purement présentational, sans dépendance : positionné en
 * absolu par rapport à son hôte (à placer dans un conteneur `position: relative`).
 */
@Component({
  selector: 'app-metric-info',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './metric-info.html',
  styleUrl: './metric-info.scss',
})
export class MetricInfo {
  /** Texte descriptif affiché dans la bulle. */
  readonly text = input.required<string>();
  /** Libellé accessible du déclencheur (nommé pour les lecteurs d'écran). */
  readonly label = input('Aide sur la métrique');

  protected readonly open = signal(false);

  protected toggle(): void {
    this.open.set(!this.open());
  }
}
