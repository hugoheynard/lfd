import type { VoucherRestitution } from "./loyalty-voucher-redemption.js";

/**
 * **Ce que l'annulation fera du bon** — l'aperçu du détail staff (plan
 * `documentation/order/plan-annulation-de-commande.md`, C3b.5, C3b.7).
 *
 * Même règle que {@link LoyaltyVoucherRedemption.reinstate}, sans verrou ni
 * écriture : un affichage. Port de LECTURE à part (ISP) — l'écran ne dépend
 * pas d'un port d'écriture. Déclaré par la commande, implémenté par la
 * fidélité, relié dans `appBootstrap/loyalty-voucher.module.ts`.
 *
 * Appelé sur une commande VIVANTE qui porte le bon : elle est la seule à le
 * porter (index unique partiel `orders_loyalty_voucher_live_key`).
 */
export abstract class VoucherRestitutionPreview {
  abstract previewOf(voucherId: string, now: Date): Promise<VoucherRestitution>;
}
