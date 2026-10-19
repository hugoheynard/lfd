import { ChangeDetectionStrategy, Component, input, model } from '@angular/core';
import type { BundleChoiceCandidateView } from '@lfd/contracts';
import {
  FoldBadgeComponent,
  FoldButtonComponent,
  FoldButtonIconComponent,
  FoldEmptyStateComponent,
  FoldIconComponent,
  FoldInputComponent,
} from 'fold-ng';

import { BundleChoiceSearch } from '../bundle-choice-search/bundle-choice-search';
import {
  choiceMoved,
  choiceOf,
  type GroupDraft,
  newGroup,
  renamed,
  standingReason,
  swapped,
  withChoice,
  withoutChoice,
  withoutGroup,
} from '../bundle-draft';

/**
 * **La composition d'une formule** — ses groupes, dans l'ordre, et dans
 * chacun ses articles au choix. Ne parle pas au serveur : il édite un
 * brouillon (`groups`), que la page ou le panneau de création envoie en un
 * seul appel. Verrouillé, il se lit sans s'écrire.
 */
@Component({
  selector: 'app-bundle-composition-editor',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    BundleChoiceSearch,
    FoldBadgeComponent,
    FoldButtonComponent,
    FoldButtonIconComponent,
    FoldEmptyStateComponent,
    FoldIconComponent,
    FoldInputComponent,
  ],
  templateUrl: './bundle-composition-editor.html',
  styleUrl: './bundle-composition-editor.scss',
})
export class BundleCompositionEditor {
  readonly groups = model.required<readonly GroupDraft[]>();
  readonly locked = input(false);

  protected readonly reason = standingReason;

  protected skusOf(group: GroupDraft): readonly string[] {
    return group.choices.map((choice) => choice.sku);
  }

  protected addGroup(): void {
    this.groups.update((groups) => [...groups, newGroup()]);
  }

  protected rename(id: string, label: string): void {
    this.groups.update((groups) => renamed(groups, id, label));
  }

  protected moveGroup(index: number, step: -1 | 1): void {
    this.groups.update((groups) => swapped(groups, index, step));
  }

  protected removeGroup(id: string): void {
    this.groups.update((groups) => withoutGroup(groups, id));
  }

  protected addChoice(id: string, candidate: BundleChoiceCandidateView): void {
    this.groups.update((groups) => withChoice(groups, id, choiceOf(candidate)));
  }

  protected moveChoice(id: string, index: number, step: -1 | 1): void {
    this.groups.update((groups) => choiceMoved(groups, id, index, step));
  }

  protected removeChoice(id: string, sku: string): void {
    this.groups.update((groups) => withoutChoice(groups, id, sku));
  }
}
