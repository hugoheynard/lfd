import { readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";

/**
 * **Plus aucun lecteur des anciennes tables du remboursement** (plan
 * `documentation/commandes/modification/plan-m2-historique-de-transactions.md`,
 * §5.4, lot P1.c).
 *
 * Le remboursement par carte vit dans `card_payment` depuis P1 ; les tables
 * `public.order_refund` et `public.order_refund_request` restent jusqu'à P2,
 * sans relation, et ne font plus foi pour personne. `prisma-model-ownership`
 * se tait sur une table sans écrivain : c'est le retrait des relations, et
 * ce test, qui chassent les lecteurs. Un accès aux modèles `orderRefund` /
 * `orderRefundRequest` (sur `prisma.` comme sur `tx.`) dans `src/` — `dev/`
 * compris — relirait une donnée morte comme si elle était vraie.
 *
 * Exclus : le client Prisma généré (`platform/database/client/`, hors git, qui
 * cite les modèles). `test/` reste libre : le harnais tronque par le
 * catalogue, et l'e2e de la copie sème par l'ancien modèle.
 */

/** Assemblé en morceaux : ce fichier ne doit pas se trouver lui-même. */
const LEGACY_MODEL = new RegExp(["\\.", "order", "Refund", "(Request)?", "\\b"].join(""), "g");

const SOURCE_ROOT = join(process.cwd(), "src");
const GENERATED_CLIENT = join("platform", "database", "client") + sep;

function sourceFiles(directory: string): readonly string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      return (relative(SOURCE_ROOT, path) + sep).startsWith(GENERATED_CLIENT)
        ? []
        : sourceFiles(path);
    }
    return entry.name.endsWith(".ts") ? [path] : [];
  });
}

describe("les anciennes tables du remboursement n'ont plus de lecteur (plan M2, §5.4)", () => {
  const files = sourceFiles(SOURCE_ROOT);

  it("lit bien les sources — un test qui ne lit rien ne prouve rien", () => {
    expect(files.length).toBeGreaterThan(1_000);
    expect(
      files.some((file) => file.endsWith(join("card-payment", "card-payment.module.ts"))),
    ).toBe(true);
    expect(files.some((file) => file.includes(sep + GENERATED_CLIENT))).toBe(false);
  });

  it("aucun accès aux modèles `orderRefund` ni `orderRefundRequest` dans `src/`", () => {
    const readers = files.flatMap((file) => {
      const hits = readFileSync(file, "utf8").match(LEGACY_MODEL) ?? [];
      return hits.map((hit) => `${relative(SOURCE_ROOT, file)} : ${hit}`);
    });

    expect(readers).toEqual([]);
  });
});
