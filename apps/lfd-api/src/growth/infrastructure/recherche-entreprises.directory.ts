import { Injectable } from "@nestjs/common";

import { MarketDirectory } from "../domain/ports/market-directory.js";

/**
 * Adaptateur **API Recherche d'entreprises** (recherche-entreprises.api.gouv.fr) —
 * l'API publique data.gouv, gratuite et sans authentification. On filtre par
 * `activite_principale` (code NAF) + `code_postal` et on lit `total_results` = le
 * nombre d'acteurs. Un appel par (NAF × zone) ; l'appelant les enchaîne en séquence
 * (auto-throttling sous la limite de l'API).
 */
@Injectable()
export class RechercheEntreprisesDirectory extends MarketDirectory {
  private readonly base = "https://recherche-entreprises.api.gouv.fr/search";

  async countEstablishments(nafCode: string, codePostal: string): Promise<number> {
    const url =
      `${this.base}?activite_principale=${encodeURIComponent(nafCode)}` +
      `&code_postal=${encodeURIComponent(codePostal)}&page=1&per_page=1`;
    const res = await fetch(url, { headers: { accept: "application/json" } });
    if (!res.ok) {
      throw new Error(
        `recherche-entreprises a répondu ${res.status} pour ${nafCode}/${codePostal}`,
      );
    }
    const body: unknown = await res.json();
    return readTotalResults(body);
  }
}

/** Lit `total_results` de la réponse, 0 si absent/non numérique. */
function readTotalResults(body: unknown): number {
  if (typeof body === "object" && body !== null && !Array.isArray(body)) {
    const total = (body as Record<string, unknown>)["total_results"];
    return typeof total === "number" && Number.isFinite(total) ? total : 0;
  }
  return 0;
}
