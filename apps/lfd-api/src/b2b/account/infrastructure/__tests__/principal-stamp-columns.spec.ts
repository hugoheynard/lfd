/**
 * La liste des colonnes qui font monter l'estampille du principal ne devient
 * jamais trop ÉTROITE — `documentation/caching-usage/plan-principal-en-memoire.md`,
 * §3 quinquies.
 *
 * Les déclencheurs `UPDATE OF …` ne montent que sur les colonnes listées dans la
 * migration. Le jour où la résolution lit une colonne de plus de `users`,
 * `memberships` ou `companies`, une écriture sur elle laisserait servir un
 * principal périmé — un accès gardé après une révocation. Ce test lit les
 * sources de la résolution, en tire chaque champ de ces trois modèles qui y
 * apparaît comme clé d'objet (`select`, `where`, `orderBy`, `data`), et exige
 * qu'il soit listé dans la migration ou exempté ici, raison écrite.
 *
 * Sur-approximation assumée : une clé `status` compte pour les deux modèles qui
 * l'ont. Plus large que nécessaire, jamais trop étroit.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const MIGRATION = "20261105120000_l_estampille_filtree_par_colonnes";

/** Les fichiers qui décident de ce que porte le principal. */
const RESOLUTION_SOURCES = [
  "src/b2b/account/infrastructure/customer-principal.resolver.ts",
  "src/b2b/shared/company-standing/infrastructure/read-company-standing.ts",
  "src/b2b/shared/company-standing/infrastructure/opening-membership.ts",
];

const MODELS = { User: "users", Membership: "memberships", Company: "companies" } as const;
type Table = (typeof MODELS)[keyof typeof MODELS];

/**
 * Colonnes lues mais qui ne changent pas un principal GARDÉ. Chaque entrée doit
 * encore être lue (sinon elle échoue) : la liste ne garde pas de mort.
 */
const EXEMPT: Readonly<Record<string, string>> = {
  // Lue et écrite seulement à la première entrée, qui n'est jamais gardée.
  "users.first_login_at": "première entrée, jamais gardée",
  // Les noms des sites et de leur principal : lus par `readReachableSites`,
  // jetés par `principalOf`, qui ne garde que les identifiants.
  "companies.enseigne": "nom, non porté par le principal",
  "companies.raison_sociale": "nom, non porté par le principal",
  // Écrite seulement à la création du compte (`provision`) : un INSERT, qui
  // fait toujours monter.
  "users.became_account_at": "écrite à l'INSERT seulement",
  // Clé d'un rattachement, jamais lue par la résolution — homonyme de
  // `users.id` / `companies.id` dans la sur-approximation.
  "memberships.id": "identifiant du rattachement, non lu",
};

/** `champ Prisma → colonne SQL` des scalaires d'un modèle ; une relation rend ses `fields`. */
function fieldColumns(schema: string, model: string): ReadonlyMap<string, readonly string[]> {
  const block = new RegExp(`^model ${model} \\{([\\s\\S]*?)^\\}`, "m").exec(schema)?.[1] ?? "";
  const scalars = new Map<string, string>();
  const relations = new Map<string, readonly string[]>();
  const models = new Set([...schema.matchAll(/^model (\w+) /gm)].map((match) => match[1]));
  for (const line of block.split("\n")) {
    const field = /^\s*(\w+)\s+(\w+)/.exec(line);
    if (field === null || field[1] === undefined) {
      continue;
    }
    const name = field[1];
    if (models.has(field[2]) && !line.includes("fields:")) {
      continue; // relation inverse : aucune colonne de ce côté
    }
    const fields = /fields:\s*\[([^\]]*)\]/.exec(line)?.[1];
    if (fields !== undefined) {
      relations.set(
        name,
        fields.split(",").map((part) => part.trim()),
      );
      continue;
    }
    scalars.set(name, /@map\("(\w+)"\)/.exec(line)?.[1] ?? name);
  }
  const result = new Map<string, readonly string[]>();
  for (const [name, column] of scalars) {
    result.set(name, [column]);
  }
  for (const [name, fields] of relations) {
    result.set(
      name,
      fields.map((field) => scalars.get(field) ?? field),
    );
  }
  return result;
}

function readSchema(): string {
  const dir = join(ROOT, "prisma/schema/public");
  return readdirSync(dir)
    .map((file) => readFileSync(join(dir, file), "utf8"))
    .join("\n");
}

function withoutComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}

/** Chaque `table.colonne` des trois modèles que les sources nomment en clé. */
function readColumns(): ReadonlySet<string> {
  const schema = readSchema();
  const keys = new Set(
    RESOLUTION_SOURCES.flatMap((path) =>
      [...withoutComments(readFileSync(join(ROOT, path), "utf8")).matchAll(/(\w+)\s*:/g)].map(
        (match) => match[1] ?? "",
      ),
    ),
  );
  const read = new Set<string>();
  for (const [model, table] of Object.entries(MODELS)) {
    for (const [field, columns] of fieldColumns(schema, model)) {
      if (keys.has(field)) {
        columns.forEach((column) => read.add(`${table}.${column}`));
      }
    }
  }
  return read;
}

/** Les colonnes `UPDATE OF` de chaque déclencheur de la migration. */
function triggerColumns(): ReadonlyMap<Table, ReadonlySet<string>> {
  const sql = readFileSync(join(ROOT, "prisma/migrations", MIGRATION, "migration.sql"), "utf8");
  const result = new Map<Table, ReadonlySet<string>>();
  for (const match of sql.matchAll(/UPDATE OF ([^\n]+)\n\s*ON "public"\."(\w+)"/g)) {
    const columns = (match[1] ?? "").split(",").map((part) => part.trim().replaceAll('"', ""));
    const table = Object.values(MODELS).find((name) => name === match[2]);
    if (table !== undefined) {
      result.set(table, new Set(columns));
    }
  }
  return result;
}

describe("les colonnes de l'estampille du principal", () => {
  it("la migration filtre les trois tables", () => {
    expect([...triggerColumns().keys()].sort()).toEqual(["companies", "memberships", "users"]);
  });

  it("toute colonne lue par la résolution fait monter l'estampille, ou est exemptée", () => {
    const triggers = triggerColumns();
    const missing = [...readColumns()].filter((qualified) => {
      const [table, column] = qualified.split(".");
      const listed = [...triggers].some(
        ([name, columns]) => name === table && columns.has(column ?? ""),
      );
      return !listed && EXEMPT[qualified] === undefined;
    });
    expect(missing).toEqual([]);
  });

  it("chaque exemption est encore lue — sinon elle n'a plus lieu d'être", () => {
    const read = readColumns();
    expect(Object.keys(EXEMPT).filter((qualified) => !read.has(qualified))).toEqual([]);
  });

  it("les champs qui portent le principal sont bien vus par la lecture des sources", () => {
    // Garde contre un analyseur qui ne verrait plus rien (un `[]` vert pour rien).
    expect([...readColumns()]).toEqual(
      expect.arrayContaining([
        "users.auth0_sub",
        "users.status",
        "users.email_verified",
        "memberships.accepted_at",
        "memberships.invited_at",
        "companies.parent_company_id",
        "companies.status",
      ]),
    );
  });
});
