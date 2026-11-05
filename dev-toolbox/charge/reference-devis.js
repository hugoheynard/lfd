/**
 * Référence — ce que pèse la lecture du catalogue dans un devis anonyme
 * (plan `documentation/caching-usage/plan-materiaux-du-catalogue.md`,
 * « Mesurer avant de bâtir »).
 *
 * Ce n'est PAS un test de charge : un seul visiteur, une requête toutes les
 * `LFD_PAUSE` secondes (3 par défaut), `LFD_N` devis (30 par défaut) — sous la
 * limite de 60 appels par minute et par IP. Rien n'écrit : un devis se calcule
 * et ne s'enregistre pas. Les paniers sont tirés du catalogue public, retrait
 * en boutique (pas de zone de livraison, pour ne mesurer que le chiffrage).
 *
 * Rend la médiane et le p95 de `app`, `catalogue` (temps mural des lectures du
 * catalogue), `catalogue-reads` (leur nombre) et `http_req_duration`. Une
 * réponse servie du cache Cloudflare (`Cf-Cache-Status: HIT`) est écartée :
 * elle porte les marques d'un calcul d'origine.
 *
 * Lancer :
 *   k6 run dev-toolbox/charge/reference-devis.js                     # l'API de dev, localhost:3200
 *   LFD_N=3 LFD_PAUSE=0.2 k6 run dev-toolbox/charge/reference-devis.js  # fumée locale
 *   LFD_BASE_URL=https://lafoliecoffee.info/api/lfd LFD_PROD=oui k6 run dev-toolbox/charge/reference-devis.js
 */
import http from "k6/http";
import { check, sleep, fail } from "k6";
import { Counter, Trend } from "k6/metrics";

const BASE = (__ENV.LFD_BASE_URL || "http://localhost:3200").replace(/\/$/, "");
const N = Number(__ENV.LFD_N || "30");
const PAUSE = Number(__ENV.LFD_PAUSE || "3");

const app = new Trend("st_app", true);
const catalogue = new Trend("st_catalogue", true);
const catalogueReads = new Trend("catalogue_reads");
const quoteDuration = new Trend("quote_duration", true);
const skipped = new Counter("skipped");

export const options = {
  scenarios: {
    reference: { executor: "per-vu-iterations", vus: 1, iterations: N, maxDuration: "30m" },
  },
  summaryTrendStats: ["med", "p(95)", "count"],
};

export function setup() {
  // k6 n'a pas `URL` : l'hôte se lit à la main.
  const host = BASE.replace(/^https?:\/\//, "").split(/[/:]/)[0];
  const local = host === "localhost" || host === "127.0.0.1";
  if (!local && __ENV.LFD_PROD !== "oui") {
    fail(`${host} n'est pas local : relancer avec LFD_PROD=oui, hors heures de commande.`);
  }
  const res = http.get(`${BASE}/shop/catalogue`);
  if (res.status !== 200) {
    fail(`le catalogue public répond ${res.status} : rien à chiffrer.`);
  }
  const skus = res.json().items.map((i) => i.sku);
  if (skus.length === 0) {
    fail("le catalogue public est vide : rien à chiffrer.");
  }
  return { skus };
}

export default function (data) {
  const lines = Array.from({ length: between(1, 6) }, () => ({
    sku: pick(data.skus),
    quantity: between(1, 4),
  }));
  const unique = [...new Map(lines.map((l) => [l.sku, l])).values()];
  const body = { lines: unique, fulfillment: { method: "pickup", pickupAddressId: null } };
  const res = http.post(`${BASE}/shop/quote`, JSON.stringify(body), {
    headers: { "content-type": "application/json" },
  });
  measure(res);
  sleep(PAUSE);
}

function measure(res) {
  check(res, { "devis 2xx": (r) => r.status >= 200 && r.status < 300 });
  if (res.status < 200 || res.status >= 300 || res.headers["Cf-Cache-Status"] === "HIT") {
    skipped.add(1);
    return;
  }
  const marks = parseServerTiming(res.headers["Server-Timing"]);
  quoteDuration.add(res.timings.duration);
  if (marks.app !== undefined) app.add(marks.app.dur);
  if (marks.catalogue !== undefined) catalogue.add(marks.catalogue.dur);
  if (marks["catalogue-reads"] !== undefined) {
    catalogueReads.add(Number(marks["catalogue-reads"].desc));
  }
}

/** `catalogue;dur=4.2, catalogue-reads;dur=0.0;desc="3"` → `{ catalogue: { dur: 4.2 }, … }`. */
function parseServerTiming(header) {
  const marks = {};
  for (const entry of (header || "").split(",")) {
    const [name, ...params] = entry.trim().split(";");
    const mark = {};
    for (const p of params) {
      const [key, value] = p.trim().split("=");
      mark[key] = key === "dur" ? Number(value) : (value || "").replace(/"/g, "");
    }
    if (name !== "") marks[name] = mark;
  }
  return marks;
}

/** Le tableau de référence : médiane et p95, prêt à recopier dans le plan. */
export function handleSummary(summary) {
  const row = (label, metric, unit) => {
    const v = summary.metrics[metric]?.values;
    if (v === undefined) return `${label.padEnd(20)} (absente)`;
    return `${label.padEnd(20)} médiane ${v.med.toFixed(1)}${unit} · p95 ${v["p(95)"].toFixed(1)}${unit} · n=${v.count}`;
  };
  const text = [
    `Référence devis anonyme — ${BASE}`,
    row("http_req_duration", "quote_duration", " ms"),
    row("app", "st_app", " ms"),
    row("catalogue", "st_catalogue", " ms"),
    row("catalogue-reads", "catalogue_reads", ""),
    `écartées (cache, non 2xx) : ${summary.metrics.skipped?.values.count ?? 0}`,
    "",
  ].join("\n");
  return { stdout: text };
}

function between(min, max) {
  return min + Math.floor(Math.random() * (max - min + 1));
}

function pick(list) {
  return list[Math.floor(Math.random() * list.length)];
}
