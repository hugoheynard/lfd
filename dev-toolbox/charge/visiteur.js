/**
 * Test de charge — le visiteur anonyme (procédure :
 * `documentation/test-de-charge/README.md`).
 *
 * Des visiteurs qui ne se connectent pas, en paliers 10 → 50 → 100 → 250 → 500,
 * chacun tiré au sort entre trois comportements : le curieux (l'accueil, un
 * rayon, il part), le flâneur (plusieurs rayons, longues lectures) et
 * l'hésitant (des rayons, puis un à trois devis sur un panier tiré au hasard).
 * Rien n'écrit : un devis se calcule et ne s'enregistre pas.
 *
 * Lancer :
 *   k6 run dev-toolbox/charge/visiteur.js                       # l'API de dev, localhost:3200
 *   LFD_SMOKE=1 k6 run dev-toolbox/charge/visiteur.js           # un passage par comportement
 *   LFD_BASE_URL=https://lafoliecoffee.info/api/lfd LFD_PROD=oui k6 run dev-toolbox/charge/visiteur.js
 *
 * Variables : `LFD_BASE_URL` (l'API), `LFD_SHOP_URL` (la boutique, pour les pages
 * rendues), `LFD_STEP` (la durée d'un palier, `2m` par défaut), `LFD_STAGES`
 * (`10,50,100,250,500`), `LFD_PROD=oui` (obligatoire hors localhost).
 *
 * 🔴 Les routes publiques sont limitées à 60 appels par minute et par IP
 * (5 pour la commande). Depuis UN poste, le devis rend vite des 429 : ils sont
 * comptés à part (`limited`), pas comme des pannes — c'est la protection qui
 * travaille. Ce que le cache Cloudflare sert ne touche pas l'API et n'est pas
 * limité.
 */
import http from "k6/http";
import { check, sleep, fail } from "k6";
import { Counter, Rate, Trend } from "k6/metrics";

const BASE = (__ENV.LFD_BASE_URL || "http://localhost:3200").replace(/\/$/, "");
const SHOP = (__ENV.LFD_SHOP_URL || "").replace(/\/$/, "");
const STEP = __ENV.LFD_STEP || "2m";
const STAGES = (__ENV.LFD_STAGES || "10,50,100,250,500").split(",").map(Number);
const SMOKE = __ENV.LFD_SMOKE === "1";

/** Les codes postaux d'un devis en livraison : un de la zone, un hors zone. */
const POSTAL_CODES = ["73150", "73320", "73000", "75001"];

/** Les marques `Server-Timing` que l'API et les étages Cloudflare posent. */
const MARKS = ["verify", "principal", "app", "container", "worker", "gateway"];
const timing = Object.fromEntries(MARKS.map((m) => [m, new Trend(`st_${m}`, true)]));
const queue = new Trend("st_queue", true);
const limited = new Counter("limited");
const edgeHit = new Rate("edge_hit");
const serverErrors = new Counter("server_errors");

/** Un 429 est une réponse attendue : la limite de débit, pas une panne. */
http.setResponseCallback(http.expectedStatuses({ min: 200, max: 399 }, 429));

export const options = SMOKE
  ? {
      scenarios: {
        smoke: { executor: "per-vu-iterations", vus: 3, iterations: 1, maxDuration: "2m" },
      },
    }
  : {
      scenarios: {
        visitors: {
          executor: "ramping-vus",
          startVUs: 0,
          // Chaque palier : une montée d'une minute, puis un plateau de `STEP`.
          stages: STAGES.flatMap((target) => [
            { duration: "1m", target },
            { duration: STEP, target },
          ]).concat([{ duration: "30s", target: 0 }]),
          gracefulRampDown: "30s",
        },
      },
      thresholds: {
        // Arrêt automatique (README, « Ne jamais faire tomber la production »).
        http_req_failed: [{ threshold: "rate<0.01", abortOnFail: true, delayAbortEval: "30s" }],
        server_errors: [{ threshold: "count<5", abortOnFail: true }],
        st_queue: [{ threshold: "p(95)<500", abortOnFail: true, delayAbortEval: "1m" }],
        http_req_duration: ["p(95)<1500"],
      },
    };

export function setup() {
  // k6 n'a pas `URL` : l'hôte se lit à la main.
  const host = BASE.replace(/^https?:\/\//, "").split(/[/:]/)[0];
  const local = host === "localhost" || host === "127.0.0.1";
  if (!local && __ENV.LFD_PROD !== "oui") {
    fail(
      `${host} n'est pas local : relancer avec LFD_PROD=oui, hors heures de commande et annoncé.`,
    );
  }
  const res = http.get(`${BASE}/shop/catalogue`, { tags: { route: "catalogue" } });
  if (res.status !== 200) {
    fail(`le catalogue public répond ${res.status} : rien à parcourir.`);
  }
  const catalogue = res.json();
  return {
    shelves: catalogue.shelves.map((s) => s.id),
    skus: catalogue.items.map((i) => i.sku),
  };
}

/** Le tirage d'un visiteur : la moitié de curieux, un tiers de flâneurs, le reste hésite. */
export default function (data) {
  const roll = SMOKE ? (__VU - 1) / 3 : Math.random();
  if (roll < 0.5) {
    curious(data);
  } else if (roll < 0.83) {
    stroller(data);
  } else {
    hesitant(data);
  }
}

function curious(data) {
  landing();
  think(3, 10);
  shelf(pick(data.shelves));
  think(5, 20);
}

function stroller(data) {
  landing();
  for (let i = 0; i < between(3, 7); i++) {
    think(5, 25);
    shelf(pick(data.shelves));
  }
}

function hesitant(data) {
  landing();
  for (let i = 0; i < between(2, 4); i++) {
    think(4, 15);
    shelf(pick(data.shelves));
  }
  for (let i = 0; i < between(1, 3); i++) {
    think(5, 20);
    quote(data.skus);
  }
}

/** L'ouverture de la boutique, comme le navigateur la fait (README, « La formule »). */
function landing() {
  if (SHOP !== "") {
    get(`${SHOP}/boutique`, "page");
  }
  http
    .batch([
      req("/shop/copy?locale=fr", "copy"),
      req("/feature-access", "feature-access"),
      req("/content/footer", "footer"),
      req("/order-opening", "order-opening"),
      req("/delivery-zones", "delivery-zones"),
      req("/delivery-availability", "delivery-availability"),
      req("/pickup-addresses", "pickup-addresses"),
      req("/shop/catalogue", "catalogue"),
      req("/shop/storefront/all", "storefront"),
    ])
    .forEach(measure);
}

function shelf(id) {
  measure(http.get(`${BASE}/shop/storefront/${id}`, { tags: { route: "storefront" } }));
}

function quote(skus) {
  const lines = Array.from({ length: between(1, 6) }, () => ({
    sku: pick(skus),
    quantity: between(1, 4),
  }));
  const unique = [...new Map(lines.map((l) => [l.sku, l])).values()];
  const fulfillment =
    Math.random() < 0.5
      ? { method: "pickup", pickupAddressId: null }
      : { method: "delivery", codePostal: pick(POSTAL_CODES) };
  measure(
    http.post(`${BASE}/shop/quote`, JSON.stringify({ lines: unique, fulfillment }), {
      headers: { "content-type": "application/json" },
      tags: { route: "quote" },
    }),
  );
}

function req(path, route) {
  return ["GET", `${BASE}${path}`, null, { tags: { route } }];
}

function get(url, route) {
  measure(http.get(url, { tags: { route } }));
}

/** Lit le statut, le cache Cloudflare et les marques `Server-Timing` d'une réponse. */
function measure(res) {
  const route = res.request.tags?.route ?? "?";
  if (res.status === 429) {
    limited.add(1, { route });
    return;
  }
  if (res.status >= 500) {
    serverErrors.add(1, { route });
  }
  check(res, { "réponse 2xx": (r) => r.status >= 200 && r.status < 300 }, { route });
  const hit = res.headers["Cf-Cache-Status"] === "HIT";
  edgeHit.add(hit, { route });
  // Une réponse servie du cache porte les marques du calcul d'ORIGINE, figées
  // avec elle : les compter mesurerait une requête d'il y a trente secondes.
  if (hit) {
    return;
  }
  const marks = parseServerTiming(res.headers["Server-Timing"]);
  for (const name of MARKS) {
    if (marks[name] !== undefined) {
      timing[name].add(marks[name], { route });
    }
  }
  if (marks.app !== undefined && marks.container !== undefined) {
    queue.add(marks.container - marks.app, { route });
  }
}

/** `app;dur=375.9, container;dur=447.0` → `{ app: 375.9, container: 447 }`. */
function parseServerTiming(header) {
  const marks = {};
  for (const entry of (header || "").split(",")) {
    const [name, ...params] = entry.trim().split(";");
    const dur = params.find((p) => p.trim().startsWith("dur="));
    if (name !== "" && dur !== undefined) {
      marks[name] = Number(dur.trim().slice(4));
    }
  }
  return marks;
}

function think(minSeconds, maxSeconds) {
  sleep(SMOKE ? 0.2 : minSeconds + Math.random() * (maxSeconds - minSeconds));
}

function between(min, max) {
  return min + Math.floor(Math.random() * (max - min + 1));
}

function pick(list) {
  return list[Math.floor(Math.random() * list.length)];
}
