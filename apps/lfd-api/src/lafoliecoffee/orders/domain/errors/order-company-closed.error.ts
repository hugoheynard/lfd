import { BusinessError } from "../../../../platform/shared/errors/app-error.js";

/**
 * La société de la commande, ou son principal, est **fermée** — supprimée ou
 * résiliée — au moment même où la commande s'écrit (409). Levée par le verrou
 * de la passation (`PrismaOrderRepository.place`), qui tranche la course avec
 * une suppression ou une résiliation : les murs en amont lisaient encore la
 * société ouverte.
 */
export class OrderCompanyClosedError extends BusinessError {
  constructor(readonly companyId: string) {
    super(
      "orders.company_closed",
      "Ce compte client vient d'être fermé (supprimé ou résilié) : la commande n'est pas passée. Rechargez la page ; pour commander à nouveau à son nom, contactez-nous.",
    );
  }
}
