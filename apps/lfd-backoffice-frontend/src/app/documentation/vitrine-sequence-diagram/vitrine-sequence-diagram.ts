import { ChangeDetectionStrategy, Component } from '@angular/core';

import {
  SEQUENCE_ACTORS,
  SEQUENCE_FAILURE,
  SEQUENCE_MESSAGES,
  SEQUENCE_SWEEP,
} from '../vitrine-guide/vitrine-guide-diagrams';

/**
 * Schéma « les deux sens » du webhook de la vitrine : on prévient, l'agence
 * relit. La branche d'échec est dessinée sous le chemin heureux parce que
 * c'est elle qu'un développeur d'agence ne devine pas — un 2xx tardif vaut un
 * échec, et dix échecs coupent tout.
 *
 * Libellés lus dans `vitrine-guide-diagrams.ts`, que le guide Markdown
 * recopie en Mermaid. Purement présentationnel ; couleurs par tokens (thème-aware).
 */
@Component({
  selector: 'app-vitrine-sequence-diagram',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './vitrine-sequence-diagram.html',
  styleUrl: './vitrine-sequence-diagram.scss',
})
export class VitrineSequenceDiagram {
  protected readonly actors = SEQUENCE_ACTORS;
  protected readonly sweep = SEQUENCE_SWEEP;
  protected readonly messages = SEQUENCE_MESSAGES;
  protected readonly failure = SEQUENCE_FAILURE;
}
