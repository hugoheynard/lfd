/**
 * **Le reste d'un départ incomplet est-il déjà demandé ?** (plan
 * `documentation/commandes/reliquat/plan-e9-reste-carte.md`, § 4.7) — une
 * demande de remboursement de motif `shortfall`, dans n'importe quel état,
 * lue au bloc `card-payment`. Dès qu'elle existe, le solde de la commande est
 * GELÉ : le corriger changerait le montant d'un remboursement déjà parti.
 *
 * Ce gel est tenu par le code, pas par la base (décision de Hugo du
 * 2026-11-13, pas de migration) : une écriture de `billable_*` hors de
 * l'écrivain du solde, ou une demande purgée, le lèverait sans bruit.
 */
export abstract class OrderShortfallRefundReader {
  abstract hasShortfallRefund(orderId: string): Promise<boolean>;
}
