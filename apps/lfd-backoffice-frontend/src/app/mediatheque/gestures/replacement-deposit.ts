import { Injectable, inject } from '@angular/core';
import { httpErrorMessage } from '@lfd/endpoints';

import { MediaImagesApi } from '../data/media-images-api';
import type { ImageDescription } from '../rules/image-description';
import { blankImage, depositedDescribed, type ReplaceCandidate } from '../rules/replace-rules';
import { IMAGE_MEASURE, checkBeforeUpload } from '../rules/upload-check';

/** Ce que rend un dépôt : la nouvelle image désignée, ou le refus à dire. */
export type ReplacementDepositOutcome = ReplaceCandidate | { readonly refusal: string };

/**
 * **Déposer la remplaçante** — UN fichier, vérifié avant l'envoi comme au
 * dépôt, le serveur restant l'autorité.
 *
 * Des octets déjà au fonds ne créent rien : c'est l'image existante qui est
 * désignée, et l'écran le dit. Sa description n'est connue que si elle est
 * dans le fil chargé (`lookup`) ; sinon, on ne la suppose pas.
 */
@Injectable({ providedIn: 'root' })
export class ReplacementDeposit {
  private readonly api = inject(MediaImagesApi);
  private readonly measure = inject(IMAGE_MEASURE);

  async deposit(
    file: File,
    seriesId: string | null,
    lookup: (url: string) => ImageDescription | null,
  ): Promise<ReplacementDepositOutcome> {
    const local = await checkBeforeUpload(file, this.measure);
    if (local !== null) {
      return { refusal: local };
    }
    try {
      const uploaded = await this.api.upload(file, seriesId);
      const known = uploaded.alreadyInLibrary ? lookup(uploaded.url) : null;
      return {
        image: known ?? blankImage(uploaded.url),
        described: depositedDescribed(uploaded.alreadyInLibrary, known),
        alreadyInLibrary: uploaded.alreadyInLibrary,
      };
    } catch (caught) {
      return { refusal: httpErrorMessage(caught, "Le fichier n'a pas pu être déposé.") };
    }
  }
}
