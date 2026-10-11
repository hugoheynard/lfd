import { Injectable, Logger } from "@nestjs/common";
import type { NodeReading } from "@lfd/ops-contract";

import { Auth0ManagementClient } from "../../platform/identity/auth0-management.client.js";
import { IdentityProviderScopeMissingError } from "../../platform/shared/errors/identity-errors.js";
import { Clock } from "../../platform/time/clock.js";

const ACTIVE_USERS_PATH = "/api/v2/stats/active-users";
const TOTAL_USERS_PATH = "/api/v2/users?per_page=1&include_totals=true";

/**
 * Combien de temps on croit un refus de portée avant de redemander.
 *
 * Une heure, ni « jusqu'au redémarrage » ni rien : la portée se coche dans le
 * dashboard sans redéployer, et l'écran doit finir par le voir tout seul. Mais
 * le refus ne change pas d'un rafraîchissement (15 s) à l'autre — le redemander
 * à chacun écrivait une ligne d'erreur toutes les 15 s (symptôme du 2026-10-11).
 * Le jeton M2M étant lui-même gardé jusqu'à son expiration, une portée cochée
 * n'apparaît de toute façon qu'au jeton suivant.
 */
export const SCOPE_REFUSAL_MEMORY_MS = 60 * 60 * 1000;

/**
 * **Le plafond du plan gratuit Auth0**, en utilisateurs actifs sur trente jours.
 *
 * Vérifié le 2026-08-19 sur `auth0.com/pricing`. Écrit ici plutôt que deviné :
 * un pourcentage sans dénominateur ne veut rien dire, et un dénominateur
 * inventé ment avec assurance. Le jour où le plan change, c'est cette ligne.
 */
export const AUTH0_FREE_MAU = 25_000;

/**
 * **Où on en est du plan Auth0.**
 *
 * Deux mesures possibles, et elles ne disent PAS la même chose :
 *
 * - `stats/active-users` rend les **actifs sur 30 jours** — exactement l'unité
 *   facturée. Elle demande le périmètre `read:stats`, que l'application M2M n'a
 *   pas forcément ;
 * - le total d'identités du tenant, lisible avec `read:users` qu'on a déjà. Ce
 *   n'est pas la même chose : c'est un **majorant** — tout compte dormant y
 *   entre.
 *
 * On tente la première, on retombe sur la seconde, et le **libellé dit
 * laquelle** est affichée. Présenter un majorant sous le nom de la mesure
 * facturée serait rassurant les mois où ça compte.
 */
@Injectable()
export class Auth0ReadingsReader {
  private readonly logger = new Logger(Auth0ReadingsReader.name);
  /** Instant jusqu'auquel on ne redemande pas `stats/active-users` (refus de portée). */
  private activeUsersRefusedUntilMs: number | null = null;

  constructor(
    private readonly management: Auth0ManagementClient,
    private readonly clock: Clock,
  ) {}

  async read(): Promise<readonly NodeReading[]> {
    const active = await this.activeUsers();
    if (active !== null) {
      return [reading("Actifs 30 j", active, "la mesure que le plan facture")];
    }
    const total = await this.count(TOTAL_USERS_PATH);
    if (total !== null) {
      return [
        reading(
          "Identités",
          total,
          "droit read:stats manquant — total du tenant, un MAJORANT des actifs. Cocher read:stats pour l'application M2M dans Auth0 → APIs → Auth0 Management API rendrait la mesure exacte",
        ),
      ];
    }
    return [];
  }

  /** Les actifs 30 j, sauf si Auth0 nous a refusé la portée il y a moins d'une heure. */
  private async activeUsers(): Promise<number | null> {
    const nowMs = this.clock.now().getTime();
    if (this.activeUsersRefusedUntilMs !== null && nowMs < this.activeUsersRefusedUntilMs) {
      return null;
    }
    try {
      return await this.count(ACTIVE_USERS_PATH, { rethrowScope: true });
    } catch (error) {
      if (!(error instanceof IdentityProviderScopeMissingError)) {
        throw error;
      }
      if (this.activeUsersRefusedUntilMs === null) {
        this.logger.warn(
          `Actifs 30 j illisibles : ${error.message} Le total du tenant les remplace.`,
        );
      }
      this.activeUsersRefusedUntilMs = nowMs + SCOPE_REFUSAL_MEMORY_MS;
      return null;
    }
  }

  /** Un décompte, ou `null` si Auth0 n'en donne pas — jamais une exception. */
  private async count(
    path: string,
    options: { readonly rethrowScope: boolean } = { rethrowScope: false },
  ): Promise<number | null> {
    try {
      const body: unknown = await this.management.call("GET", path);
      if (typeof body === "number") {
        return body;
      }
      if (typeof body === "object" && body !== null && "total" in body) {
        const { total } = body;
        return typeof total === "number" ? total : null;
      }
      return null;
    } catch (error) {
      if (error instanceof IdentityProviderScopeMissingError) {
        if (options.rethrowScope) {
          throw error;
        }
        // Un refus attendu se dit en une ligne, sans pile.
        this.logger.debug(`Décompte Auth0 indisponible (${path}) : ${error.message}`);
        return null;
      }
      // Un périmètre refusé n'est pas une panne d'Auth0 : la sonde, elle, tourne
      // à côté et dit si le tenant répond. Ici on renonce à un chiffre, c'est tout.
      this.logger.debug(`Décompte Auth0 indisponible (${path})`, error);
      return null;
    }
  }
}

function reading(label: string, value: number, hint: string): NodeReading {
  const share = Math.round((value / AUTH0_FREE_MAU) * 100);
  return {
    label,
    value,
    hint: `${share} % du plafond gratuit (${AUTH0_FREE_MAU.toLocaleString("fr-FR")} actifs mensuels) — ${hint}.`,
  };
}
