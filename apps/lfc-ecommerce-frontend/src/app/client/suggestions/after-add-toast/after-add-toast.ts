import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { FoldToastComponent } from 'fold-ng';

import { ClientCopyService } from '../../copy/client-copy.service';
import { StaffSuggestionCard } from '../staff-suggestion-card/staff-suggestion-card';
import { AfterAddSuggestion } from '../after-add-suggestion.service';

/** Le temps de lire une ligne et de viser le « + » ; le survol suspend le compte (fold). */
export const AFTER_ADD_DURATION_MS = 6000;

/**
 * **Le retour après un ajout** (RS7) : « Ajouté ! » et la suggestion du staff
 * du panier, recalculée avec l'article entré, dans un `fold-toast` — il ne
 * bloque rien, n'ouvre pas le panier, se ferme à la croix ou de lui-même.
 * Sans suggestion, il ne paraît pas : la tuile et la pastille du panier
 * disent déjà que l'article est entré.
 *
 * Le titre de la carte est celui du panier (« Notre conseil ») : c'est sa
 * règle qui parle.
 */
@Component({
  selector: 'app-after-add-toast',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldToastComponent, StaffSuggestionCard],
  templateUrl: './after-add-toast.html',
  styleUrl: './after-add-toast.scss',
})
export class AfterAddToast {
  protected readonly offer = inject(AfterAddSuggestion);
  protected readonly t = inject(ClientCopyService).t;
  protected readonly duration = AFTER_ADD_DURATION_MS;
}
