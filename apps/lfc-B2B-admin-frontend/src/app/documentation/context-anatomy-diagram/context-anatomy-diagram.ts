import { ChangeDetectionStrategy, Component } from '@angular/core';

/**
 * Schéma « anatomie d'un contexte de vente » — une carte de capacité, et les
 * trois choses qui s'y accrochent : un taux de TVA, un adaptateur, une tranche
 * de catalogue.
 *
 * Purement présentationnel ; couleurs par tokens (thème-aware).
 */
@Component({
  selector: 'app-context-anatomy-diagram',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './context-anatomy-diagram.html',
  styleUrl: './context-anatomy-diagram.scss',
})
export class ContextAnatomyDiagram {}
