import { HttpErrorResponse } from '@angular/common/http';

/**
 * **Ce que le serveur a dit d'un geste refusé**, lisible par qui a les mains dans
 * la pâte.
 *
 * Partagé par la fiche d'atelier et le poste de colisage : un geste qui échoue
 * n'y attend plus dans une file (retirée le 2026-09-14), il revient en arrière
 * sous les yeux de la personne — et il faut alors lui dire pourquoi.
 */

const FALLBACK_MESSAGE = 'Le serveur n’a pas enregistré ce geste.';
const NO_ANSWER_MESSAGE = 'Le serveur n’a pas répondu — rien n’a été enregistré.';

/**
 * Le `message` de l'enveloppe d'erreur de l'API (`{ code, message, requestId }`),
 * écrit pour le personnel ; un repli neutre sinon.
 *
 * Un tableau (la forme des erreurs de validation de Nest) ou une chaîne vide
 * tombent sur le repli : un message à moitié lisible ferait plus de mal qu'un
 * message neutre.
 */
export function serverMessageOf(error: unknown): string {
  if (!(error instanceof HttpErrorResponse)) {
    return FALLBACK_MESSAGE;
  }
  if (error.status === 0) {
    return NO_ANSWER_MESSAGE;
  }
  const body: unknown = error.error;
  if (typeof body !== 'object' || body === null) {
    return FALLBACK_MESSAGE;
  }
  const envelope: Partial<Record<'message', unknown>> = body;
  const message = typeof envelope.message === 'string' ? envelope.message.trim() : '';
  return message === '' ? FALLBACK_MESSAGE : message;
}

/**
 * Le `code` de l'enveloppe d'erreur de l'API, quand il y en a un — pour
 * accompagner un refus précis d'un geste de sortie (un lien), jamais pour
 * réécrire son message.
 */
export function serverCodeOf(error: unknown): string | null {
  if (!(error instanceof HttpErrorResponse)) {
    return null;
  }
  const body: unknown = error.error;
  if (typeof body !== 'object' || body === null) {
    return null;
  }
  const envelope: Partial<Record<'code', unknown>> = body;
  return typeof envelope.code === 'string' ? envelope.code : null;
}
