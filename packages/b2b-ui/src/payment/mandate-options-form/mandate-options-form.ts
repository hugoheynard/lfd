import { ChangeDetectionStrategy, Component, input, model } from '@angular/core';
import { FoldInputComponent } from 'fold-ng';

import {
  MANDATE_OPTIONS_FORM_LABELS_FR,
  type MandateOptionsDraft,
  type MandateOptionsFormLabels,
} from '../mandate-options-draft.model';

/**
 * Le **formulaire des zones facultatives du mandat** — zone 14 et zone 19.
 * Rien d'autre : ni bouton, ni aperçu, ni écriture.
 *
 * La fiche staff l'habille de son aperçu et de son bouton, `/mon-compte` de son
 * panneau et de son avertissement de brouillon ; chacun écrit par son chemin.
 * La logique est dans `mandate-options-draft.model.ts`.
 *
 * Fragment transparent : sa rangée devient enfant direct de l'hôte.
 */
@Component({
  selector: 'lfd-mandate-options-form',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldInputComponent],
  templateUrl: './mandate-options-form.html',
  styleUrl: './mandate-options-form.scss',
})
export class MandateOptionsForm {
  /** Le brouillon des deux zones (two-way). */
  readonly value = model.required<MandateOptionsDraft>();

  /** Les mots du formulaire ; le défaut est le texte de la fiche staff. */
  readonly labels = input<MandateOptionsFormLabels>(MANDATE_OPTIONS_FORM_LABELS_FR);

  protected set<K extends keyof MandateOptionsDraft>(key: K, value: MandateOptionsDraft[K]): void {
    this.value.update((draft) => ({ ...draft, [key]: value }));
  }
}
