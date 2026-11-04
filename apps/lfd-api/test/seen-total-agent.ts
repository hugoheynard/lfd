import { ORDER_TOTAL_CHANGED } from "@lfd/contracts";
import type request from "supertest";

/**
 * **Le total vu, confirmé pour les suites qui éprouvent autre chose** — plan
 * `documentation/pricing/centime-et-tva/le-prix-d-un-panier.md`, lot T3.
 *
 * Depuis T3, `expectedTotalCents` est OBLIGATOIRE aux trois passations
 * (`POST /orders`, `/shop/orders`, `/admin/orders`). Près de trois cents appels
 * des e2e passent une commande pour éprouver autre chose — le mur, le
 * colisage, la facture — sur des paniers dont le total dépend de la scène.
 * Plutôt que de faire chiffrer chacun d'eux, l'agent du harnais fait ce que
 * fait l'écran sur un refus `orders.total_changed` : il demande à la passation
 * le total qu'elle compose (une tentative à un total qu'aucune commande
 * n'atteint, qui ne laisse rien derrière elle — le refus précède le
 * règlement et rend la clé), puis envoie la vraie requête à ce total.
 *
 * Ce qu'il ne fait PAS : toucher un corps qui porte déjà son total. Les
 * suites du total vu (`order-total-seen.e2e-spec.ts`) l'envoient elles-mêmes,
 * et leur refus remonte tel quel.
 *
 * Si la tentative est refusée pour une autre raison, la vraie requête part
 * avec un total nul : le refus se rejoue à l'identique, puisqu'il est rangé
 * avant celui du total vu.
 *
 * ⚠️ Une seule trace connue (vérifié le 2026-11-03) : `/shop/orders` inscrit
 * le porteur invité AVANT de composer (`place-shop-order.handler.ts`), donc la
 * tentative laisse une personne sans commande — exactement ce que fait un
 * client qui voit son total changer.
 */
const ORDER_PLACEMENTS: ReadonlySet<string> = new Set(["/orders", "/shop/orders", "/admin/orders"]);

/** Un total qu'aucune commande n'atteint : la tentative est refusée, et nomme le vrai. */
const UNSEEN_TOTAL_CENTS = Number.MAX_SAFE_INTEGER;

/** Total envoyé quand la tentative est refusée pour une autre raison. */
const NO_TOTAL_CENTS = 0;

/** L'IP de la tentative : la sienne, pour ne pas entamer le throttle de la scène. */
let preflightSequence = 0;

/**
 * Le total confirmé, par corps ENTIER (clé d'idempotence comprise, URL et
 * jeton aussi) : un RENVOI identique (un double clic, un rejeu) part au même
 * total sans nouvelle tentative. Un panier corrigé sous la même clé est un
 * autre corps, et se confirme de nouveau — sinon
 * la tentative serait elle-même un rejeu, avec ses effets (une intention
 * relue chez le prestataire), et la suite compterait un appel de trop.
 */
const confirmedByKey = new Map<string, number>();

/**
 * Habille un agent du harnais : ses passations sans total sont confirmées.
 * `fresh` rend un agent identique, non habillé, pour la tentative.
 */
export function seeingTotals(agent: request.Agent, fresh: () => request.Agent): request.Agent {
  const post = agent.post.bind(agent);
  return Object.assign(agent, {
    post: (url: string): request.Test => {
      const test = post(url);
      return ORDER_PLACEMENTS.has(url) ? confirmingTotal(test, url, fresh) : test;
    },
  });
}

function confirmingTotal(
  test: request.Test,
  url: string,
  fresh: () => request.Agent,
): request.Test {
  const headers = new Map<string, string>();
  let body: Record<string, unknown> | null = null;
  const set = test.set.bind(test);
  const send = test.send.bind(test);
  const end = test.end.bind(test);
  return Object.assign(test, {
    set: (field: unknown, value?: unknown): request.Test => {
      if (typeof field === "string" && typeof value === "string") {
        headers.set(field, value);
        return set(field, value);
      }
      if (isRecord(field)) {
        for (const [name, header] of Object.entries(field)) {
          if (typeof header === "string") {
            headers.set(name, header);
          }
        }
        return set(field as Record<string, string>);
      }
      return test;
    },
    send: (data: unknown): request.Test => {
      if (isRecord(data)) {
        body = { ...(body ?? {}), ...data };
        return send(data);
      }
      return send(data as string);
    },
    end: (fn?: Parameters<request.Test["end"]>[0]): request.Test => {
      const seen = body;
      if (seen === null || "expectedTotalCents" in seen) {
        return end(fn);
      }
      const key = JSON.stringify([url, [...headers], seen]);
      const known = confirmedByKey.get(key);
      if (known !== undefined) {
        send({ expectedTotalCents: known });
        return end(fn);
      }
      void composedTotal(fresh, url, headers, seen).then(
        (expectedTotalCents) => {
          confirmedByKey.set(key, expectedTotalCents);
          send({ expectedTotalCents });
          end(fn);
        },
        () => end(fn),
      );
      return test;
    },
  });
}

async function composedTotal(
  fresh: () => request.Agent,
  url: string,
  headers: ReadonlyMap<string, string>,
  body: Record<string, unknown>,
): Promise<number> {
  preflightSequence += 1;
  let attempt = fresh().post(url);
  for (const [name, value] of headers) {
    attempt = attempt.set(name, value);
  }
  const response = await attempt
    .set(
      "x-lfc-client-ip",
      `198.18.${String(Math.floor(preflightSequence / 250))}.${String(preflightSequence % 250)}`,
    )
    .send({ ...body, expectedTotalCents: UNSEEN_TOTAL_CENTS });
  const refusal: unknown = response.body;
  if (
    response.status === 409 &&
    isRecord(refusal) &&
    refusal["code"] === ORDER_TOTAL_CHANGED &&
    typeof refusal["totalCents"] === "number"
  ) {
    return refusal["totalCents"];
  }
  return NO_TOTAL_CENTS;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
