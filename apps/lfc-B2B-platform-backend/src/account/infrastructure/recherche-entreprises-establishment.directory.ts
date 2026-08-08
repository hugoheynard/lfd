import { Injectable } from "@nestjs/common";

import { EstablishmentDirectory } from "../domain/ports/establishment-directory.js";

/**
 * Adaptateur **API Recherche d'entreprises** (recherche-entreprises.api.gouv.fr) —
 * publique, gratuite, sans authentification. Résout le code NAF d'un SIRET : on
 * cherche par `q=<siret>` et on lit l'`activite_principale` de l'établissement
 * correspondant (à défaut, du siège, puis de l'unité légale). Best-effort : toute
 * erreur réseau/HTTP ou SIRET introuvable rend `null` (on n'écrase jamais une
 * valeur connue par un échec — géré côté appelant).
 */
@Injectable()
export class RechercheEntreprisesEstablishmentDirectory extends EstablishmentDirectory {
  private readonly base = "https://recherche-entreprises.api.gouv.fr/search";

  async resolveNaf(siret: string): Promise<string | null> {
    const url = `${this.base}?q=${encodeURIComponent(siret)}&page=1&per_page=1`;
    try {
      const res = await fetch(url, { headers: { accept: "application/json" } });
      if (!res.ok) {
        return null;
      }
      return readNaf(await res.json(), siret);
    } catch {
      return null;
    }
  }
}

/** Lit le NAF du 1er résultat : établissement correspondant → siège → unité légale. */
function readNaf(body: unknown, siret: string): string | null {
  const result = firstResult(body);
  if (result === null) {
    return null;
  }
  const matched = matchingEstablishment(result, siret);
  return naf(matched) ?? naf(asRecord(result["siege"])) ?? naf(result) ?? null;
}

/** Le 1er élément de `results`, comme record, ou `null`. */
function firstResult(body: unknown): Record<string, unknown> | null {
  const root = asRecord(body);
  const results = root === null ? null : root["results"];
  if (!Array.isArray(results) || results.length === 0) {
    return null;
  }
  return asRecord(results[0]);
}

/** L'établissement de `matching_etablissements` au SIRET demandé, ou `null`. */
function matchingEstablishment(
  result: Record<string, unknown>,
  siret: string,
): Record<string, unknown> | null {
  const list = result["matching_etablissements"];
  if (!Array.isArray(list)) {
    return null;
  }
  for (const raw of list) {
    const etab = asRecord(raw);
    if (etab !== null && etab["siret"] === siret) {
      return etab;
    }
  }
  return null;
}

/** L'`activite_principale` (NAF) d'un noeud, si c'est une chaîne non vide. */
function naf(node: Record<string, unknown> | null): string | null {
  if (node === null) {
    return null;
  }
  const value = node["activite_principale"];
  return typeof value === "string" && value !== "" ? value : null;
}

/** Garde structurelle : un objet JSON simple, ou `null`. */
function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}
