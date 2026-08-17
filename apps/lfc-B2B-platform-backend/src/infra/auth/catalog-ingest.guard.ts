import { timingSafeEqual } from "node:crypto";
import {
  Injectable,
  UnauthorizedException,
  type CanActivate,
  type ExecutionContext,
} from "@nestjs/common";

import { AppConfig } from "../config/app-config.js";
import { attachActor } from "../context/request-context.store.js";

/** En-tête où le PIM dépose le secret partagé. */
const CATALOG_HEADER = "x-lfc-catalog-secret";

/** Requête réduite à ce que le guard lit (les en-têtes). */
interface IngestRequest {
  readonly headers: Record<string, string | string[] | undefined>;
}

/**
 * Guard de l'**ingestion de catalogue** : porte machine-à-machine, distincte de
 * la porte staff et de celle du recompute.
 *
 * Le secret ne garde pas la porte d'entrée — les deux backends sont déjà
 * derrière la passerelle (`workers.dev` fermé). Ce qu'il empêche, c'est qu'un
 * appelant **déjà admis** réécrive le catalogue vendu.
 *
 * Deux chemins, comme les autres gardes :
 * - **bypass de DÉVELOPPEMENT** (`adminDevBypass`, fail-closed en prod) ;
 * - **prod** : compare l'en-tête au secret. Secret non configuré ⇒ **refus**
 *   (fail-closed : jamais d'endpoint d'écriture grand ouvert).
 */
@Injectable()
export class CatalogIngestGuard implements CanActivate {
  constructor(private readonly config: AppConfig) {}

  canActivate(context: ExecutionContext): boolean {
    if (this.config.adminDevBypass()) {
      attachActor({ type: "system", id: "catalog-ingest-dev" });
      return true;
    }

    const request = context.switchToHttp().getRequest<IngestRequest>();
    const expected = this.config.catalogIngestSecret();
    const provided = headerValue(request.headers[CATALOG_HEADER]);
    if (expected === null || !matches(expected, provided)) {
      throw new UnauthorizedException("Secret de catalogue invalide ou manquant.");
    }

    attachActor({ type: "system", id: "catalog-ingest-pim" });
    return true;
  }
}

/**
 * Comparaison à **temps constant**.
 *
 * Un `===` sur une chaîne s'arrête au premier caractère différent : le temps de
 * réponse fuit alors la longueur du préfixe correct, et un attaquant patient
 * reconstruit le secret octet par octet. L'attaque est difficile à travers le
 * réseau, mais la parade coûte trois lignes — il n'y a pas d'arbitrage à faire.
 *
 * La longueur est comparée **avant** : `timingSafeEqual` lève sur des tampons de
 * tailles différentes. Cette fuite-là est sans valeur (la longueur d'un secret
 * n'aide pas à le deviner).
 */
function matches(expected: string, provided: string | undefined): boolean {
  if (provided === undefined) {
    return false;
  }
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(provided, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Normalise un en-tête (une valeur ou une liste) en chaîne trimée. */
function headerValue(raw: string | string[] | undefined): string | undefined {
  const first = Array.isArray(raw) ? raw[0] : raw;
  return first?.trim();
}
