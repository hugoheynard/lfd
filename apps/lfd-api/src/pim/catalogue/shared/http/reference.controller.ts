import { Controller, Get, Query } from "@nestjs/common";
import { QueryBus } from "@nestjs/cqrs";
import { SOURCE_LOCALE, type AllergenReference } from "@lfd/pim-contracts";

import { AdminSurface } from "../../../../platform/auth/admin-surface.decorator.js";
import { ReadAllergenReferenceQuery } from "../../../allergens/application/read-allergen-reference.js";

/**
 * Le référentiel des **allergènes**, tel que la fiche produit le consomme.
 *
 * Il servait une constante compilée ; il sert désormais la table
 * `pim.allergen_category` / `pim.allergen_entry`, semée par la migration
 * `20260902120000_referentiel_allergenes`. **Le contrat de fil n'a pas changé** :
 * mêmes codes, mêmes libellés, mêmes deux périmètres — le rebranchement est une
 * bascule à comportement constant, et un e2e le tient code par code.
 *
 * Ce qu'il montre exactement est décidé dans l'application (D2 et D2 bis) : le
 * périmètre `eu` inclut les allergènes maison, et rien d'archivé n'est proposé.
 * L'écran qui ADMINISTRE le référentiel, lui, ne passe pas par ici — il lit
 * `GET /pim/allergens`, archivage compris, faute de quoi il n'aurait rien à
 * restaurer.
 *
 * Surface staff murée par `@AdminSurface("pim_catalog")` : identité vérifiée
 * contre l'annuaire, puis périmètre.
 */
@AdminSurface("pim_catalog")
@Controller("reference")
export class ReferenceController {
  constructor(private readonly queries: QueryBus) {}

  /**
   * Référentiel des allergènes. `scope=eu` (défaut) = ce qui se déclare en
   * Europe, annexe II **et** entrées maison ; `scope=world` = tout, codes hors
   * obligation UE compris.
   */
  @Get("allergens")
  allergens(@Query("scope") scope?: string): Promise<AllergenReference> {
    return this.queries.execute<ReadAllergenReferenceQuery, AllergenReference>(
      // Le français fait foi : c'est la langue source du catalogue, et le fil
      // n'a jamais porté qu'un libellé par entrée. Le choix de la langue par
      // l'appelant est un autre sujet, et il n'a pas de demandeur.
      new ReadAllergenReferenceQuery(scope === "world" ? "world" : "eu", SOURCE_LOCALE),
    );
  }
}
