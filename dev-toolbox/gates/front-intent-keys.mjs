#!/usr/bin/env node
/**
 * Gate : **un écran envoie la clé d'une intention, jamais une clé tirée au
 * clic** (plan `documentation/ops/plan-idempotence-des-ecritures.md`, § 8, J5).
 *
 * L'API range chaque route d'écriture (`write-idempotence`) ; une route « par
 * intention » ne résiste au rejeu que si l'écran renvoie la MÊME clé à chaque
 * envoi du même geste. La porte lit l'inventaire de `write-idempotence`
 * (`--inventory`, à l'instant) et, dans `apps/lfd-backoffice-frontend/src` et
 * `apps/lfc-ecommerce-frontend/src` (specs exclues), refuse :
 *
 * 1. un appel HTTP d'écriture dont le verbe et le chemin désignent une route
 *    « par intention », et qui ne passe pas la clé par `intentOptions(…)`,
 *    `withIntent(…)` ou `INTENT_KEY_HEADER` (la brique `GestureIntents`,
 *    `shared/gesture-intents.ts` au back-office, `client/gesture-intents.ts`
 *    à la boutique) ;
 * 2. un `randomUUID()` qui sert de clé d'intention hors de la brique (les
 *    fichiers de `BRICKS`) : passé à `intentOptions`, posé en en-tête, rangé
 *    sous un nom en `*intent*`, ou passé tel quel à un appel.
 *
 * Ce qui ne se résout pas — un chemin sans morceau littéral, un verbe en
 * variable (`http.request(method, …)`) — ne désigne aucune route et passe :
 * la limite est écrite, pas cachée. Un appel qui désigne à la fois une route
 * « par intention » et une autre (chemin ambigu) est traité comme « par
 * intention » : envoyer une clé à une route qui ne la lit pas ne coûte rien.
 *
 * Les écarts admis sont dans `front-intent-keys-admitted.json`, chacun avec sa
 * raison et sa date ; une entrée qui ne désigne plus un écart échoue.
 *
 * Usage : `pnpm gate front-intent-keys`. Tests :
 * `node --test dev-toolbox/__tests__/front-intent-keys.test.mjs`.
 */
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { drawnKeysOf, writeCallsOf } from "./front-intent-keys-calls.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const FRONTS = ["apps/lfd-backoffice-frontend/src", "apps/lfc-ecommerce-frontend/src"];
export const ADMITTED_FILE = "dev-toolbox/gates/front-intent-keys-admitted.json";

/** Les briques qui fabriquent la clé d'une intention : seules à tirer au hasard. */
export const BRICKS = new Set([
  "apps/lfd-backoffice-frontend/src/app/shared/gesture-intents.ts",
  "apps/lfd-backoffice-frontend/src/app/fiche-client/tarifs/sending-intent.ts",
  "apps/lfc-ecommerce-frontend/src/app/client/gesture-intents.ts",
]);

/**
 * Les préfixes qu'un `RouterModule` monte côté API (`pim/pim.module.ts`), que
 * l'inventaire ne lit pas (vérifié le 2026-11-12 : seul `PimModule` en monte).
 */
const ROUTER_MOUNTS = ["", "/pim", "/pim/channels/b2b"];

/** Les routes de l'inventaire qu'un appel désigne (même verbe, chemin reconnu). */
export const routesOf = (call, inventory) =>
  call.pattern === null
    ? []
    : inventory.filter(
        (route) =>
          route.httpMethod === call.verb &&
          ROUTER_MOUNTS.some((mount) => call.pattern.test(`${mount}${route.path}`)),
      );

/**
 * Les écarts d'un fichier : `{ file, line, kind, detail }`, `kind` valant
 * `unkeyed` (1) ou `drawn` (2).
 */
export function faultsOf(path, source, inventory) {
  const faults = [];
  for (const call of writeCallsOf(path, source)) {
    if (call.keyed) continue;
    const intent = routesOf(call, inventory).filter((route) => route.case === "intent");
    if (intent.length === 0) continue;
    faults.push({
      file: path,
      line: call.line,
      kind: "unkeyed",
      detail: `${call.verb} ${intent[0].path} (${intent[0].route})`,
    });
  }
  if (!BRICKS.has(path)) {
    for (const drawn of drawnKeysOf(path, source)) {
      faults.push({ file: path, line: drawn.line, kind: "drawn", detail: "randomUUID()" });
    }
  }
  return faults;
}

/** Un écart admis se désigne par fichier, nature et appel (pas par ligne, qui bouge). */
const admittedKey = (entry) => `${entry.file}|${entry.kind}|${entry.detail}`;

/**
 * Le verdict : `{ failures, admitted }`. Une entrée admise doit avoir une
 * raison et une date, et désigner un écart d'aujourd'hui.
 */
export function verdict(faults, admitted) {
  const failures = [];
  const keys = new Map(admitted.map((entry) => [admittedKey(entry), entry]));
  const seen = new Set();
  for (const fault of faults) {
    const key = admittedKey(fault);
    if (keys.has(key)) {
      seen.add(key);
      continue;
    }
    failures.push(
      fault.kind === "unkeyed"
        ? `${fault.file}:${fault.line} — ${fault.detail} est « par intention » : passer la clé par intentOptions(intents.keyFor(sujet)) d'une GestureIntents`
        : `${fault.file}:${fault.line} — clé d'intention tirée au hasard hors de la brique : la demander à une GestureIntents (keyFor/done)`,
    );
  }
  for (const entry of admitted) {
    const where = `${ADMITTED_FILE} : ${entry.file} ${entry.kind} ${entry.detail}`;
    if (!entry.reason?.trim() || !/^\d{4}-\d{2}-\d{2}$/.test(entry.since ?? "")) {
      failures.push(`${where} — une entrée admise porte sa raison et sa date (since)`);
    } else if (!seen.has(admittedKey(entry))) {
      failures.push(`${where} — ne désigne plus aucun écart : l'en retirer`);
    }
  }
  return { failures, admitted: admitted.length };
}

function typescriptFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry !== "node_modules") out.push(...typescriptFiles(full));
    } else if (entry.endsWith(".ts") && !entry.endsWith(".spec.ts")) {
      out.push(full);
    }
  }
  return out;
}

function inventory() {
  const output = execFileSync(
    process.execPath,
    [join(ROOT, "dev-toolbox/gates/write-idempotence.mjs"), "--inventory"],
    { cwd: ROOT, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
  );
  return JSON.parse(output);
}

function main() {
  const routes = inventory();
  const faults = FRONTS.flatMap((front) =>
    typescriptFiles(join(ROOT, front)).flatMap((full) =>
      faultsOf(relative(ROOT, full), readFileSync(full, "utf8"), routes),
    ),
  );
  const admitted = JSON.parse(readFileSync(join(ROOT, ADMITTED_FILE), "utf8")).admitted;
  const result = verdict(faults, admitted);
  if (result.failures.length > 0) {
    console.error("\n✗ front-intent-keys\n");
    for (const failure of result.failures) console.error(`  ${failure}`);
    console.error(
      `\n  ${result.failures.length} faute(s). Plan : documentation/ops/plan-idempotence-des-ecritures.md (§ 8, J5)\n`,
    );
    process.exit(1);
  }
  const intent = routes.filter((route) => route.case === "intent").length;
  console.log(
    `✓ front-intent-keys : les appels des écrans vers les ${intent} route(s) « par intention » passent la clé d'une GestureIntents.\n` +
      `  Écarts admis (${ADMITTED_FILE}) : ${result.admitted} — comptés, pas ignorés.`,
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
