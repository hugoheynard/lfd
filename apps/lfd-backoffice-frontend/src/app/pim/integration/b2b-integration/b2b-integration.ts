import { ChangeDetectionStrategy, Component } from '@angular/core';

import {
  FoldElementTitleComponent,
  FoldFieldComponent,
  FoldFieldListComponent,
  FoldHeroCardComponent,
  FoldIconComponent,
  FoldStatusBadgeComponent,
} from 'fold-ng';

/**
 * L'intégration **Boutique B2B** — le canal qui facture.
 *
 * Rien à configurer ici : le canal est **interne**, en processus, sans domaine
 * ni jeton. Le catalogue y descend par ses faits, fiche par fiche.
 *
 * La carte « Où en est le catalogue » (la santé et la parité du miroir) et
 * l'aperçu avant push sont partis en X2 (2026-10-17, décision de Hugo) : ils
 * vérifiaient que le push n'avait pas dérivé, et il n'y a plus de push. Ce
 * que la plateforme tient se lit sur « Catalogue publié ».
 */
@Component({
  selector: 'app-b2b-integration',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldFieldComponent,
    FoldFieldListComponent,
    FoldHeroCardComponent,
    FoldIconComponent,
    FoldStatusBadgeComponent,
    FoldElementTitleComponent,
  ],
  templateUrl: './b2b-integration.html',
  styleUrl: './b2b-integration.scss',
})
export class B2bIntegration {}
