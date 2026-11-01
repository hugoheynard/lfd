import type { AudienceContactSettingsView } from "@lfd/contracts";
import { Controller, Get } from "@nestjs/common";
import { QueryBus } from "@nestjs/cqrs";

import { ActingCompany } from "../../../platform/auth/acting-company.decorator.js";
import { GetMyShopContactSettingsQuery } from "../application/queries/get-my-shop-contact-settings.query.js";

/**
 * **La carte de contact d'un client connecté** — `GET /me/contact-settings` :
 * celle de son audience établie (pro d'une société active → pros, sinon
 * particuliers), et elle seule (Hugo, 2026-11-01).
 *
 * Une route à part, comme `POST /me/contact-messages` : le garde global ne
 * résout aucun principal sur une route `@Public` (`auth.guard.ts`). La
 * société vient du contexte de la requête (l'espace choisi), jamais de l'URL.
 */
@Controller("me/contact-settings")
export class MyContactSettingsController {
  constructor(private readonly queries: QueryBus) {}

  @Get()
  settings(@ActingCompany() companyId: string | null): Promise<AudienceContactSettingsView> {
    return this.queries.execute<GetMyShopContactSettingsQuery, AudienceContactSettingsView>(
      new GetMyShopContactSettingsQuery(companyId),
    );
  }
}
