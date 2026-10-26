/**
 * La comparaison de la porte axe, sans navigateur ni fichier : des comptes
 * relevés contre des comptes admis. Testée par
 * `node --test dev-toolbox/__tests__/axe-baseline-compare.test.mjs`.
 *
 * Un compte est le nombre de NŒUDS en violation d'une règle sur une page
 * (`page` = `clientèle/étape[+geste]@largeur`). La dette ne peut que
 * décroître : tout écart est un échec, dans les deux sens.
 *
 * @param {Readonly<Record<string, Readonly<Record<string, number>>>>} baseline
 * @param {Readonly<Record<string, Readonly<Record<string, number>>>>} measured
 * @returns {{ regressions: string[], repaid: string[], missingPages: string[], newPages: string[] }}
 */
export function compareAxe(baseline, measured) {
  const regressions = [];
  const repaid = [];
  const missingPages = [];
  const newPages = [];
  for (const page of Object.keys(baseline)) {
    if (!(page in measured)) missingPages.push(page);
  }
  for (const [page, counts] of Object.entries(measured)) {
    const admitted = baseline[page];
    if (admitted === undefined) {
      newPages.push(page);
    }
    const known = admitted ?? {};
    for (const [rule, count] of Object.entries(counts)) {
      const allowed = known[rule] ?? 0;
      if (count > allowed) regressions.push(`${page} · ${rule} : ${count} nœud(s), ${allowed} admis`);
    }
    for (const [rule, allowed] of Object.entries(known)) {
      const count = counts[rule] ?? 0;
      if (count < allowed) repaid.push(`${page} · ${rule} : ${count} nœud(s), ${allowed} inscrits`);
    }
  }
  return { regressions, repaid, missingPages, newPages };
}

/** Une référence triée (pages, puis règles) : un diff de régénération se lit ligne à ligne. */
export function sortedBaseline(measured) {
  const out = {};
  for (const page of Object.keys(measured).sort()) {
    const rules = {};
    for (const rule of Object.keys(measured[page]).sort()) rules[rule] = measured[page][rule];
    out[page] = rules;
  }
  return out;
}
