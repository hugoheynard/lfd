import type request from "supertest";

/**
 * **Le total vu des modifications, confirmé pour les suites qui éprouvent autre
 * chose** — doc `documentation/commandes/modification/modifier-une-commande.md`,
 * §2.3 (R14), lot S2.b0.
 *
 * Depuis S2.b0, `expectedTotalCents` est OBLIGATOIRE sur `POST
 * /orders/:id/revisions`, `POST /admin/orders/:id/revisions` et `POST
 * /admin/customer-requests/:id/order-change/apply`. L'agent du harnais fait
 * ce que fait l'écran : il lit le DEVIS de la même modification (`…/revisions/
 * quote`, ou `…/order-change/quote` pour une demande) et envoie son total.
 * Jamais un total fabriqué : celui que le serveur a montré.
 *
 * Ce qu'il ne fait PAS : toucher un corps qui porte déjà son total. Les cas du
 * total changé l'envoient eux-mêmes, et leur refus remonte tel quel.
 *
 * Si le devis est refusé (mur, règlement, heure limite…), la modification part
 * avec un total nul : son refus se rejoue à l'identique, puisqu'il est rangé
 * avant celui du total vu (R15). Rien n'est mis en cache : une modification
 * n'a pas de clé d'idempotence, et le même corps rejoué sur une commande qui a
 * changé doit relire son devis.
 */
const REVISION = /^(?:\/admin)?\/orders\/[^/]+\/revisions$/u;
const CHANGE_APPLY = /^\/admin\/customer-requests\/[^/]+\/order-change\/apply$/u;

/** Total envoyé quand le devis est refusé pour une autre raison. */
const NO_TOTAL_CENTS = 0;

/** Vrai si cette route exige le total vu d'une modification. */
export function isSeenRevision(url: string): boolean {
  return REVISION.test(url) || CHANGE_APPLY.test(url);
}

/** Le corps qu'envoie l'écran sur cette route quand le test n'en dit pas : vide pour « Appliquer ». */
export function revisionBodyOf(body: Record<string, unknown> | null): Record<string, unknown> {
  return body ?? {};
}

/** Le TTC du devis de cette modification, ou `0` si le devis est refusé. */
export async function quotedRevisionTotal(
  fresh: () => request.Agent,
  url: string,
  headers: ReadonlyMap<string, string>,
  body: Record<string, unknown>,
): Promise<number> {
  let quote = CHANGE_APPLY.test(url)
    ? fresh().get(url.replace(/\/apply$/u, "/quote"))
    : fresh().post(`${url}/quote`);
  for (const [name, value] of headers) {
    quote = quote.set(name, value);
  }
  const { expectedRevision: _revision, ...content } = body;
  const response = CHANGE_APPLY.test(url) ? await quote : await quote.send(content);
  const quoted: unknown = response.body;
  if (
    response.status === 200 &&
    typeof quoted === "object" &&
    quoted !== null &&
    "totalCents" in quoted &&
    typeof quoted.totalCents === "number"
  ) {
    return quoted.totalCents;
  }
  return NO_TOTAL_CENTS;
}
