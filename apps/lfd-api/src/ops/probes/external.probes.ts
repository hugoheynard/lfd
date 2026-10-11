import { Injectable } from "@nestjs/common";

import { AppConfig } from "../../platform/config/app-config.js";
import {
  NodeProbe,
  probeHttp,
  PROBE_TIMEOUT_MS,
  type ProbeAnswer,
  type ProbeOutcome,
} from "./probe.port.js";

/** Rien à interroger : pas d'identifiants. Ce n'est pas une panne. */
function notConfigured(what: string): ProbeOutcome {
  return { verdict: "unknown", latencyMs: 0, detail: `${what} non configuré` };
}

/**
 * **Auth0** — par son JWKS, l'annuaire public de clés.
 *
 * Aucun secret n'entre dans cet appel, et c'est exactement l'URL que le
 * vérificateur de jetons interroge en production : si elle tombe, plus personne
 * ne se connecte. On sonde donc la porte par laquelle tout le monde passe, pas
 * une route d'état choisie pour être verte.
 */
@Injectable()
export class Auth0Probe extends NodeProbe {
  readonly id = "auth0";

  constructor(private readonly config: AppConfig) {
    super();
  }

  check(): Promise<ProbeOutcome> {
    const domain = this.config.auth0Domain();
    if (domain === "") {
      return Promise.resolve(notConfigured("Auth0"));
    }
    return probeHttp(
      () =>
        fetch(`https://${domain}/.well-known/jwks.json`, {
          signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
        }),
      Date.now(),
    );
  }
}

/**
 * **Resend** — par la liste de ses domaines.
 *
 * Un `200` prouve trois choses d'un coup, et la troisième est celle qu'on ne
 * voit jamais autrement : le service répond, **notre clé est encore valide**, et
 * le domaine d'expédition existe toujours. Une clé révoquée ne se manifeste
 * aujourd'hui qu'au premier e-mail qui ne part pas — c'est-à-dire trop tard, et
 * chez quelqu'un qui attendait une invitation.
 */
@Injectable()
export class ResendProbe extends NodeProbe {
  readonly id = "resend";

  constructor(private readonly config: AppConfig) {
    super();
  }

  check(): Promise<ProbeOutcome> {
    const { apiKey } = this.config.mailerConfig();
    if (apiKey === null) {
      return Promise.resolve(notConfigured("Resend"));
    }
    return probeHttp(
      () =>
        fetch("https://api.resend.com/domains", {
          headers: { Authorization: `Bearer ${apiKey}` },
          signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
        }),
      Date.now(),
      resendReachable,
    );
  }
}

/** Le nom d'erreur que Resend rend à une clé « envoi seulement ». */
const RESEND_RESTRICTED_KEY = "restricted_api_key";

/**
 * Une clé Resend **« sending access »** n'a pas le droit de lister les
 * domaines : `401` avec `{"name":"restricted_api_key",…}`. Le service a
 * répondu et la clé est reconnue — elle envoie, elle ne lit pas. Constaté en
 * production le 2026-10-11 : la carte disait Resend injoignable pendant que
 * 29 e-mails partaient. Un `401` sans ce nom est une clé morte, et reste tombé.
 */
export function resendReachable(answer: ProbeAnswer): string | null {
  if (answer.status !== 401) {
    return null;
  }
  return errorNameOf(answer.body) === RESEND_RESTRICTED_KEY
    ? "clé restreinte (envoi seulement)"
    : null;
}

/** Le champ `name` d'un corps d'erreur JSON, `null` s'il n'y en a pas. */
function errorNameOf(body: string): string | null {
  try {
    const parsed: unknown = JSON.parse(body);
    if (typeof parsed === "object" && parsed !== null && "name" in parsed) {
      return typeof parsed.name === "string" ? parsed.name : null;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * **Stripe** — par le solde du compte.
 *
 * L'appel authentifié le plus léger de leur API, et il ne bouge rien. Même
 * bénéfice que pour Resend : il éprouve la clé autant que le service, et une
 * clé tournée ou révoquée (`401`) se voit ici plutôt qu'au moment d'un
 * paiement. Une clé **restreinte** sans `balance:read` rend `403` : Stripe l'a
 * reconnue, il refuse seulement cette lecture — joignable.
 */
@Injectable()
export class StripeProbe extends NodeProbe {
  readonly id = "stripe";

  constructor(private readonly config: AppConfig) {
    super();
  }

  check(): Promise<ProbeOutcome> {
    const stripe = this.config.stripeConfig();
    if (stripe === null) {
      return Promise.resolve(notConfigured("Stripe"));
    }
    return probeHttp(
      () =>
        fetch("https://api.stripe.com/v1/balance", {
          headers: { Authorization: `Bearer ${stripe.secretKey}` },
          signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
        }),
      Date.now(),
      stripeReachable,
    );
  }
}

/**
 * Stripe rend `403` à une clé **reconnue** à qui manque une permission, `401`
 * à une clé inconnue ou révoquée. Seul le premier prouve que le service nous
 * sert encore (constaté en production le 2026-10-11 : « accès refusé (403) »
 * sur une clé restreinte qui encaissait).
 */
export function stripeReachable(answer: ProbeAnswer): string | null {
  return answer.status === 403 ? "clé restreinte (lecture du solde refusée)" : null;
}

/**
 * **Stockage R2** — par le domaine public des images.
 *
 * Une requête **anonyme** : aucune clé n'y entre, rien n'y est écrit. C'est la
 * porte par laquelle la boutique et le back-office affichent chaque photo ; si
 * elle tombe, les fiches s'affichent sans image. Un `HEAD` sur la racine n'y
 * trouve aucun objet : le `404` que R2 rend alors prouve que le domaine est
 * relié au bucket et servi — c'est tout ce qu'on lui demande. Un `401`/`403`
 * (accès public retiré) ou un `5xx` le font tomber.
 */
@Injectable()
export class R2Probe extends NodeProbe {
  readonly id = "r2";

  constructor(private readonly config: AppConfig) {
    super();
  }

  check(): Promise<ProbeOutcome> {
    const base = this.config.mediaPublicBaseUrl();
    if (base === null) {
      return Promise.resolve(notConfigured("Domaine public des images (R2)"));
    }
    return probeHttp(
      () =>
        fetch(base, {
          method: "HEAD",
          signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
        }),
      Date.now(),
      r2Reachable,
    );
  }
}

/** Un `404` sur le domaine public : servi, sans objet à cet endroit. */
export function r2Reachable(answer: ProbeAnswer): string | null {
  return answer.status === 404 ? "domaine public servi" : null;
}
