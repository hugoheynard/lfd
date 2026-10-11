import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { FoldEmptyStateComponent, FoldIconComponent, FoldPageSectionComponent } from 'fold-ng';

import { CopyNavigation } from '../../state/copy-navigation';
import { CopyEntry } from '../copy-entry/copy-entry';

/**
 * **Les textes de l'espace ouvert** (plan §7, colonne 2), puis les orphelins —
 * les remplacements dont la clé a quitté le code, dans une section à part :
 * lus, jamais appliqués, et qu'on peut remettre à l'original pour les effacer.
 */
@Component({
  selector: 'app-copy-texts',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CopyEntry, FoldEmptyStateComponent, FoldIconComponent, FoldPageSectionComponent],
  templateUrl: './copy-texts.html',
  styleUrl: './copy-texts.scss',
})
export class CopyTexts {
  protected readonly navigation = inject(CopyNavigation);
}
