/**
 * Test de charge de la boutique — k6.
 *
 * Procédure, hypothèses et critères d'arrêt :
 * documentation/test-de-charge/README.md. Ne JAMAIS lancer
 * contre la production sans Hugo, hors heures, et par paliers courts.
 *
 * Variables d'environnement (aucune valeur par défaut ne vise la production) :
 *   LFD_BASE_URL     défaut http://localhost:3200 (l'API de dev, sans préfixe)
 *   LFD_TOKENS       jetons de COMPTES DE TEST, séparés par des virgules.
 *                    En local seulement, le harnais e2e accepte « le jeton
 *                    porteur EST le sub » ; jamais un vrai identifiant ici.
 *   LFD_WORKSPACES   espaces à alterner pour « change d'espace » (ids de
 *                    société de test, ou `personal`), séparés par des virgules
 *   LFD_SHELVES      rayons parcourus (défaut : all)
 *   LFD_TARGET       cible de clients simultanés du scénario pro (défaut 5)
 *   LFD_VISITORS     cible de visiteurs simultanés (défaut 5)
 *   LFD_STEP         durée d'un palier (défaut 1m)
 *   LFD_P95_MS       seuil p95 global en ms (défaut 1500)
 *   LFD_SMOKE=1      un seul passage de chaque scénario, sans montée
 *   LFD_ORDERS=1     active le scénario de PASSATION (`POST /orders`), éteint
 *                    par défaut et REFUSÉ si la cible n'est pas un environnement
 *                    de charge (cf. `assertLoadEnvironment`)
 *   LFD_ORDER_TARGET cible de passeurs simultanés (défaut 2)
 *   LFD_SETTLEMENT   `account` (défaut — règlement au compte, sans Stripe) ou `card`
 *                    (Stripe en MODE TEST seulement ; le paiement n'est pas confirmé)
 *   LFD_SALES_TERMS  `salesTermsPro:3` = CGV cochées (clé:révision), vide = `null`
 *   LFD_AUTH_MODE    `bearer` (défaut, jeton dans Authorization) ou `impersonate`
 *                    (en-tête `x-dev-impersonate`, API locale avec
 *                    AUTH_DEV_IMPERSONATE=true, refusée au boot en production)
 *
 * Sans LFD_ORDERS, aucune écriture de commande : seuls des GET et les POST de
 * LECTURE (`/shop/quote/mine`, `/shop/suggestions/cart/mine`, qui ne mutent rien).
 */
import http from "k6/http";
import { check, group, sleep } from "k6";
import { Counter, Trend } from "k6/metrics";

const BASE = (__ENV.LFD_BASE_URL || "http://localhost:3200").replace(/\/$/, "");
const TOKENS = (__ENV.LFD_TOKENS || "")
  .split(",")
  .map((t) => t.trim())
  .filter(Boolean);
const WORKSPACES = (__ENV.LFD_WORKSPACES || "personal")
  .split(",")
  .map((w) => w.trim())
  .filter(Boolean);
const SHELVES = (__ENV.LFD_SHELVES || "all")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
const TARGET = Number(__ENV.LFD_TARGET || 5);
const VISITORS = Number(__ENV.LFD_VISITORS || 5);
const STEP = __ENV.LFD_STEP || "1m";
const P95 = Number(__ENV.LFD_P95_MS || 1500);
const SMOKE = __ENV.LFD_SMOKE === "1";
const ORDERS = __ENV.LFD_ORDERS === "1";
const ORDER_TARGET = Number(__ENV.LFD_ORDER_TARGET || 2);
const SETTLEMENT = __ENV.LFD_SETTLEMENT || "account";
const AUTH_MODE = __ENV.LFD_AUTH_MODE || "bearer";
const SALES_TERMS = (() => {
  const raw = (__ENV.LFD_SALES_TERMS || "").trim();
  if (!raw) return null;
  const [key, revision] = raw.split(":");
  return { key, revision: Number(revision) };
})();

/**
 * Les hôtes où une passation de charge est admise : la machine locale, ou un
 * hôte dont le PREMIER label dit qu'il est un environnement de charge. Tout le
 * reste — et d'abord le domaine public — est refusé avant le premier appel.
 */
const LOCAL_HOSTS = ["localhost", "127.0.0.1", "[::1]"];
const LOAD_LABELS = ["charge", "load", "staging"];
const PRODUCTION_DOMAINS = ["lafoliecoffee.info"];

function hostOf(url) {
  const m = /^https?:\/\/([^/:]+|\[[^\]]+\])/i.exec(url);
  return m ? m[1].toLowerCase() : "";
}

function assertLoadEnvironment() {
  const host = hostOf(BASE);
  const local = LOCAL_HOSTS.includes(host) || host.endsWith(".localhost") || host.endsWith(".test");
  const labelled = LOAD_LABELS.includes(host.split(".")[0]);
  const production = PRODUCTION_DOMAINS.some((d) => host === d || host === `www.${d}`);
  if (production || !(local || labelled)) {
    throw new Error(
      `LFD_ORDERS=1 refusé : « ${host} » n'est pas un environnement de charge. ` +
        "La passation écrit des commandes, le fournil et le colisage les lisent.",
    );
  }
}
if (ORDERS) assertLoadEnvironment();

/** L'en-tête d'espace — `WORKSPACE_HEADER` de @lfd/contracts/workspace. */
const WORKSPACE_HEADER = "x-lfc-company";

/** Les marques posées par l'API, la passerelle et le Worker (server-timing.ts). */
const MARKS = ["verify", "principal", "app", "container", "worker", "gateway"];
const timing = Object.fromEntries(MARKS.map((m) => [m, new Trend(`st_${m}`, true)]));
/** La file d'attente du demi-vCPU : ce que le container a tenu hors de Nest. */
const queue = new Trend("st_queue", true);
const serverErrors = new Counter("server_errors");

function ramp(target) {
  const steps = [0.25, 0.5, 0.75, 1].map((f) => ({
    duration: STEP,
    target: Math.max(1, Math.round(target * f)),
  }));
  return [...steps, { duration: "30s", target: 0 }];
}

export const options = SMOKE
  ? {
      scenarios: {
        visitor: { executor: "per-vu-iterations", exec: "visitor", vus: 1, iterations: 1 },
        ...(TOKENS.length
          ? { pro: { executor: "per-vu-iterations", exec: "pro", vus: 1, iterations: 1 } }
          : {}),
        ...(TOKENS.length && ORDERS
          ? { buyer: { executor: "per-vu-iterations", exec: "buyer", vus: 1, iterations: 1 } }
          : {}),
      },
    }
  : {
      scenarios: {
        visitor: { executor: "ramping-vus", exec: "visitor", startVUs: 0, stages: ramp(VISITORS) },
        ...(TOKENS.length
          ? {
              pro: { executor: "ramping-vus", exec: "pro", startVUs: 0, stages: ramp(TARGET) },
              switcher: {
                executor: "ramping-vus",
                exec: "switchWorkspace",
                startVUs: 0,
                stages: ramp(Math.max(1, Math.round(TARGET / 10))),
              },
            }
          : {}),
        ...(TOKENS.length && ORDERS
          ? {
              buyer: {
                executor: "ramping-vus",
                exec: "buyer",
                startVUs: 0,
                stages: ramp(ORDER_TARGET),
              },
            }
          : {}),
      },
      thresholds: {
        http_req_failed: [{ threshold: "rate<0.01", abortOnFail: true, delayAbortEval: "20s" }],
        server_errors: [{ threshold: "count<5", abortOnFail: true }],
        http_req_duration: [`p(95)<${P95}`],
        st_queue: [{ threshold: "p(95)<500", abortOnFail: true, delayAbortEval: "30s" }],
      },
    };

/** `name;dur=12.3, other;dur=4` → { name: 12.3, other: 4 } */
function parseServerTiming(header) {
  const out = {};
  for (const part of (header || "").split(",")) {
    const [name, ...params] = part.trim().split(";");
    const dur = params.map((p) => p.trim()).find((p) => p.startsWith("dur="));
    if (name && dur) out[name.trim()] = Number(dur.slice(4));
  }
  return out;
}

function record(res, label) {
  const marks = parseServerTiming(res.headers["Server-Timing"]);
  for (const m of MARKS) if (marks[m] !== undefined) timing[m].add(marks[m], { route: label });
  if (marks.container !== undefined && marks.app !== undefined)
    queue.add(marks.container - marks.app, { route: label });
  if (res.status >= 500) serverErrors.add(1, { route: label });
  check(res, { [`${label} < 400`]: (r) => r.status > 0 && r.status < 400 });
}

function headers(token, workspace) {
  const h = { "Content-Type": "application/json" };
  if (token && AUTH_MODE === "impersonate") h["x-dev-impersonate"] = token;
  else if (token) h.Authorization = `Bearer ${token}`;
  if (workspace) h[WORKSPACE_HEADER] = workspace;
  return h;
}

/** Une vague : les appels partent ensemble, comme le front les lance. */
function wave(token, workspace, calls) {
  const reqs = calls.map(([method, path, body]) => ({
    method,
    url: `${BASE}${path}`,
    body: body ? JSON.stringify(body) : null,
    params: { headers: headers(token, workspace), tags: { name: path.split("?")[0] } },
  }));
  const responses = http.batch(reqs);
  responses.forEach((r, i) => record(r, calls[i][1].split("?")[0]));
  return responses;
}

/** Les SKU trouvés dans une réponse de catalogue, quelle que soit sa forme. */
function collectSkus(res, limit) {
  const found = [];
  const walk = (v) => {
    if (found.length >= limit || v === null || typeof v !== "object") return;
    if (Array.isArray(v)) return v.forEach(walk);
    if (typeof v.sku === "string" && !found.includes(v.sku)) found.push(v.sku);
    Object.values(v).forEach(walk);
  };
  try {
    walk(res.json());
  } catch {
    /* corps non JSON : aucun SKU, le scénario continue sans panier */
  }
  return found;
}

const pick = (list) => list[Math.floor(Math.random() * list.length)];
/** Temps de lecture humain, en secondes. */
const think = (min, max) => sleep(min + Math.random() * (max - min));

export function visitor() {
  group("visiteur parcourt la boutique", () => {
    wave(null, null, [
      ["GET", "/shop/copy?locale=fr"],
      ["GET", "/content/footer"],
      ["GET", "/order-opening"],
      ["GET", "/delivery-zones"],
      ["GET", "/delivery-availability"],
    ]);
    const [catalogue] = wave(null, null, [
      ["GET", "/shop/catalogue"],
      ["GET", "/fulfillment-days"],
    ]);
    collectSkus(catalogue, 5);
    for (let i = 0; i < 3; i++) {
      think(5, 20);
      wave(null, null, [["GET", `/shop/storefront/${pick(SHELVES)}`]]);
    }
  });
}

function openShop(token, workspace) {
  wave(token, workspace, [
    ["GET", "/me"],
    ["GET", "/feature-access/mine"],
    ["GET", "/shop/copy?locale=fr"],
  ]);
  wave(token, workspace, [
    ["GET", "/content/footer"],
    ["GET", "/order-opening"],
    ["GET", "/delivery-zones"],
    ["GET", "/delivery-availability"],
    ["GET", "/fulfillment-days/mine"],
  ]);
  const [catalogue] = wave(token, workspace, [
    ["GET", "/shop/catalogue/mine"],
    ["GET", "/shop/cart"],
    ["GET", "/me/loyalty"],
    ["GET", "/pickup-addresses/mine"],
    ["GET", "/orders/mine"],
    ["GET", "/order-admission/mine"],
    ["GET", "/shop/storefront/all/mine"],
  ]);
  const skus = collectSkus(catalogue, 8);
  if (skus.length)
    wave(token, workspace, [
      ["GET", `/fulfillment-days/mine?skus=${skus.map(encodeURIComponent).join(",")}`],
    ]);
  return skus;
}

export function pro() {
  const token = TOKENS[(__VU - 1) % TOKENS.length];
  const workspace = WORKSPACES[(__VU - 1) % WORKSPACES.length];
  group("pro ouvre son espace et compose un panier", () => {
    const skus = openShop(token, workspace);
    const cart = [];
    for (let i = 0; i < Math.min(5, skus.length); i++) {
      think(8, 30);
      wave(token, workspace, [["GET", `/shop/storefront/${pick(SHELVES)}/mine`]]);
      cart.push({ sku: skus[i], quantity: 1 + Math.floor(Math.random() * 6) });
      think(2, 6);
      wave(token, workspace, [
        ["POST", "/shop/quote/mine", { lines: cart, fulfillment: null }],
        ["POST", "/shop/suggestions/cart/mine", { skus: cart.map((l) => l.sku), target: null }],
      ]);
    }
    think(20, 60);
  });
}

export function switchWorkspace() {
  const token = TOKENS[(__VU - 1) % TOKENS.length];
  group("pro change d'espace", () => {
    for (const workspace of WORKSPACES.slice(0, 2)) {
      openShop(token, workspace);
      think(10, 30);
    }
  });
}

/** Le premier identifiant d'une liste JSON (`[{ id }]`), ou `null`. */
function firstId(res) {
  try {
    const body = res.json();
    const list = Array.isArray(body) ? body : [];
    return list.length && typeof list[0].id === "string" ? list[0].id : null;
  } catch {
    return null;
  }
}

/** Le premier jour ISO (`AAAA-MM-JJ`) trouvé dans une réponse, ou `null`. */
function firstIsoDay(res) {
  const m = /"(\d{4}-\d{2}-\d{2})"/.exec(res.body || "");
  return m ? m[1] : null;
}

/**
 * Construit un panier puis le PASSE — le pic de la veille au soir.
 *
 * Retrait au premier point servi, au premier jour ouvert ; total attendu lu sur
 * le devis (`totalCents`), comme le panier le fait ; une clé d'idempotence par
 * itération. Une réponse 409 (jour clos, CGV, total changé) est un refus
 * métier, compté à part — pas une panne.
 */
export function buyer() {
  const token = TOKENS[(__VU - 1) % TOKENS.length];
  const workspace = WORKSPACES[(__VU - 1) % WORKSPACES.length];
  group("pro compose et passe sa commande", () => {
    const skus = openShop(token, workspace);
    const [pickups, days] = wave(token, workspace, [
      ["GET", "/pickup-addresses/mine"],
      ["GET", "/fulfillment-days/mine"],
    ]);
    const pickupAddressId = firstId(pickups);
    const requestedDeliveryDate = firstIsoDay(days);
    if (!skus.length || !pickupAddressId || !requestedDeliveryDate) return;
    const lines = skus
      .slice(0, 6)
      .map((sku) => ({ sku, quantity: 1 + Math.floor(Math.random() * 6) }));
    for (let n = 1; n <= lines.length; n++) {
      think(3, 10);
      wave(token, workspace, [
        [
          "POST",
          "/shop/quote/mine",
          { lines: lines.slice(0, n), fulfillment: { method: "pickup", pickupAddressId } },
        ],
        [
          "POST",
          "/shop/suggestions/cart/mine",
          { skus: lines.slice(0, n).map((l) => l.sku), target: null },
        ],
      ]);
    }
    const [quote] = wave(token, workspace, [
      [
        "POST",
        "/shop/quote/mine",
        { lines, fulfillment: { method: "pickup", pickupAddressId }, requestedDeliveryDate },
      ],
    ]);
    let total = null;
    try {
      total = quote.json().totalCents;
    } catch {
      total = null;
    }
    if (typeof total !== "number") return;
    think(5, 15);
    const res = http.post(
      `${BASE}/orders`,
      JSON.stringify({
        settlement: SETTLEMENT,
        idempotencyKey: uuid(),
        salesTerms: SALES_TERMS,
        expectedTotalCents: total,
        fulfillmentMethod: "pickup",
        pickupAddressId,
        requestedDeliveryDate,
        lines,
      }),
      { headers: headers(token, workspace), tags: { name: "/orders" } },
    );
    if (res.status === 409) refusals.add(1);
    else record(res, "/orders");
  });
}

const refusals = new Counter("order_refusals_409");

/** UUID v4 pour la clé d'idempotence (k6 n'a pas `crypto.randomUUID`). */
function uuid() {
  const hex = [...Array(32)].map(() => Math.floor(Math.random() * 16).toString(16));
  hex[12] = "4";
  hex[16] = ((parseInt(hex[16], 16) & 3) | 8).toString(16);
  const h = hex.join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}
