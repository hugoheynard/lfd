import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { B2B_API_BASE } from '../api/api-config';
import { BLOB_LIFETIME_MS } from '../commandes/delivery-notes.service';
import { blobRefusalMessage } from '../shared/download/blob-refusal';

/** Le code du 404 « remise attestée, BL pas encore écrit » — l'écran réessaie. */
export const NOTE_NOT_YET_CODE = 'delivery_notes.counter.not_yet';

/** Combien de fois redemander le bon, et à quel intervalle (ms). */
const NOT_YET_ATTEMPTS = 6;
const NOT_YET_WAIT_MS = 1_000;

/**
 * **Le bon remis au client, au comptoir** (plan du jour J, lot L6) —
 * `GET /admin/counter/orders/:orderId/delivery-note/carrier.pdf`, sous
 * `handover_counter:read`. Le BL **de transport** du retrait remis — non
 * chiffré, à faire signer, comme en livraison (Hugo, 2026-11-03 ; le chiffré
 * reste dans l'espace client et sur la fiche commande) —, sans numéro : le
 * vendeur n'a pas le droit de lister les BL.
 *
 * Le BL naît à la remise, APRÈS la livraison durable du fait de remise : juste
 * après « Valider et remettre », la route peut répondre 404
 * `delivery_notes.counter.not_yet`. Le service réessaie brièvement ; tout
 * autre refus remonte tel quel.
 */
@Injectable({ providedIn: 'root' })
export class CounterDeliveryNoteService {
  private readonly http = inject(HttpClient);

  /** Le PDF, en réessayant tant que le serveur dit « pas encore ». */
  carrierPdf(orderId: string): Promise<Blob> {
    return retryWhileNotYet(() => this.download(orderId), NOT_YET_ATTEMPTS, NOT_YET_WAIT_MS);
  }

  /**
   * Ouvre le bon dans un onglet, d'où on l'imprime. Rejette avec le message du
   * serveur (lu dans le corps `Blob` du refus) quand il ne vient pas.
   */
  async openCarrier(orderId: string): Promise<void> {
    let blob: Blob;
    try {
      blob = await this.carrierPdf(orderId);
    } catch (error) {
      throw new Error(await blobRefusalMessage(error));
    }
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank', 'noopener');
    setTimeout(() => {
      URL.revokeObjectURL(url);
    }, BLOB_LIFETIME_MS);
  }

  private download(orderId: string): Promise<Blob> {
    return firstValueFrom(
      this.http.get(
        `${B2B_API_BASE}/admin/counter/orders/${encodeURIComponent(orderId)}/delivery-note/carrier.pdf`,
        { responseType: 'blob' },
      ),
    );
  }
}

/**
 * Rejoue `attempt` tant qu'il échoue sur « pas encore », au plus `attempts`
 * fois, en attendant `waitMs` entre deux. Exportée pour être éprouvée seule.
 */
export async function retryWhileNotYet<T>(
  attempt: () => Promise<T>,
  attempts: number,
  waitMs: number,
): Promise<T> {
  for (let tried = 1; ; tried += 1) {
    try {
      return await attempt();
    } catch (error) {
      if (tried >= attempts || !(await isNotYet(error))) {
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, waitMs));
    }
  }
}

/** Le refus est-il le 404 « pas encore » ? Son corps arrive en `Blob` (réponse attendue : un PDF). */
export async function isNotYet(error: unknown): Promise<boolean> {
  if (!(error instanceof HttpErrorResponse) || error.status !== 404) {
    return false;
  }
  const body: unknown = error.error;
  const text = body instanceof Blob ? await readText(body) : JSON.stringify(body ?? null);
  try {
    const parsed: unknown = JSON.parse(text);
    return (
      typeof parsed === 'object' &&
      parsed !== null &&
      'code' in parsed &&
      parsed.code === NOTE_NOT_YET_CODE
    );
  } catch {
    return false;
  }
}

/** `FileReader` plutôt que `Blob.text()` : le second manque à jsdom. */
function readText(blob: Blob): Promise<string> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => {
      resolve(typeof reader.result === 'string' ? reader.result : '');
    };
    reader.onerror = () => {
      resolve('');
    };
    reader.readAsText(blob);
  });
}
