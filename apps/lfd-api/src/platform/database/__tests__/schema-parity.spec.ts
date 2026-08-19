import { readFileSync } from "node:fs";
import { join } from "node:path";

import { DECLARED_NON_PUBLIC_MODELS } from "../schema-ops.counter.js";

/**
 * **Le garde-fou de la table des schémas.**
 *
 * `schema-ops.counter.ts` porte à la main les modèles qui ne vivent pas dans
 * `public`, parce que Prisma 7 n'expose plus de DMMF utilisable au runtime et
 * que déduire du nom serait deviner.
 *
 * Une table écrite à la main dérive — toujours, et en silence. Ici la dérive a
 * une forme précise : un modèle ajouté dans `growth` serait compté sous
 * `public`, la répartition serait fausse, et **rien ne le dirait** puisque le
 * total, lui, resterait juste. Ce test relit la source de vérité et compare.
 */
describe("la table des schémas ne ment pas sur `schema.prisma`", () => {
  it("déclare exactement les modèles qui ne sont pas dans `public`", () => {
    expect(nonPublicModelsFromPrismaSchema()).toEqual(DECLARED_NON_PUBLIC_MODELS);
  });
});

const MODEL = /^model\s+(\w+)\s*\{/;
const SCHEMA = /^\s*@@schema\("(\w+)"\)/;

/** Les couples modèle → schéma déclarés hors `public`, lus dans le fichier Prisma. */
function nonPublicModelsFromPrismaSchema(): Record<string, string> {
  const source = readFileSync(join(process.cwd(), "prisma", "schema.prisma"), "utf8");
  const found: Record<string, string> = {};
  let current: string | undefined;
  for (const line of source.split("\n")) {
    const model = MODEL.exec(line);
    if (model?.[1] !== undefined) {
      current = model[1];
      continue;
    }
    const schema = SCHEMA.exec(line);
    if (schema?.[1] !== undefined && current !== undefined) {
      if (schema[1] !== "public") {
        found[current] = schema[1];
      }
      current = undefined;
    }
  }
  return found;
}
