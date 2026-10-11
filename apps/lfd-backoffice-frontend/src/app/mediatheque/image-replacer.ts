import { Injectable, inject } from '@angular/core';
import { httpErrorMessage } from '@lfd/endpoints';

import type { ImageDescription } from './image-description';
import { MediaLibraryHttpApi } from './media-library-http-api';
import { takenOver } from './replace-rules';

/** Ce que rend un remplacement : son refus, ou ce qu'il est advenu de la reprise. */
export type ReplaceOutcome =
  | { readonly refusal: string }
  /** `null` : reprise non demandée ; `true` : faite ; une phrase : son refus. */
  | { readonly description: true | string | null };

/**
 * **Remplacer une image chez tous ses porteurs**, puis — si on l'a demandé —
 * lui reprendre la description de l'ancienne.
 *
 * 🔴 Deux appels, dans cet ordre : `POST /media/replace`, puis `PUT /media`
 * sur la nouvelle. Le serveur ne combine pas les deux (le contrôleur dit
 * pourquoi) ; rien ici ne prétend qu'ils sont atomiques. Un refus du
 * remplacement est rendu tel quel ; un refus de la reprise ne défait pas le
 * remplacement, déjà fait — il est rendu pour être dit.
 */
@Injectable({ providedIn: 'root' })
export class ImageReplacer {
  private readonly api = inject(MediaLibraryHttpApi);

  async replace(from: ImageDescription, to: string, takeOver: boolean): Promise<ReplaceOutcome> {
    try {
      await this.api.replace({ from: from.url, to });
    } catch (caught) {
      return { refusal: httpErrorMessage(caught, "L'image n'a pas pu être remplacée.") };
    }
    if (!takeOver) {
      return { description: null };
    }
    try {
      await this.api.describe(takenOver(from, to));
      return { description: true };
    } catch (caught) {
      return { description: httpErrorMessage(caught, "La description n'a pas pu être reprise.") };
    }
  }
}
