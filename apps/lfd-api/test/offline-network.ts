/**
 * 🔴 Une e2e ne sort pas sur Internet.
 *
 * Le 2026-10-26, chaque société semée avec un SIRET déclenchait, en tâche de
 * fond, un appel à `recherche-entreprises.api.gouv.fr` — 83 appels pour un
 * seul « Tout recharger ». Cette API publique est limitée en débit par IP, et
 * vingt shards de CI partagent leurs adresses de sortie : un appel restait
 * parfois sans réponse, et `fetch`, sans délai, l'attendait cinq minutes.
 * `drain()` attendait la tâche, le hook expirait, jamais la même suite deux
 * fois, jamais en local.
 *
 * Deux gestes, dans l'ordre de la hiérarchie des garde-fous :
 *
 * 1. les annuaires d'entreprises sont DOUBLÉS par défaut dans le harnais,
 *    comme la signature Auth0 et le stockage R2 : un tiers distant n'est pas
 *    ce qu'une e2e éprouve ;
 * 2. tout `fetch` vers un hôte qui n'est pas la machine locale ÉCHOUE tout de
 *    suite, en nommant l'URL — le prochain adaptateur réseau oublié se verra
 *    au premier passage, pas au hasard d'une CI lente.
 */
import { EstablishmentDirectory } from "../src/b2b/account/domain/ports/establishment-directory.js";
import { MarketDirectory } from "../src/b2b/growth/domain/ports/market-directory.js";

/** Les hôtes qu'une e2e peut joindre : la machine qui la fait tourner. */
const LOCAL_HOSTS: ReadonlySet<string> = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);

/** Un appel réseau sortant pendant une e2e — toujours une faute du harnais. */
export class OutboundNetworkInE2eError extends Error {
  constructor(readonly url: string) {
    super(
      `e2e : appel réseau sortant refusé vers ${url}. Une e2e ne sort pas sur Internet — ` +
        "doubler le port de l'adaptateur dans le harnais (test/offline-network.ts).",
    );
    this.name = "OutboundNetworkInE2eError";
  }
}

function urlOf(input: Parameters<typeof fetch>[0]): string {
  if (typeof input === "string") {
    return input;
  }
  return input instanceof URL ? input.href : input.url;
}

/** Vrai si l'URL vise la machine locale. */
export function isLocalUrl(url: string): boolean {
  try {
    return LOCAL_HOSTS.has(new URL(url).hostname);
  } catch {
    return false;
  }
}

let installed = false;

/** Pose le refus une fois par processus (un worker Jest enchaîne les suites). */
export function forbidOutboundFetch(): void {
  if (installed) {
    return;
  }
  installed = true;
  const original = globalThis.fetch;
  globalThis.fetch = (input, init) => {
    const url = urlOf(input);
    if (!isLocalUrl(url)) {
      return Promise.reject(new OutboundNetworkInE2eError(url));
    }
    return original(input, init);
  };
}

/** L'annuaire des établissements hors ligne : aucun NAF n'est connu. */
export class OfflineEstablishmentDirectory extends EstablishmentDirectory {
  resolveNaf(): Promise<string | null> {
    return Promise.resolve(null);
  }
}

/** L'annuaire du marché hors ligne : le compter demanderait le réseau. */
export class OfflineMarketDirectory extends MarketDirectory {
  countEstablishments(nafCode: string, codePostal: string): Promise<number> {
    return Promise.reject(
      new OutboundNetworkInE2eError(`recherche-entreprises (${nafCode}/${codePostal})`),
    );
  }
}
