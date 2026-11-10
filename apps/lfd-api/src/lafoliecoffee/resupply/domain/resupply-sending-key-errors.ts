import { BusinessError } from "../../../platform/shared/errors/app-error.js";

/**
 * La clé d'envoi fournie par l'écran est déjà celle d'un AUTRE réassort — un
 * autre point, ou un autre geste (audit du réassort, C-B, 2026-11-02). Le
 * rejeu d'un même envoi rend son réassort ; une clé prise ailleurs ne rend
 * jamais le réassort d'un autre, elle est refusée.
 */
export class ResupplySendingKeyTakenError extends BusinessError {
  constructor(readonly key: string) {
    super(
      "resupply.sending_key.taken",
      "Cet envoi porte une clé déjà employée par un autre réassort (un autre point, ou un autre geste) : rien n'a été envoyé. Fermez le panneau, rouvrez-le, puis renvoyez.",
    );
  }
}
