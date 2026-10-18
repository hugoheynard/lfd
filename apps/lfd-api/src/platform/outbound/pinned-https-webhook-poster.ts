import { Buffer } from "node:buffer";
import { request as httpsRequest } from "node:https";
import type { IncomingMessage } from "node:http";
import { isIP, type LookupFunction } from "node:net";

import { Injectable } from "@nestjs/common";

import { HostResolver, type ResolvedAddress } from "./host-resolver.js";
import { CLOSED_ADDRESS_LABELS, classifyAddress } from "./public-address.js";
import { WebhookPoster, type WebhookPost, type WebhookPostOutcome } from "./webhook-poster.js";

/** Le délai TOTAL d'un envoi, connexion comprise (S2). */
export const WEBHOOK_TIMEOUT_MS = 5_000;
/** On ne lit pas la réponse : au-delà de ces quelques octets, on coupe. */
export const WEBHOOK_MAX_RESPONSE_BYTES = 4_096;

const HTTP_OK_MIN = 200;
const HTTP_OK_MAX = 299;

/**
 * **Le relais HTTP sortant, épinglé** (plan vitrine, S2).
 *
 * 1. `https` seul.
 * 2. Le nom est résolu ICI, et TOUTES ses adresses sont vérifiées
 *    (`classifyAddress`) : une seule privée suffit à refuser — un DNS qui
 *    rend une publique et une privée choisirait l'une ou l'autre.
 * 3. L'adresse vérifiée est **épinglée** pour la connexion (`lookup` rend
 *    toujours elle) : sans ça, la connexion résoudrait une seconde fois, et
 *    un DNS de courte durée pourrait répondre autre chose entre les deux
 *    (« rebinding »). Le certificat reste vérifié sur le NOM (`servername`).
 * 4. Aucune redirection n'est suivie : un 3xx est une réponse refusée.
 * 5. Cinq secondes en tout ; la réponse n'est pas lue au-delà de 4 Kio.
 * 6. Pas d'agent partagé : une socket réutilisée pourrait viser une autre
 *    adresse que celle qu'on vient de vérifier.
 */
@Injectable()
export class PinnedHttpsWebhookPoster extends WebhookPoster {
  constructor(private readonly resolver: HostResolver) {
    super();
  }

  async post(post: WebhookPost): Promise<WebhookPostOutcome> {
    const url = parsedUrl(post.url);
    if (url === null) {
      return { kind: "refused", reason: "adresse illisible" };
    }
    if (url.protocol !== "https:") {
      return { kind: "refused", reason: "seul https est accepté" };
    }
    const hostname = url.hostname.replace(/^\[|\]$/g, "");
    const resolved = await this.addressesOf(hostname);
    if ("kind" in resolved) {
      return resolved;
    }
    for (const candidate of resolved) {
      const verdict = classifyAddress(candidate.address);
      if (!verdict.open) {
        return {
          kind: "refused",
          reason: `${hostname} désigne ${CLOSED_ADDRESS_LABELS[verdict.reason]} (${candidate.address})`,
        };
      }
    }
    const [pinned] = resolved;
    if (pinned === undefined) {
      return { kind: "unreachable", reason: `${hostname} ne se résout en aucune adresse` };
    }
    return send(url, hostname, pinned, post);
  }

  private async addressesOf(
    hostname: string,
  ): Promise<readonly ResolvedAddress[] | WebhookPostOutcome> {
    const literal = isIP(hostname);
    if (literal !== 0) {
      return [{ address: hostname, family: literal === 6 ? 6 : 4 }];
    }
    try {
      return await this.resolver.resolve(hostname);
    } catch {
      return { kind: "unreachable", reason: `${hostname} est introuvable (DNS)` };
    }
  }
}

function parsedUrl(raw: string): URL | null {
  try {
    return new URL(raw);
  } catch {
    return null;
  }
}

/** Rend TOUJOURS l'adresse vérifiée, sous la forme que demande l'appelant. */
function pinnedLookup(pinned: ResolvedAddress): LookupFunction {
  return (_hostname, options, callback) => {
    if (options.all === true) {
      callback(null, [{ address: pinned.address, family: pinned.family }]);
      return;
    }
    callback(null, pinned.address, pinned.family);
  };
}

function send(
  url: URL,
  hostname: string,
  pinned: ResolvedAddress,
  post: WebhookPost,
): Promise<WebhookPostOutcome> {
  return new Promise((resolve) => {
    let settled = false;
    const settle = (outcome: WebhookPostOutcome): void => {
      if (!settled) {
        settled = true;
        resolve(outcome);
      }
    };
    const request = httpsRequest(
      {
        hostname,
        port: url.port === "" ? 443 : Number(url.port),
        path: `${url.pathname}${url.search}`,
        method: "POST",
        headers: {
          ...post.headers,
          "content-type": "application/json",
          "content-length": String(Buffer.byteLength(post.body, "utf8")),
        },
        lookup: pinnedLookup(pinned),
        ...(isIP(hostname) === 0 ? { servername: hostname } : {}),
        agent: false,
        signal: AbortSignal.timeout(WEBHOOK_TIMEOUT_MS),
      },
      (response) => settle(drained(response)),
    );
    request.on("error", (error: Error) => {
      const reason =
        error.name === "AbortError" || error.name === "TimeoutError"
          ? `pas de réponse en ${String(WEBHOOK_TIMEOUT_MS / 1000)} s`
          : `connexion refusée (${error.message.slice(0, 120)})`;
      settle({ kind: "unreachable", reason });
    });
    request.end(post.body);
  });
}

/** Le statut suffit ; la réponse est jetée, et coupée si elle déborde. */
function drained(response: IncomingMessage): WebhookPostOutcome {
  let read = 0;
  response.on("data", (chunk: Buffer) => {
    read += chunk.length;
    if (read > WEBHOOK_MAX_RESPONSE_BYTES) {
      response.destroy();
    }
  });
  // Le statut est déjà lu : une coupure (la nôtre, au-delà de la borne) ne change rien.
  response.on("error", () => undefined);
  response.resume();
  const status = response.statusCode ?? 0;
  return status >= HTTP_OK_MIN && status <= HTTP_OK_MAX
    ? { kind: "accepted", status }
    : { kind: "rejected", status };
}
