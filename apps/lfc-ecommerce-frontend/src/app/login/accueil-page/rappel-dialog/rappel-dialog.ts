import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import {
  FoldPanelBodyComponent,
  type FoldPanelDefaults,
  FoldPanelHeaderComponent,
  FoldPanelHostService,
  FoldPanelRef,
} from 'fold-ng';

import { ClientCopyService } from '../../../client/copy/client-copy.service';
import { dialogSide } from '../../../client/panel-side';
import { RappelPanel } from '../rappel-panel/rappel-panel';

/** Ce qu'il faut pour ouvrir : le numéro qu'on rappellera, s'il est connu. */
export interface RappelData {
  readonly phone: string;
}

/**
 * **« On vous rappelle quand ? »** — le choix du créneau, en DIALOGUE (Hugo,
 * 2026-09-21 : « demander à être rappelé devrait être un dialog »).
 *
 * 🔴 Il remplaçait l'écran entier : le formulaire disparaissait, l'accroche du
 * bandeau changeait, et un « retour » apparaissait dans la barre. Demander un
 * rappel n'est pourtant pas une étape du parcours — c'est une porte de sortie
 * humaine (handoff `handoff-inscription`, §4), qui ne conditionne rien. Lui
 * faire prendre toute la place disait le contraire de ce qu'elle est : on
 * perdait de vue le formulaire qu'on était en train de remplir, et rien ne
 * disait qu'on le retrouverait intact.
 *
 * ⚠️ **L'action reste DANS le panneau, pas dans un pied de dialogue.** Les deux
 * dialogues de commande ont leur CTA en pied ; celui-ci ne peut pas, parce que
 * `RappelPanel` est aussi posé EN LIGNE par l'écran de commande, avec sa propre
 * action. L'en sortir aurait demandé de dupliquer `confirm()` — deux chemins
 * pour le même geste, qui finissent par ne plus choisir le même créneau.
 *
 * `md` et non `lg` : six créneaux en deux colonnes, pas une journée de
 * fournées. La largeur des dialogues de commande est celle de LEUR parcours,
 * et celui-ci n'en fait pas partie.
 */
@Component({
  selector: 'app-rappel-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldPanelBodyComponent, FoldPanelHeaderComponent, RappelPanel],
  templateUrl: './rappel-dialog.html',
  styleUrl: './rappel-dialog.scss',
})
export class RappelDialog {
  static readonly foldPanel: FoldPanelDefaults = {
    side: 'center',
    width: 'md',
    surface: 'solid',
  };

  /**
   * Ouvre le choix. Rend le créneau retenu, ou `undefined` si l'on ferme sans
   * choisir — fermer n'est pas demander un rappel.
   */
  static open(panels: FoldPanelHostService, data: RappelData): FoldPanelRef<string | undefined> {
    return panels.open<RappelData, string | undefined>(RappelDialog, {
      side: dialogSide(),
      stack: true,
      data,
    });
  }

  readonly data = input.required<RappelData>();

  private readonly ref = inject(FoldPanelRef);

  protected readonly t = inject(ClientCopyService).t;

  protected readonly phone = computed(() => this.data().phone);

  protected book(slot: string): void {
    this.ref.close(slot);
  }
}
