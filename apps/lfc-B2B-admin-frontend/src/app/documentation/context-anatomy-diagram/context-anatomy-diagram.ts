import { ChangeDetectionStrategy, Component } from '@angular/core';

/**
 * Schéma « anatomie d'un contexte de vente » — un contexte de vente, et les
 * trois choses qui s'y accrochent.
 *
 * ⚠️ Le taux ne se lit PAS « le contexte vaut 10 % ». Il se règle sur le couple
 * (article, contexte) — le croissant est à 5,5 % à emporter et à 10 % sur place,
 * avec le même contexte « sur place » pour tous les articles. Le premier jet
 * mettait « TVA 10 % » au-dessus du contexte, ce qui racontait un autre modèle.
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
