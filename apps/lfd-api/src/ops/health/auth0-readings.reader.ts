import { Injectable, Logger } from "@nestjs/common";
import type { NodeReading } from "@lfd/ops-contract";

import { Auth0ManagementClient } from "../../platform/identity/auth0-management.client.js";

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

  constructor(private readonly management: Auth0ManagementClient) {}

  async read(): Promise<readonly NodeReading[]> {
    const active = await this.count("/api/v2/stats/active-users");
    if (active !== null) {
      return [reading("Actifs 30 j", active, "la mesure que le plan facture")];
    }
    const total = await this.count("/api/v2/users?per_page=1&include_totals=true");
    if (total !== null) {
      return [
        reading(
          "Identités",
          total,
          "total du tenant — un MAJORANT des actifs. Accorder `read:stats` à l'application M2M rendrait la mesure exacte",
        ),
      ];
    }
    return [];
  }

  /** Un décompte, ou `null` si Auth0 n'en donne pas — jamais une exception. */
  private async count(path: string): Promise<number | null> {
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
