import type { PaymentLinkStatus } from "@lfd/contracts";

/** Un lien tel que la liste le lit — les auteurs ne sont encore que des ids de fiche. */
export interface PaymentLinkEntry {
  readonly id: string;
  readonly companyId: string;
  readonly companyName: string;
  readonly amountCents: number;
  readonly label: string;
  readonly status: PaymentLinkStatus;
  readonly url: string;
  readonly createdAt: Date;
  readonly createdByStaffId: string;
  readonly paidAt: Date | null;
  readonly cancelledAt: Date | null;
  readonly cancelledByStaffId: string | null;
}

/**
 * Port de **lecture** des liens libres (ISP : distinct de
 * `PaymentLinkRepository`). Cross-tenant par nature : c'est la page de la
 * comptabilité, gardée en amont par `@AdminSurface("b2b_accounting")`.
 */
export abstract class PaymentLinkReader {
  /** Les liens, le plus récent en tête. */
  abstract list(): Promise<readonly PaymentLinkEntry[]>;
}
