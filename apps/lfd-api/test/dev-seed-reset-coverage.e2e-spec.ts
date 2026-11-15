/**
 * E2E — **« Tout recharger » connaît toutes les clés qui peuvent le bloquer**.
 *
 * Régression : le 2026-11-15, le rechargement est mort deux fois en 409 « Une
 * ressource liée est introuvable » — une décision de manquant, puis la
 * fidélité, tenaient une commande ou une société en `RESTRICT` sans qu'il le
 * sache. Cette suite lit le catalogue Postgres réel et le confronte à
 * `src/dev/seeding/reset-coverage.ts`.
 */
import {
  RESET_COVERAGE_FILE,
  RESET_EXEMPTIONS,
  RESET_WIPED_TABLES,
} from "../src/dev/seeding/reset-coverage.js";
import { readBlockingKeys, readTables, type BlockingKey } from "./blocking-keys.js";
import { bootstrapE2e, type E2eContext } from "./e2e-harness.js";

const wiped = new Map(RESET_WIPED_TABLES.map((entry) => [entry.table, entry]));

function isExempt(key: BlockingKey): boolean {
  return RESET_EXEMPTIONS.some(
    (exemption) => exemption.table === key.child && exemption.references === key.target,
  );
}

describe("« Tout recharger » — couverture des clés étrangères", () => {
  let ctx: E2eContext;
  let keys: readonly BlockingKey[];

  beforeAll(async () => {
    ctx = await bootstrapE2e();
    keys = await readBlockingKeys(ctx);
  });

  afterAll(async () => {
    await ctx.close();
  });

  it("chaque table déclarée retirée existe dans le schéma", async () => {
    const tables = await readTables(ctx);
    const missing = RESET_WIPED_TABLES.filter((entry) => !tables.has(entry.table)).map(
      (entry) => `${entry.table} (déclarée dans ${RESET_COVERAGE_FILE}) n'existe plus`,
    );
    expect(missing).toEqual([]);
  });

  it("toute clé bloquante vers une table retirée est retirée avant elle, ou exemptée", () => {
    const uncovered = keys
      .filter((key) => wiped.has(key.target))
      .filter((key) => !isExempt(key))
      .filter((key) => !(wiped.get(key.target)?.referencedBy ?? []).includes(key.child))
      .map(
        (key) =>
          `${key.child} tient ${key.target} par « ${key.constraint} » (suppression refusée) : ` +
          `la retirer avant dans src/dev/seeding/reset.seed.ts (ou ` +
          `order-restricted-children.seed.ts) et l'ajouter à referencedBy de ${key.target} ` +
          `dans ${RESET_COVERAGE_FILE}, ou l'exempter avec sa raison (RESET_EXEMPTIONS).`,
      );
    expect(uncovered).toEqual([]);
  });

  it("une table qui tient une table retirée est elle-même déclarée retirée (transitivité)", () => {
    const undeclared = RESET_WIPED_TABLES.flatMap((entry) =>
      entry.referencedBy
        .filter((child) => !wiped.has(child))
        .map(
          (child) =>
            `${child} est listée sous ${entry.table} mais n'est pas déclarée retirée ` +
            `dans ${RESET_COVERAGE_FILE} : ses propres enfants échapperaient à la vérification.`,
        ),
    );
    expect(undeclared).toEqual([]);
  });

  it("aucune inscription ne survit à la clé qui la justifiait", () => {
    const holds = (child: string, target: string): boolean =>
      keys.some((key) => key.child === child && key.target === target);
    const stale = [
      ...RESET_WIPED_TABLES.flatMap((entry) =>
        entry.referencedBy
          .filter((child) => !holds(child, entry.table))
          .map((child) => `${child} → ${entry.table} : plus aucune clé bloquante`),
      ),
      ...RESET_EXEMPTIONS.filter(
        (exemption) =>
          !wiped.has(exemption.references) || !holds(exemption.table, exemption.references),
      ).map(
        (exemption) =>
          `exemption ${exemption.table} → ${exemption.references} : plus aucune clé bloquante`,
      ),
    ];
    expect(stale.map((line) => `${line} (${RESET_COVERAGE_FILE})`)).toEqual([]);
  });
});
