// node --test dev-toolbox/__tests__/context-version-columns.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";

import { check } from "../gates/context-version-columns.mjs";

/** Un catalogue minimal : une table sous le contexte `catalog`, une colonne lue, une ignorée. */
const SCHEMA = `
model Item {
  sku  String @id
  name String
  note String? @map("internal_note")

  @@map("items")
  @@schema("public")
}
`;
const CONSTANT = `export const CATALOGUE_SNAPSHOT_COLUMNS = {
  catalog: {
    items: ["sku", "name"],
  },
} as const satisfies { readonly catalog: { readonly items: readonly string[] } };`;
const TRIGGER = (columns, context = "catalog") => ({
  name: "1",
  sql: `CREATE TRIGGER "items_context_version"
  BEFORE INSERT OR DELETE OR UPDATE OF ${columns}
  ON "public"."items"
  FOR EACH STATEMENT EXECUTE FUNCTION "public"."${context}_version_bump"();`,
});
const REGISTRY = { ignorees: { items: { internal_note: "jamais servie" } }, horsInstantane: {} };

const base = {
  schema: SCHEMA,
  constant: CONSTANT,
  migrations: [TRIGGER('"sku", "name"')],
  registry: REGISTRY,
};

test("admet un catalogue entièrement classé", () => {
  assert.deepEqual(check(base), []);
});

test("refuse une colonne neuve non classée, en posant la question", () => {
  const schema = SCHEMA.replace("  @@map", '  hidden Boolean @map("is_hidden")\n  @@map');
  const problems = check({ ...base, schema });
  assert.equal(problems.length, 1);
  assert.match(
    problems[0],
    /items\.is_hidden.*l'instantané du catalogue doit-il voir cette colonne/u,
  );
});

test("refuse une colonne lue absente de l'UPDATE OF", () => {
  const problems = check({ ...base, migrations: [TRIGGER('"sku"')] });
  assert.ok(
    problems.some((line) =>
      /items\.name : lue par l'instantané, absente de l'UPDATE OF/u.test(line),
    ),
  );
});

test("refuse une colonne de l'UPDATE OF absente de la constante", () => {
  const problems = check({ ...base, migrations: [TRIGGER('"sku", "name", "internal_note"')] });
  assert.ok(problems.some((line) => /items\.internal_note : dans l'UPDATE OF/u.test(line)));
});

test("refuse une table de la constante sans déclencheur", () => {
  const problems = check({ ...base, migrations: [] });
  assert.ok(problems.some((line) => /aucun déclencheur/u.test(line)));
});

test("le dernier état du déclencheur fait foi (CREATE OR REPLACE)", () => {
  const replaced = {
    name: "2",
    sql: TRIGGER('"sku"').sql.replace("CREATE TRIGGER", "CREATE OR REPLACE TRIGGER"),
  };
  const problems = check({ ...base, migrations: [TRIGGER('"sku", "name"'), replaced] });
  assert.ok(problems.some((line) => /items\.name : lue/u.test(line)));
});

test("refuse une table neuve reliée au catalogue et non classée", () => {
  const schema = `${SCHEMA}
model ItemNote {
  sku  String @id
  item Item   @relation(fields: [sku], references: [sku])

  @@map("item_notes")
  @@schema("public")
}
`;
  const problems = check({ ...base, schema });
  assert.equal(problems.length, 1);
  assert.match(problems[0], /item_notes : table reliée à items/u);
  assert.deepEqual(
    check({
      ...base,
      schema,
      registry: { ...REGISTRY, horsInstantane: { item_notes: "archive" } },
    }),
    [],
  );
});

test("refuse une entrée périmée du registre", () => {
  const registry = {
    ignorees: { items: { internal_note: "x", gone: "y" } },
    horsInstantane: { old: "z" },
  };
  const problems = check({ ...base, registry });
  assert.ok(problems.some((line) => /items\.gone : aucune colonne/u.test(line)));
  assert.ok(problems.some((line) => /horsInstantane\.old : plus reliée/u.test(line)));
});

test("refuse une colonne ignorée sans raison", () => {
  const registry = { ignorees: { items: { internal_note: " " } }, horsInstantane: {} };
  assert.ok(check({ ...base, registry }).some((line) => /sans raison/u.test(line)));
});

test("refuse un déclencheur qui fait monter un autre contexte que celui de sa table", () => {
  const problems = check({ ...base, migrations: [TRIGGER('"sku", "name"', "operations")] });
  assert.equal(problems.length, 1);
  assert.match(
    problems[0],
    /items : rangée sous « catalog », son déclencheur appelle operations_version_bump/u,
  );
});

test("lit les tables de plusieurs contextes, chacune sous le sien", () => {
  const schema = `${SCHEMA}
model Operation {
  key String @id

  @@map("operations")
  @@schema("public")
}
`;
  const constant = `export const CATALOGUE_SNAPSHOT_COLUMNS = {
  catalog: {
    items: ["sku", "name"],
  },
  operations: {
    operations: ["key"],
  },
} as const;`;
  const opsTrigger = {
    name: "2",
    sql: `CREATE TRIGGER "operations_context_version"
  BEFORE INSERT OR DELETE OR UPDATE OF "key"
  ON "public"."operations"
  FOR EACH STATEMENT EXECUTE FUNCTION "public"."operations_version_bump"();`,
  };
  const migrations = [TRIGGER('"sku", "name"'), opsTrigger];
  assert.deepEqual(check({ ...base, schema, constant, migrations }), []);
  const crossed = {
    ...opsTrigger,
    sql: opsTrigger.sql.replace("operations_version", "catalog_version"),
  };
  assert.ok(
    check({ ...base, schema, constant, migrations: [TRIGGER('"sku", "name"'), crossed] }).some(
      (line) => /operations : rangée sous « operations »/u.test(line),
    ),
  );
});

test("ignore un déclencheur qui n'appelle aucune fonction de version", () => {
  const foreign = {
    name: "3",
    sql: `CREATE TRIGGER "items_audit"
  BEFORE INSERT OR DELETE OR UPDATE OF "note"
  ON "public"."items"
  FOR EACH STATEMENT EXECUTE FUNCTION "public"."audit_bump"();`,
  };
  assert.deepEqual(check({ ...base, migrations: [TRIGGER('"sku", "name"'), foreign] }), []);
});
