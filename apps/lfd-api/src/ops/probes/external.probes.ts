import { Injectable } from "@nestjs/common";

import { AppConfig } from "../../platform/config/app-config.js";
import { NodeProbe, probeHttp, PROBE_TIMEOUT_MS, type ProbeOutcome } from "./probe.port.js";

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
    );
  }
}

/**
 * **Stripe** — par le solde du compte.
 *
 * L'appel authentifié le plus léger de leur API, et il ne bouge rien. Même
 * bénéfice que pour Resend : il éprouve la clé autant que le service, et une
 * clé restreinte ou tournée se voit ici plutôt qu'au moment d'un paiement.
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
    );
  }
}

/**
 * **Shopify** — par le point d'entrée de la boutique.
 *
 * Sans identifiants, le canal de publication est éteint et la carte le dit :
 * `unknown`, pas `down`. Une vitrine qu'on n'a pas branchée n'est pas une
 * vitrine en panne.
 */
@Injectable()
export class ShopifyProbe extends NodeProbe {
  readonly id = "shopify";

  constructor(private readonly config: AppConfig) {
    super();
  }

  check(): Promise<ProbeOutcome> {
    if (!this.config.hasShopifyCredentials()) {
      return Promise.resolve(notConfigured("Shopify"));
    }
    return probeHttp(
      () =>
        fetch("https://shopify.com/", {
          method: "HEAD",
          signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
        }),
      Date.now(),
    );
  }
}
