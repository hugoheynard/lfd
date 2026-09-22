import type { LoginMethodsView } from "@lfd/contracts";
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
} from "@nestjs/common";
import { CommandBus, QueryBus } from "@nestjs/cqrs";

import { CurrentUser } from "../../../platform/auth/current-user.decorator.js";
import type { Principal } from "../../../platform/auth/principal.js";
import { ZodBody } from "../../../platform/shared/http/zod-body.pipe.js";
import { DeclareMyEstablishmentCommand } from "../application/commands/declare-my-establishment.command.js";
import { LinkLoginMethodCommand } from "../application/commands/link-login-method.command.js";
import { RevokeLoginMethodCommand } from "../application/commands/revoke-login-method.command.js";
import { ListMyLoginMethodsQuery } from "../application/queries/list-my-login-methods.query.js";
import { UpdateMyProfileCommand } from "../application/commands/update-my-profile.command.js";
import { UpdateNavPreferencesCommand } from "../application/commands/update-nav-preferences.command.js";
import { GetMyAccountQuery } from "../application/queries/get-my-account.query.js";
import type { AccountView } from "../domain/ports/account.reader.js";
import type { NavPreferencesPatch } from "../domain/value-objects/nav-preferences.js";
import {
  declareEstablishmentPayload,
  type DeclareEstablishmentPayload,
  linkLoginMethodPayload,
  type LinkLoginMethodPayload,
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
   * Change une ou plusieurs préférences (vue du catalogue, espace de travail) —
   * un patch, les clés absentes restent telles quelles. Renvoie le compte relu,
   * comme les autres écritures de `/me` : l'appelant garde une seule source de
   * vérité après l'écriture. 409 si l'espace désigne une société étrangère.
   */
  @Patch("nav-prefs")
  async updateNavPrefs(
    @CurrentUser() user: Principal,
    @Body(new ZodBody(updateNavPrefsPayload)) payload: UpdateNavPrefsPayload,
  ): Promise<AccountView> {
    await this.commands.execute<UpdateNavPreferencesCommand, void>(
      new UpdateNavPreferencesCommand(
        user.userId,
        user.memberships.map((membership) => membership.companyId),
        toNavPreferencesPatch(payload),
      ),
    );
    return this.queries.execute<GetMyAccountQuery, AccountView>(new GetMyAccountQuery(user.userId));
  }

  /**
   * Les méthodes de connexion actuelles.
   *
   * ⚠️ **Elle ne passe pas par `/me`**, et c'est une décision : la liste est
   * tenue par le fournisseur d'identité, donc la servir à l'amorçage mettrait un
   * appel réseau sortant sur le chemin de **toutes** les pages, pour une
   * information que seul le profil affiche (plan
   * `documentation/auth-inscription/plan-rattachement-depuis-le-profil.md`, R6).
   */
  @Get("identities")
  identities(@CurrentUser() user: Principal): Promise<LoginMethodsView> {
    return this.queries.execute<ListMyLoginMethodsQuery, LoginMethodsView>(
      new ListMyLoginMethodsQuery(user.subject),
    );
  }

  /**
   * Rattache une méthode de connexion de plus au même compte, sur preuve.
   *
   * Le corps porte un `id_token` : la preuve que la même personne tient les deux
   * sessions. L'adresse du compte tiers n'est ni lue, ni comparée, ni recopiée —
   * une adresse ne rattache rien, et c'est ce qui rend impossible de s'approprier
   * un compte en écrivant son adresse quelque part (R2).
   *
   * Renvoie la liste relue, comme les autres écritures de `/me` : l'appelant
   * garde une seule source de vérité après l'écriture.
   */
  @Post("identities")
  @HttpCode(HttpStatus.OK)
  async linkIdentity(
    @CurrentUser() user: Principal,
    @Body(new ZodBody(linkLoginMethodPayload)) payload: LinkLoginMethodPayload,
  ): Promise<LoginMethodsView> {
    await this.commands.execute<LinkLoginMethodCommand, void>(
      new LinkLoginMethodCommand(user.userId, user.subject, payload.idToken),
    );
    return this.queries.execute<ListMyLoginMethodsQuery, LoginMethodsView>(
      new ListMyLoginMethodsQuery(user.subject),
    );
  }

  /**
   * Retire une méthode de connexion, **désignée par son nom de connexion**.
   *
   * 🔴 `google-oauth2`, jamais un identifiant Auth0. C'est la raison d'être de
   * cette forme d'URL : un identifiant chez un tiers dans un chemin s'écrit dans
   * tous les journaux d'accès, et c'est la panne du 2026-09-18 sous une autre
   * forme (plan cité, §9.5). L'API retrouve elle-même l'identifiant secondaire en
   * relisant les méthodes du compte ; le nom de connexion, lui, est déjà public —
   * il voyage dans chaque URL d'autorisation et dans le bundle du front.
   *
   * ⚠️ Détacher ne supprime rien chez le fournisseur : l'identité redevient un
   * compte autonome. L'écran doit le dire, pas le laisser deviner.
   */
  @Delete("identities/:provider")
  async revokeIdentity(
    @CurrentUser() user: Principal,
    @Param("provider") provider: string,
  ): Promise<LoginMethodsView> {
    await this.commands.execute<RevokeLoginMethodCommand, void>(
      new RevokeLoginMethodCommand(user.userId, user.subject, provider),
    );
    return this.queries.execute<ListMyLoginMethodsQuery, LoginMethodsView>(
      new ListMyLoginMethodsQuery(user.subject),
    );
  }
}

/**
 * Ne garde que les clés présentes : Zod rend `undefined` pour une clé absente,
 * et `exactOptionalPropertyTypes` distingue les deux — un `undefined` passé au
 * dépôt n'aurait rien d'un « ne pas toucher ».
 */
function toNavPreferencesPatch(payload: UpdateNavPrefsPayload): NavPreferencesPatch {
  return {
    ...(payload.catalogueView === undefined ? {} : { catalogueView: payload.catalogueView }),
    ...(payload.workspace === undefined ? {} : { workspace: payload.workspace }),
  };
}
