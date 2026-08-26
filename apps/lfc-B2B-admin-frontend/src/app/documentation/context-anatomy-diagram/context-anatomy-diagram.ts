import { ChangeDetectionStrategy, Component } from '@angular/core';

/**
 * Schéma « anatomie d'un contexte de vente » — une carte de capacité, et les
 * trois choses qui s'y accrochent.
 *
 * ⚠️ Le taux ne se lit PAS « la carte vaut 10 % ». Il se règle sur le couple
 * (article, carte) — le croissant est à 5,5 % à emporter et à 10 % sur place,
 * avec la même carte « sur place » pour tous les articles. Le premier jet
 * mettait « TVA 10 % » au-dessus de la carte, ce qui racontait un autre modèle.
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
