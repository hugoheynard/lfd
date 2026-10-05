import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { FoldButtonComponent, FoldPanelHeaderComponent, FoldPanelRef } from 'fold-ng';

import { JournalActs } from '../journal-acts/journal-acts';

/** Charge d'ouverture : de quoi on veut l'histoire, et comment l'appeler. */
export interface JournalPanelData {
  readonly subjectType: 'rule' | 'floor';
  readonly subjectId: string;
  /** Ce que l'écran appelle cette décision — « Promo de rentrée », « Viennoiseries ». */
  readonly target: string;
}

/**
 * **Le journal d'une décision** — qui l'a posée, qui l'a arrêtée, quand.
 *
 * Panneau de **lecture seule**, et il n'existe pas de pendant en écriture : les
 * actes s'écrivent avec la mutation qu'ils racontent, côté serveur, dans la même
 * transaction. Rien ici ne peut en ajouter, en corriger, ni en retirer un.
 *
 * Chaque ligne montre la phrase **figée à l'écriture**, et non l'état
 * d'aujourd'hui : la règle a pu changer ou être archivée depuis, et rendre la
 * phrase courante pour un acte d'hier raconterait l'histoire à l'envers.
 *
 * La liste elle-même est `JournalActs`, que l'onglet Tarifs d'une fiche
 * client pose aussi en place. Lu par **pages numérotées**, sur un instantané : la page 1 part sans ancre et
 * reçoit `asOf`, que les pages suivantes renvoient — sans quoi un acte écrit
 * entre deux clics pousserait tout d'un rang. Revenir à la page 1 rouvre un
 * instantané neuf, et c'est là qu'apparaît ce qui est arrivé depuis.
 */
@Component({
  selector: 'app-journal-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldPanelHeaderComponent, FoldButtonComponent, JournalActs],
  templateUrl: './journal-panel.html',
  styleUrl: './journal-panel.scss',
})
export class JournalPanel {
  private readonly ref = inject(FoldPanelRef<boolean>);

  readonly data = input<JournalPanelData | undefined>(undefined);

  protected readonly target = computed(() => this.data()?.target ?? '');

  protected close(): void {
    this.ref.close();
  }
}
