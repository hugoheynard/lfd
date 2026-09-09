#!/usr/bin/env node
/**
 * Gate : **toute décision qui entre dans la résolution porte une fenêtre**.
 *
 * ## Ce qu'elle empêche, et ce que ça a coûté de l'apprendre
 *
 * Le prix se résout sur des matériaux — règles, planchers, barèmes,
 * engagements, mercuriale. Chacun est une **décision datée** : elle a commencé
 * un jour, elle finit un jour, et « que payait-il le 3 mars ? » se répond en
 * ne retenant que celles qui agissaient ce jour-là.
 *
 * Le plancher, lui, n'avait **aucune fenêtre**. L'index de sa migration
 * l'écrivait sans y voir de problème : « la résolution filtre sur la portée,
 * jamais sur la date ». Conséquence : re-poser RÉÉCRIVAIT la limite, et une
 * lecture datée appliquait les valeurs d'aujourd'hui à une période où elle
 * disait autre chose. Un plancher **relève** un prix — le mode de défaillance
 * était un prix historique **gonflé**, et rien ne le signalait.
 *
 * Il a fallu une migration de schéma, un changement de modèle d'identité et une
 * réécriture du dépôt pour le rattraper (R17, 2026-09-09). Cette porte existe
 * pour que la **sixième** famille ne coûte pas la même chose : elle échoue le
 * jour où on l'ajoute, pas six mois plus tard en cherchant autre chose.
 *
 * ## Pourquoi une porte et pas un type
 *
 * La hiérarchie du dépôt préfère l'inexprimable — et on a cherché. TypeScript
 * ne sait pas contraindre « tout champ FUTUR de cette interface » : on peut
 * typer ceux qui existent, pas obliger le prochain à suivre. Un `extends Dated`
 * sur chaque membre se contourne en ajoutant un membre qui ne l'a pas, sans
 * qu'une ligne rougisse.
 *
 * C'est donc le cran d'en dessous, assumé : **refusé par la CI**. Le
 * contournement demande de modifier ce fichier, ce qui se voit en relecture.
 *
 * ## Ce qu'elle lit
 *
 * Les champs de `PricingMaterials`, et pour chacun le type de ses éléments. Le
 * fichier qui déclare ce type doit prononcer `validFrom`. Elle ne juge pas la
 * résolution elle-même — `isInForce` est éprouvé par les tests ; elle juge la
 * **forme des matériaux**, qui est ce qu'on oublie.
 *
 * ⚠️ Elle s'arrête au fichier, et {@link declaringFile} dit pourquoi et ce que
 * ça laisse passer.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../..", import.meta.url));
const DOMAIN = join(ROOT, "apps", "lfd-api", "src", "b2b", "pricing", "domain");
const MATERIALS = join(DOMAIN, "pricing-materials.ts");

/**
 * Les familles qu'on **sait** ne pas dater, avec leur raison.
 *
 * Vide, et c'est le but : une exception ici est une décision, pas un oubli. Y
 * inscrire quelque chose demande d'écrire pourquoi la question « qu'est-ce qui
 * s'appliquait à cette date ? » n'a pas de sens pour cette famille.
 */
const EXEMPT = new Map();

const source = readFileSync(MATERIALS, "utf8");
const block = source.slice(
  source.indexOf("export interface PricingMaterials {"),
  source.indexOf("\n}", source.indexOf("export interface PricingMaterials {")),
);

// `readonly rules: ScopeIndex<PriceRule>;` → { field: "rules", type: "PriceRule" }
// `readonly commitments: readonly VolumeCommitment[];` → "VolumeCommitment"
// `readonly mercuriale: CompanyMercuriale | null;` → "CompanyMercuriale"
const FIELD = /readonly\s+(\w+)\s*:\s*([^;]+);/g;
const families = [];
for (const [, field, declared] of block.matchAll(FIELD)) {
  const type = declared
    .replace(/ScopeIndex<([^>]+)>/, "$1")
    .replace(/readonly\s+([\w]+)\[\]/, "$1")
    .replace(/\s*\|\s*null/, "")
    .trim();
  families.push({ field, type });
}

if (families.length === 0) {
  console.error("\n✗ dated-decisions : aucun matériau lu — la forme a changé.\n");
  process.exit(1);
}

const undated = [];
for (const { field, type } of families) {
  if (EXEMPT.has(field)) {
    continue;
  }
  // Le type est déclaré quelque part sous `domain/` : on cherche sa déclaration
  // et on regarde si elle porte `validFrom`. Volontairement littéral — une
  // recherche qui suivrait les `extends` rendrait la porte plus faible à lire
  // qu'à contourner.
  const declaring = declaringFile(type);
  if (declaring === null) {
    undated.push([field, type, "déclaration introuvable sous domain/"]);
  } else if (!/readonly\s+validFrom\s*:/.test(declaring)) {
    undated.push([field, type, "aucune fenêtre"]);
  }
}

/**
 * Le fichier qui **déclare** ce type, ou `null`.
 *
 * La porte s'arrête au fichier, délibérément. Suivre les `extends` — la
 * mercuriale porte sa fenêtre dans `CompanyMercurialeDraft`, dont son état
 * hérite — demanderait de résoudre des types, c'est-à-dire de refaire `tsc` en
 * moins bien. Une porte qu'on ne peut pas lire d'un coup d'œil finit désactivée,
 * pas corrigée.
 *
 * Ce qu'elle attrape donc : une famille dont **le fichier entier** ne prononce
 * jamais `validFrom`. C'est exactement le cas du plancher jusqu'au 2026-09-09,
 * et c'est le seul qu'on ait jamais eu. Ce qu'elle laisserait passer : une
 * famille dont un type voisin porte la fenêtre sans qu'elle-même l'ait. Dit ici
 * plutôt que sous-entendu — une porte qui promet plus qu'elle ne tient est pire
 * qu'une porte étroite.
 */
function declaringFile(type) {
  const files = [
    "price-rule.ts",
    "volume-ladder.ts",
    "volume-commitment.ts",
    "entities/company-mercuriale.ts",
    "entities/pricing-floor.ts",
  ];
  const heads = [`interface ${type} `, `type ${type} =`, `class ${type} `];
  for (const file of files) {
    let text;
    try {
      text = readFileSync(join(DOMAIN, file), "utf8");
    } catch {
      continue;
    }
    if (heads.some((head) => text.includes(head))) {
      return text;
    }
  }
  return null;
}

if (undated.length > 0) {
  console.error("\n✗ dated-decisions\n");
  for (const [field, type, why] of undated) {
    console.error(`  PricingMaterials.${field} → ${type} : ${why}`);
  }
  console.error(
    "\n  Une décision qui entre dans la résolution doit porter `validFrom` (et\n" +
      "  `validTo`), sans quoi une lecture datée lui applique les valeurs\n" +
      "  d'AUJOURD'HUI. C'est ce que le plancher faisait jusqu'au 2026-09-09 : il\n" +
      "  relève un prix, donc il rendait un prix historique gonflé, en silence.\n",
  );
  process.exit(1);
}

console.log(
  `✓ dated-decisions : les ${String(families.length)} familles de la résolution portent\n` +
    `  leur fenêtre — ${families.map((f) => f.type).join(", ")}.`,
);
