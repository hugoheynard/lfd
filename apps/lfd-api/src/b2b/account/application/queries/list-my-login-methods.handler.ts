import type { LoginMethodsView } from "@lfd/contracts";
import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";

import { CustomerIdentityPort } from "../../domain/ports/customer-identity.port.js";
import { ListMyLoginMethodsQuery } from "./list-my-login-methods.query.js";

/**
 * Lit les méthodes de connexion **chez le fournisseur d'identité**.
 *
 * C'est un appel réseau sortant, et c'est tout l'intérêt de lui donner sa
 * propre route : servie avec `/me`, cette liste mettrait un aller-retour Auth0
 * sur le chemin d'amorçage de toutes les pages, pour une information que seul
 * le profil affiche (plan `plan-rattachement-depuis-le-profil.md`, R6).
 *
 * La vue laisse l'identifiant secondaire derrière elle : le retrait se demande
 * par le seul nom de connexion, et l'API le retrouve elle-même (§9.5).
 */
@QueryHandler(ListMyLoginMethodsQuery)
export class ListMyLoginMethodsHandler implements IQueryHandler<
  ListMyLoginMethodsQuery,
  LoginMethodsView
> {
  constructor(private readonly identity: CustomerIdentityPort) {}

  async execute(query: ListMyLoginMethodsQuery): Promise<LoginMethodsView> {
    const methods = await this.identity.listLoginMethods(query.subject);
    return methods.map((method) => ({
      provider: method.provider,
      connection: method.connection,
      isPrimary: method.isPrimary,
    }));
  }
}
