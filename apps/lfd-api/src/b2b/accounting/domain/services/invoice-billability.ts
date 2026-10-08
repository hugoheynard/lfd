import {
  InvoiceDossierLateFeeRateMissingError,
  InvoiceDossierUnreadableVatRateError,
} from "../errors/invoice-dossier-errors.js";
import { simulateInvoiceDossier } from "./invoice-dossier.js";
import type { FrozenInvoiceOrder } from "./invoice-dossier.types.js";

/**
 * **Ce bon se facture-t-il ?** — jugé SEUL, avant d'être agrégé à une ligne de
 * débit (plan `le-prelevement-suit-la-facture.md`).
 *
 * Le critère est celui du simulateur lui-même, pas une recopie : on lui fait
 * calculer la facture de ce seul bon. Il refuse (surtaxe sans taux, taux de
 * ligne illisible) ou range le bon parmi les incohérents — dans les trois cas
 * le bon n'est pas facturable. Recopier ces trois règles ici les ferait
 * diverger au premier changement du simulateur.
 *
 * Juger bon par bon suffit : les trois refus portent chacun sur UN bon
 * (vérifié le 2026-10-08 dans `invoice-dossier.ts`, `invoice-lines.ts`,
 * `invoice-order-consistency.ts`). Des bons facturables un à un le sont donc
 * ensemble, et un mauvais bon ne contamine jamais la ligne de son payeur.
 *
 * Un bon non ventilé (`vatShares` nul) EST facturable : la facture recalcule
 * sa TVA par taux, comme pour tout bon.
 */
export function isBillable(order: FrozenInvoiceOrder): boolean {
  try {
    return simulateInvoiceDossier([order]).inconsistentOrders.length === 0;
  } catch (error) {
    if (
      error instanceof InvoiceDossierLateFeeRateMissingError ||
      error instanceof InvoiceDossierUnreadableVatRateError
    ) {
      return false;
    }
    throw error;
  }
}
