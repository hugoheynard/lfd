import { Injectable } from '@angular/core';

import { saveBlob } from '../download/save-blob';

/** Combien de temps garder l'adresse d'un PDF imprimé avant de la libérer. */
const PRINT_LIFETIME_MS = 60_000;

/**
 * **Télécharger ou imprimer un PDF reçu en mémoire** — la seule brique des
 * pièces d'une commande (confirmation, bons, factures).
 *
 * Le PDF arrive par `HttpClient` (le jeton staff n'accompagne pas un simple
 * lien) : imprimer, c'est le charger dans un cadre caché de la page et
 * demander au navigateur sa boîte d'impression. Quand le navigateur refuse
 * d'imprimer un cadre (certains lecteurs PDF intégrés), le PDF s'ouvre dans un
 * onglet, d'où on l'imprime — le geste que faisait déjà « Imprimer (transport) ».
 */
@Injectable({ providedIn: 'root' })
export class PdfPrinter {
  /** Enregistre le PDF sous ce nom. */
  download(blob: Blob, fileName: string): void {
    saveBlob(blob, fileName);
  }

  /** Ouvre la boîte d'impression du navigateur sur ce PDF. */
  print(blob: Blob): void {
    const url = URL.createObjectURL(blob);
    const frame = document.createElement('iframe');
    frame.hidden = true;
    frame.src = url;
    frame.addEventListener('load', () => {
      try {
        frame.contentWindow?.focus();
        frame.contentWindow?.print();
      } catch {
        window.open(url, '_blank', 'noopener');
      }
    });
    document.body.append(frame);
    setTimeout(() => {
      frame.remove();
      URL.revokeObjectURL(url);
    }, PRINT_LIFETIME_MS);
  }
}
