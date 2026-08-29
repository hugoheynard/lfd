#!/usr/bin/env node
/**
 * Gate : aucune date ABSOLUE dans une fixture qui sème le journal.
 *
 * Une date écrite en dur est une bombe à retardement. Le test est vert jusqu'au
 * jour où le calendrier franchit un seuil, puis rouge sans qu'une ligne de code
 * ait bougé — et ce jour-là, rien dans le diff n'explique la panne.
 *
 * Ce n'est pas une hypothèse. Le 2026-08-29, `cockpit` et `recompute` sont
 * passées au rouge d'elles-mêmes : elles semaient une commande au 2026-08-15 et
 * attendaient le coup `lock_in`. La fenêtre de momentum fait 14 jours glissants ;
 * la date en est sortie pendant la nuit, le lead est devenu `dormant`, et le
 * coup attendu est devenu `win_back`.
 *
 * ⚠️ CE QUE CE GATE NE PRÉTEND PAS FAIRE.
 *
 * La vraie règle (CLAUDE.md §5) est : « une date ne doit jamais tenir lieu de
 * MAINTENANT ». Elle ne se détecte pas mécaniquement — il faudrait savoir si le
 * code testé compare cette date à l'horloge. Les 49 dates absolues
 * d'`admin-pricing` et `price-rules` sont LÉGITIMES : ce sont des fenêtres de
 * validité tarifaire comparées entre elles, jamais à `now`.
 *
 * On ferme donc le cas exact qui a coûté une matinée, et lui seul : semer le
 * JOURNAL d'activité — le seul endroit où une date est systématiquement lue
 * contre une fenêtre glissante. Un gate étroit et vrai vaut mieux qu'un gate
 * large qu'on désactiverait à la première exception.
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

/** Une chaîne littérale qui ressemble à une date ISO. */
const ISO_LITERAL = /["'`]\d{4}-\d{2}-\d{2}(T[\d:.]+Z?)?["'`]/u;

/**
 * L'appel qu'on surveille : `seed(` — la fonction que ces suites se donnent pour
 * insérer une ligne de journal. Elle porte toujours un `occurredAt`, et c'est
 * cet `occurredAt` que les projections comparent à `now`.
 */
const SEED_CALL = /\bseed\s*\(/u;

function testFiles() {
  return execFileSync("git", ["ls-files", "apps/*/test/*.ts", "apps/*/src/**/*.spec.ts"], {
    encoding: "utf8",
  })
    .split("\n")
    .filter(Boolean);
}

const violations = [];

for (const file of testFiles()) {
  const lines = readFileSync(file, "utf8").split("\n");
  lines.forEach((line, index) => {
    // Un appel à `seed(` ET une date littérale sur la MÊME ligne. L'appel étant
    // écrit sur une ligne dans toutes ces suites, on ne cherche pas plus loin :
    // un analyseur syntaxique pour trois occurrences serait une machine à
    // entretenir, pas une porte.
    if (SEED_CALL.test(line) && ISO_LITERAL.test(line)) {
      violations.push([`${file}:${index + 1}`, line.trim()]);
    }
  });
}

if (violations.length > 0) {
  console.error("\n✖ Dates absolues dans une fixture de journal :\n");
  for (const [where, line] of violations) {
    console.error(`  ${where}\n      ${line}`);
  }
  console.error(
    "\nUne date en dur périme le test le jour où le calendrier la dépasse.\n" +
      "Dire l'intention : `const HOT_LAST_ORDER = daysAgo(5)` — et faire porter\n" +
      "l'assertion sur LA MÊME constante, pour qu'elles ne puissent pas diverger.\n" +
      "Voir CLAUDE.md §5, « Aucune date absolue dans une fixture ».\n",
  );
  process.exit(1);
}

console.log("✓ test-dates : aucune date absolue dans une fixture de journal");
