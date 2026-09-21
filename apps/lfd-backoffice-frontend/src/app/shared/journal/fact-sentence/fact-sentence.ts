import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { Router } from '@angular/router';
import { FoldLinkComponent } from 'fold-ng';

import type { Segment } from '../phrase';

/**
 * **Une phrase du journal, rendue segment par segment** — les noms en gras, les
 * valeurs mises en forme, le sujet lié à sa fiche quand l'écran en a une.
 *
 * Chaque segment a son propre élément : c'est ce qui donne le gras et le lien
 * sans `innerHTML`, et ce qui garde les espaces de la phrase tels que le moteur
 * les a écrits (un nœud texte du gabarit, lui, verrait ses blancs réduits).
 */
@Component({
  selector: 'app-fact-sentence',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldLinkComponent],
  templateUrl: './fact-sentence.html',
  styleUrl: './fact-sentence.scss',
})
export class FactSentence {
  private readonly router = inject(Router);

  readonly segments = input.required<readonly Segment[]>();

  /** `fold-link` en mode bouton : la navigation reste dans l'application. */
  protected open(route: string): void {
    void this.router.navigateByUrl(route);
  }
}
