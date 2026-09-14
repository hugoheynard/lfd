import { Body, Controller, Get, HttpCode, HttpStatus, Patch, Post } from "@nestjs/common";
import { CommandBus, QueryBus } from "@nestjs/cqrs";

import { CurrentUser } from "../../../platform/auth/current-user.decorator.js";
import type { Principal } from "../../../platform/auth/principal.js";
import { ZodBody } from "../../../platform/shared/http/zod-body.pipe.js";
import { DeclareMyEstablishmentCommand } from "../application/commands/declare-my-establishment.command.js";
import { UpdateMyProfileCommand } from "../application/commands/update-my-profile.command.js";
import { UpdateNavPreferencesCommand } from "../application/commands/update-nav-preferences.command.js";
import { GetMyAccountQuery } from "../application/queries/get-my-account.query.js";
import type { AccountView } from "../domain/ports/account.reader.js";
import {
  declareEstablishmentPayload,
  type DeclareEstablishmentPayload,
  updateNavPrefsPayload,
  type UpdateNavPrefsPayload,
  updateProfilePayload,
  type UpdateProfilePayload,
} from "./payloads.js";

/** Ce que la porte pro renvoie : la société ouverte, de quoi relire `/me`. */
export interface DeclaredEstablishmentResponse {
  readonly companyId: string;
}

/**
 * `GET /me` · `PATCH /me/profile` · `POST /me/establishment` — le compte de la personne connectée.
 *
 * `/me` renvoie **le profil et les entreprises** : le front en a besoin des deux
 * à l'amorçage (l'identité dans l'en-tête, le nombre d'entreprises pour choisir
 * entre empty state, page simple et onglets).
 *
 * Rien n'est lu du corps ni de l'URL pour savoir *qui* : l'identité vient du
 * `Principal`, donc de la base. Un `userId` accepté en paramètre serait une
 * usurpation offerte.
 */
@Controller("me")
export class MeController {
  constructor(
    private readonly queries: QueryBus,
    private readonly commands: CommandBus,
  ) {}

  @Get()
  me(@CurrentUser() user: Principal): Promise<AccountView> {
    return this.queries.execute<GetMyAccountQuery, AccountView>(new GetMyAccountQuery(user.userId));
  }

  /**
   * Met à jour le profil. Renvoie le compte relu — une commande ne produit pas de
   * modèle de lecture, mais l'appelant en a besoin juste après : on rejoue donc
   * explicitement la **query**, plutôt que de faire retourner une vue au handler
   * d'écriture.
   */
  @Patch("profile")
  async updateProfile(
    @CurrentUser() user: Principal,
    @Body(new ZodBody(updateProfilePayload)) payload: UpdateProfilePayload,
  ): Promise<AccountView> {
    await this.commands.execute<UpdateMyProfileCommand, void>(
      new UpdateMyProfileCommand(
        user.userId,
        user.subject,
        payload.firstName,
        payload.lastName,
        payload.email,
        payload.phone,
      ),
    );
    return this.queries.execute<GetMyAccountQuery, AccountView>(new GetMyAccountQuery(user.userId));
  }

  /**
   * La porte pro : profil et établissement, en un geste. Rend l'identifiant de
   * la société et rien d'autre — l'appelant relit `/me`, comme après toute
   * commande (CLAUDE.md §4). 409 si la personne a déjà un rattachement.
   */
  @Post("establishment")
  @HttpCode(HttpStatus.CREATED)
  async declareEstablishment(
    @CurrentUser() user: Principal,
    @Body(new ZodBody(declareEstablishmentPayload)) payload: DeclareEstablishmentPayload,
  ): Promise<DeclaredEstablishmentResponse> {
    const companyId = await this.commands.execute<DeclareMyEstablishmentCommand, string>(
      new DeclareMyEstablishmentCommand(
        user.userId,
        payload.firstName,
        payload.lastName,
        payload.phone,
        payload.enseigne,
      ),
    );
    return { companyId };
  }

  /**
   * Enregistre une préférence d'affichage (vue du catalogue). Renvoie le compte
   * relu, comme les autres écritures de `/me` : l'appelant garde une seule source
   * de vérité après l'écriture.
   */
  @Patch("nav-prefs")
  async updateNavPrefs(
    @CurrentUser() user: Principal,
    @Body(new ZodBody(updateNavPrefsPayload)) payload: UpdateNavPrefsPayload,
  ): Promise<AccountView> {
    await this.commands.execute<UpdateNavPreferencesCommand, void>(
      new UpdateNavPreferencesCommand(user.userId, payload.catalogueView),
    );
    return this.queries.execute<GetMyAccountQuery, AccountView>(new GetMyAccountQuery(user.userId));
  }
}
