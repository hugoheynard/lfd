import { Controller, Get } from "@nestjs/common";
import { CurrentUser } from "../infra/auth/current-user.decorator.js";
import type { Principal } from "../infra/auth/principal.js";

/**
 * `GET /me` — l'identité résolue du client authentifié.
 *
 * Route protégée par le guard global : le front l'appelle après login (Auth0)
 * pour savoir « qui suis-je chez nous » (userId, société, rôle). Le `Principal`
 * est **autoritaire depuis la base**, pas depuis les claims du token.
 */
@Controller("me")
export class MeController {
  @Get()
  me(@CurrentUser() user: Principal): Principal {
    return user;
  }
}
