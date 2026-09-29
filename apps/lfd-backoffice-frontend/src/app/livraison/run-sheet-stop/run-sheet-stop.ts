import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import type { DeliveryRunSheetStopView } from '@lfd/contracts';
import {
  FoldBadgeComponent,
  FoldCardComponent,
  FoldElementTitleComponent,
  FoldFieldComponent,
  FoldFieldListComponent,
  FoldLinkComponent,
} from 'fold-ng';

import {
  addressLinesOf,
  contactNameOf,
  mapHrefOf,
  onSiteLabelOf,
  stateLabelOf,
  stopTitleOf,
  telHrefOf,
  windowLabel,
} from '../run-sheet';
import { RunSheetStepPhoto } from '../run-sheet-step-photo/run-sheet-step-photo';

/**
 * **Un arrêt de la feuille de route** — comment livrer une adresse : fenêtre,
 * adresse, contact, notes, procédure.
 *
 * Sorti de la feuille de route le 2026-09-29 pour que l'impression d'UNE
 * tournée (lot 3) porte exactement les mêmes consignes : deux copies auraient
 * divergé à la première étape de procédure ajoutée.
 */
@Component({
  selector: 'app-run-sheet-stop',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldBadgeComponent,
    FoldCardComponent,
    FoldElementTitleComponent,
    FoldFieldComponent,
    FoldFieldListComponent,
    FoldLinkComponent,
    RunSheetStepPhoto,
  ],
  templateUrl: './run-sheet-stop.html',
  styleUrl: './run-sheet-stop.scss',
})
export class RunSheetStop {
  readonly stop = input.required<DeliveryRunSheetStopView>();
  /** Les photos de procédure se lisent sous `b2b_companies:read` : sans lui, le texte seul. */
  readonly canSeePhotos = input(false);

  protected readonly windowLabel = windowLabel;
  protected readonly stateLabelOf = stateLabelOf;
  protected readonly stopTitleOf = stopTitleOf;
  protected readonly addressLinesOf = addressLinesOf;
  protected readonly contactNameOf = contactNameOf;
  protected readonly telHrefOf = telHrefOf;
  protected readonly mapHrefOf = mapHrefOf;
  protected readonly onSiteLabelOf = onSiteLabelOf;
}
