/**
 * E2E — **la purge du scénario connaît toutes les clés qui peuvent la bloquer**.
 *
 * Régression : le 2026-10-25, « Remettre à l'état de base » échouait (« Une
 * ressource liée est introuvable ») parce que `order_shortfall_decision` tenait
 * `orders` en `RESTRICT` sans que la purge le sache (commit `82f2d3971`). Une
 * migration ne dit rien aux fichiers `*.purge.ts` ; seul le catalogue Postgres
 * réel relie les deux. Cette suite le lit et le confronte à
 * `src/dev/scenario/purge/purge-coverage.ts`.
 */
import {
  PURGE_COVERAGE_FILE,
  SCENARIO_PURGED_TABLES,
  SCENARIO_PURGE_EXEMPTIONS,
} from "../src/dev/scenario/purge/purge-coverage.js";
import { readBlockingKeys, readTables, type BlockingKey } from "./blocking-keys.js";
import { bootstrapE2e, type E2eContext } from "./e2e-harness.js";

const purged = new Map(SCENARIO_PURGED_TABLES.map((entry) => [entry.table, entry]));

function isExempt(key: BlockingKey): boolean {
  return SCENARIO_PURGE_EXEMPTIONS.some(
    (exemption) => exemption.table === key.child && exemption.references === key.target,
  );
}

describe("purge du scénario — couverture des clés étrangères", () => {
  let ctx: E2eContext;
  let keys: readonly BlockingKey[];

  beforeAll(async () => {
    ctx = await bootstrapE2e();
    keys = await readBlockingKeys(ctx);
  });

  afterAll(async () => {
    await ctx.close();
  });

  it("chaque table déclarée purgée existe dans le schéma", async () => {
    const tables = await readTables(ctx);
    const missing = SCENARIO_PURGED_TABLES.filter((entry) => !tables.has(entry.table)).map(
      (entry) => `${entry.table} (déclarée dans ${PURGE_COVERAGE_FILE}) n'existe plus`,
    );
    expect(missing).toEqual([]);
  });

  it("toute clé bloquante vers une table purgée est purgée avant elle, ou exemptée", () => {
    const uncovered = keys
      .filter((key) => purged.has(key.target))
      .filter((key) => !isExempt(key))
      .filter((key) => !(purged.get(key.target)?.referencedBy ?? []).includes(key.child))
      .map(
        (key) =>
          `${key.child} tient ${key.target} par « ${key.constraint} » (suppression refusée) : ` +
          `la supprimer dans src/dev/scenario/purge/${purged.get(key.target)?.purgedIn ?? "?"} ` +
          `et l'ajouter à referencedBy de ${key.target} dans ${PURGE_COVERAGE_FILE}, ` +
          `ou l'exempter avec sa raison (SCENARIO_PURGE_EXEMPTIONS).`,
      );
    expect(uncovered).toEqual([]);
  });

  it("une table qui tient une table purgée est elle-même déclarée purgée (transitivité)", () => {
    const undeclared = SCENARIO_PURGED_TABLES.flatMap((entry) =>
      entry.referencedBy
        .filter((child) => !purged.has(child))
        .map(
          (child) =>
            `${child} est listée sous ${entry.table} mais n'est pas déclarée purgée ` +
            `dans ${PURGE_COVERAGE_FILE} : ses propres enfants échapperaient à la vérification.`,
        ),
    );
    expect(undeclared).toEqual([]);
  });

  it("aucune inscription ne survit à la clé qui la justifiait", () => {
    const holds = (child: string, target: string): boolean =>
      keys.some((key) => key.child === child && key.target === target);
    const staleChildren = SCENARIO_PURGED_TABLES.flatMap((entry) =>
      entry.referencedBy
        .filter((child) => !holds(child, entry.table))
        .map((child) => `${child} → ${entry.table} : plus aucune clé bloquante`),
    );
    const staleExemptions = SCENARIO_PURGE_EXEMPTIONS.filter(
      (exemption) =>
        !purged.has(exemption.references) || !holds(exemption.table, exemption.references),
    ).map(
      (exemption) =>
        `exemption ${exemption.table} → ${exemption.references} : plus aucune clé bloquante`,
    );
    expect(
      [...staleChildren, ...staleExemptions].map((line) => `${line} (${PURGE_COVERAGE_FILE})`),
    ).toEqual([]);
  });
});
