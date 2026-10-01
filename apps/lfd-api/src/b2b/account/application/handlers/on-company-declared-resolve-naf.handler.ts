import { EventsHandler, type IEventHandler } from "@nestjs/cqrs";

import { CompanyDeclaredEvent } from "../../domain/events/company-declared.event.js";
import { CompanyNafWriter } from "../../domain/ports/company-naf.writer.js";
import { CompanyRepository } from "../../domain/ports/company.repository.js";
import { EstablishmentDirectory } from "../../domain/ports/establishment-directory.js";
import { BackgroundWork } from "../../../../platform/events/background-work.js";

/**
 * Abonné : `company.declared` → **résout le code NAF** de la société depuis son
 * SIRET (API entreprises) et l'enregistre sur l'agrégat. Découplé de la
 * transaction de déclaration (l'appel externe ne doit pas la ralentir/faire
 * échouer). **Best-effort** : SIRET introuvable ou API indisponible ⇒ on ne
 * touche à rien (le `nafCode` reste vide, rattrapé par le backfill).
 *
 * 🔴 **Il n'écrit QUE le NAF** ({@link CompanyNafWriter}), jamais l'agrégat
 * entier. L'agrégat chargé AVANT l'appel réseau est périmé quand la réponse
 * arrive : le staff a pu activer la société ou lui accorder un terme entre-temps.
 * Un `save` complet les effaçait — société revenue `pending`, `granted_terms`
 * vidés (bogue de production constaté le 2026-10-01). Recharger après l'appel
 * aurait seulement rétréci la fenêtre : aucun écrivain de `Company` ne verrouille
 * sa ligne (vérifié le 2026-10-01).
 */
@EventsHandler(CompanyDeclaredEvent)
export class OnCompanyDeclaredResolveNaf implements IEventHandler<CompanyDeclaredEvent> {
  constructor(
    private readonly companies: CompanyRepository,
    private readonly nafWriter: CompanyNafWriter,
    private readonly directory: EstablishmentDirectory,
    private readonly work: BackgroundWork,
  ) {}

  handle(event: CompanyDeclaredEvent): void {
    // **Suivi** : cet abonné tourne hors de la requête HTTP. Sans cette
    // inscription, personne — ni la prod, ni un test — ne sait quand il a fini.
    void this.work.track(this.run(event), "on-company-declared-resolve-naf");
  }

  private async run(event: CompanyDeclaredEvent): Promise<void> {
    const company = await this.companies.load(event.companyId);
    if (company === null) {
      return;
    }
    const siret = company.siret;
    if (siret === null) {
      // Pas de SIRET, pas de NAF à résoudre : le compte a été ouvert sans
      // papiers, et la résolution se refera quand ils arriveront.
      return;
    }
    const naf = await this.directory.resolveNaf(siret.value);
    if (naf === null) {
      return;
    }
    company.assignNaf(naf);
    await this.nafWriter.saveNaf(company);
  }
}
