/**
 * Fait de domaine : **le règlement d'une commande est acquis**.
 *
 * 🔴 Publié par la projection du webhook Stripe, jamais par la passation. C'est
 * la distinction qui fait exister ce fichier : une commande carte est écrite
 * AVANT d'être payée, et tout ce qui affirme au client que « c'est enregistré »
 * doit attendre ce fait-ci (Hugo, 2026-09-17 — « je ne veux pas que pour un
 * paiement carte, order placed parte à la passation »).
 *
 * ⚠️ Il ne porte que l'identifiant. Le destinataire, le montant et la feuille se
 * relisent : les transporter obligerait la projection d'un événement Stripe à
 * connaître la vue client, et un fait qui transporte plus que nécessaire finit
 * par être lu pour ce qu'il transporte.
 *
 * ⚠️ **Il n'est publié qu'au FRANCHISSEMENT.** Le dépôt ne bascule que ce qui
 * était encore `pending` ; un webhook rejoué — Stripe réémet jusqu'à un 2xx — ne
 * change aucune ligne, donc ne publie rien. C'est ce qui interdit deux courriels
 * pour un seul paiement.
 */
export class OrderPaymentSettledEvent {
  constructor(readonly orderId: string) {}
}
