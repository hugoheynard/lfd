import { ChangeDetectionStrategy, Component } from '@angular/core';

/**
 * Schéma « les deux sens » du webhook de la vitrine : on prévient, l'agence
 * relit. La branche d'échec est dessinée sous le chemin heureux parce que
 * c'est elle qu'un développeur d'agence ne devine pas — un 2xx tardif vaut un
 * échec, et dix échecs coupent tout.
 *
 * Purement présentationnel ; couleurs par tokens (thème-aware).
 */
@Component({
  selector: 'app-vitrine-sequence-diagram',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './vitrine-sequence-diagram.html',
  styleUrl: './vitrine-sequence-diagram.scss',
})
export class VitrineSequenceDiagram {}
