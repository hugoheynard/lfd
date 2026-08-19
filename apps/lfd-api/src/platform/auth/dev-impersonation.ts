import { Injectable, UnauthorizedException } from "@nestjs/common";
import { AppConfig } from "../config/app-config.js";
import { PrismaService } from "../database/prisma.service.js";
import type { AuthenticatedRequest, VerifiedToken } from "./principal.js";

/** En-tête HTTP (minuscule, comme le normalise Express) qui surcharge le sujet. */
const IMPERSONATE_HEADER = "x-dev-impersonate";

/**
 * Impersonation de **DÉVELOPPEMENT** — fabrique un `VerifiedToken` synthétique
 * pour un `User` choisi, sans vérifier aucune signature Auth0.
 *
 * C'est un bypass d'authentification, volontairement isolé du chemin de
 * production : le guard ne l'emprunte que si `enabled` est vrai, et `enabled`
 * ne peut l'être qu'en local (le garde-fou `NODE_ENV=production` vit dans
 * `AppConfig`). Le sujet vient de l'en-tête `X-Dev-Impersonate` s'il est
 * présent, sinon du défaut `AUTH_DEV_IMPERSONATE_SUBJECT`. Il peut être un
 * `auth0_sub` ou un **e-mail** — on le résout contre notre base pour retomber
 * sur le vrai `auth0_sub`, que le `CustomerPrincipalResolver` sait ensuite enrichir.
 */
@Injectable()
export class DevImpersonation {
  /** Vrai si l'impersonation est active (jamais en production). */
  readonly enabled: boolean;
  private readonly defaultSubject: string | null;

  constructor(
    config: AppConfig,
    private readonly prisma: PrismaService,
  ) {
    const settings = config.devImpersonation();
    this.enabled = settings !== null;
    this.defaultSubject = settings?.subject ?? null;
  }

  /**
   * Jeton « vérifié » synthétique pour l'utilisateur à impersonater.
   * @throws UnauthorizedException si aucun sujet n'est fourni, ou introuvable.
   */
  async verifiedToken(request: AuthenticatedRequest): Promise<VerifiedToken> {
    const subject = await this.resolveSubject(this.identifier(request));
    return { subject, scopes: [] };
  }

  /** Sujet demandé : l'en-tête l'emporte, sinon le défaut d'environnement. */
  private identifier(request: AuthenticatedRequest): string {
    const header = request.headers[IMPERSONATE_HEADER];
    const fromHeader = Array.isArray(header) ? header[0] : header;
    const value = (fromHeader ?? this.defaultSubject ?? "").trim();
    if (value === "") {
      throw new UnauthorizedException(
        "Impersonation active mais aucun sujet : renseignez AUTH_DEV_IMPERSONATE_SUBJECT " +
          "ou l'en-tête X-Dev-Impersonate.",
      );
    }
    return value;
  }

  /** Résout un identifiant (e-mail ou `auth0_sub`) en `auth0_sub` réel. */
  private async resolveSubject(identifier: string): Promise<string> {
    const user = identifier.includes("@")
      ? await this.prisma.user.findFirst({ where: { email: identifier } })
      : await this.prisma.user.findUnique({ where: { auth0Sub: identifier } });
    if (user === null) {
      throw new UnauthorizedException(`Impersonation : utilisateur introuvable (${identifier}).`);
    }
    return user.auth0Sub;
  }
}
