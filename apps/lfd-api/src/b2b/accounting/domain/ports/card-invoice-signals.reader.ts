import type { CardInvoiceSignalView } from "@lfd/contracts";

/** Les factures carte signalées, pour l'écran Comptabilité (lot E5a). */
export abstract class CardInvoiceSignalsReader {
  /** Les issues `blocked`, les plus récentes d'abord. */
  abstract signaled(): Promise<readonly CardInvoiceSignalView[]>;
}
