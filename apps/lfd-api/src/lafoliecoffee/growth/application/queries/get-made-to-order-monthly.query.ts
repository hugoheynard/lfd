import type { MadeToOrderMonthWindow } from "@lfd/contracts";

/** Le sur mesure par mois, sur `months` mois glissants finissant au mois courant (lot R). */
export class GetMadeToOrderMonthlyQuery {
  constructor(readonly months: MadeToOrderMonthWindow) {}
}
