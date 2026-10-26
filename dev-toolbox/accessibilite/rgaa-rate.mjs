#!/usr/bin/env node
/**
 * Le taux de conformité RGAA, lu dans la grille d'audit de la boutique.
 *
 * Règles RGAA : un critère est conforme s'il l'est sur TOUTES les pages de
 * l'échantillon où il s'applique ; non conforme dès qu'une page l'est ; non
 * applicable s'il ne s'applique à aucune. Taux = C / (C + NC), NA exclus.
 *
 * Tant qu'une case est « NT » (non testé), le script refuse de rendre un
 * statut : un taux calculé sur un audit incomplet serait un chiffre publiable
 * et faux. Mode d'emploi : documentation/accessibilite/grille-audit-rgaa.md.
 *
 * Usage : node dev-toolbox/accessibilite/rgaa-rate.mjs [chemin/vers/grille.json]
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

import { criterionStatus as statutDuCritere } from "./rgaa-follow-up.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const path = process.argv[2] ?? resolve(ROOT, "documentation/accessibilite/grille-audit-rgaa.json");
const grille = JSON.parse(readFileSync(path, "utf8"));
const compte = { C: 0, NC: 0, NA: 0, NT: 0 };
const nonTestes = [];
let casesNT = 0;
for (const critere of grille.criteres) {
  const statut = statutDuCritere(critere);
  compte[statut] += 1;
  casesNT += Object.values(critere.resultats).filter((r) => r.statut === "NT").length;
  if (statut === "NT") nonTestes.push(critere.numero);
}

const applicables = compte.C + compte.NC;
const taux = applicables === 0 ? null : (100 * compte.C) / applicables;

console.log(`${grille.meta.referentiel} — ${grille.meta.site}`);
console.log(
  `Critères : ${grille.criteres.length} · C ${compte.C} · NC ${compte.NC} · NA ${compte.NA} · NT ${compte.NT}`,
);
console.log(`Cases non testées : ${casesNT}`);
console.log(
  `Taux provisoire, sur les seuls critères tranchés (C / (C + NC)) : ${taux === null ? "—" : `${taux.toFixed(1).replace(".", ",")} %`}`,
);
if (nonTestes.length > 0)
  console.log(`Critères encore NT (${nonTestes.length}) : ${nonTestes.join(", ")}`);

if (casesNT > 0) {
  console.log("Statut : audit incomplet — aucun statut ne se calcule tant qu'une case est NT.");
} else {
  const statut =
    compte.NC === 0
      ? "totalement conforme"
      : taux >= 50
        ? "partiellement conforme"
        : "non conforme";
  console.log(`Statut : ${statut}`);
}
