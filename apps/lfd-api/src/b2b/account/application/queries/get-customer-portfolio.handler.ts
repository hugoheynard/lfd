import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";
import { NEW_CUSTOMER_WINDOW_DAYS, type CustomerPortfolioView } from "@lfd/contracts";

import { Clock } from "../../../../platform/time/clock.js";
import { AdminCompanyReader } from "../../domain/ports/admin-company.reader.js";
import { GetCustomerPortfolioQuery } from "./get-customer-portfolio.query.js";

const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Le portefeuille client en quatre nombres.
 *
 * ## `newlyActive` compte des ACTIVATIONS, pas des créations
 *
 * La distinction porte de l'argent. Un dossier déposé en juin et activé en
 * septembre est un client de septembre : c'est en septembre qu'il commande, donc
 * en septembre qu'il facture. Compter sur `createdAt` daterait le chiffre
 * d'affaires du jour où quelqu'un a rempli un formulaire.
 *
 * ## La fenêtre est GLISSANTE, et l'écran doit le dire
 *
 * Trente jours en arrière depuis l'instant du `Clock`, sans frontière de
 * calendrier. « Ce mois-ci » supposerait de savoir où commence un mois à Paris,
 * donc de convertir un jour en instant — le geste que `lint:business-day`
 * interdit, parce qu'il se trompe d'un jour deux fois par an. La fenêtre
 * glissante répond à la même question sans la poser.
 *
 * Le temps vient du port, jamais de `Date.now()` : sans quoi ce compteur serait
 * intestable, et un test qui sème « activé il y a 29 jours » deviendrait rouge
 * tout seul un matin.
 */
@QueryHandler(GetCustomerPortfolioQuery)
export class GetCustomerPortfolioHandler implements IQueryHandler<
  GetCustomerPortfolioQuery,
  CustomerPortfolioView
> {
  constructor(
    private readonly companies: AdminCompanyReader,
    private readonly clock: Clock,
  ) {}

  async execute(): Promise<CustomerPortfolioView> {
    const all = await this.companies.listAll();
    const since = this.clock.now().getTime() - NEW_CUSTOMER_WINDOW_DAYS * MILLISECONDS_PER_DAY;
    return {
      active: all.filter((company) => company.status === "active").length,
      pending: all.filter((company) => company.status === "pending").length,
      suspended: all.filter((company) => company.status === "suspended").length,
      // Un compte activé PUIS suspendu reste compté : il est bien arrivé dans la
      // fenêtre, et l'effacer ferait un compteur qui baisse rétroactivement —
      // impossible à rapprocher d'un relevé le mois suivant.
      newlyActive: all.filter(
        (company) => company.activatedAt !== null && Date.parse(company.activatedAt) >= since,
      ).length,
    };
  }
}
