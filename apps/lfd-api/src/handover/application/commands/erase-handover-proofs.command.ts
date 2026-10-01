/**
 * **Effacer les pièces de la remise d'une commande**, à la demande d'une
 * personne (son nom, sa photo, sa signature). L'attestation reste.
 *
 * ⚠️ Rien ne l'émet aujourd'hui : ni route, ni écran (Hugo, 2026-10-01).
 */
export class EraseHandoverProofsCommand {
  constructor(readonly orderId: string) {}
}
