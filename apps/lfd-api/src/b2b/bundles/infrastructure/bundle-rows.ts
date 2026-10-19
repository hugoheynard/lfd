import type { BundleRecord, BundleSnapshot } from "../domain/entities/bundle-shapes.js";

/** La ligne d'une formule, groupes et choix joints, dans leur ordre. */
interface BundleRow {
  readonly id: string;
  readonly key: string;
  readonly name: string;
  readonly description: string | null;
  readonly audience: string;
  readonly status: string;
  readonly createdAt: Date;
  readonly writtenAt: Date;
  readonly writtenBy: string | null;
  readonly groups: readonly {
    readonly key: string;
    readonly label: string;
    readonly choices: readonly { readonly sku: string }[];
  }[];
}

/** Les groupes et leurs choix, chacun à son rang. */
export const GROUPS_IN_ORDER = {
  groups: {
    orderBy: { position: "asc" },
    include: { choices: { orderBy: { position: "asc" } } },
  },
} as const;

/** La ligne vers ce que `Bundle.reconstitute` rejuge. */
export function toRecord(row: BundleRow): BundleRecord {
  return {
    id: row.id,
    key: row.key,
    name: row.name,
    description: row.description,
    audience: row.audience,
    status: row.status,
    createdAt: row.createdAt,
    writtenAt: row.writtenAt,
    writtenBy: row.writtenBy,
    groups: row.groups.map((group) => ({
      key: group.key,
      label: group.label,
      choices: group.choices.map((choice) => choice.sku),
    })),
  };
}

/** Les colonnes de la formule elle-même — ni l'id, ni la clé, qui ne bougent pas. */
export function bundleColumns(snapshot: BundleSnapshot) {
  return {
    name: snapshot.name,
    description: snapshot.description,
    audience: snapshot.audience,
    status: snapshot.status,
    writtenAt: snapshot.writtenAt,
    writtenBy: snapshot.writtenBy,
  };
}

/** Les lignes des groupes, à leur rang. */
export function groupRows(snapshot: BundleSnapshot) {
  return snapshot.groups.map((group, position) => ({
    bundleId: snapshot.id,
    key: group.key,
    label: group.label,
    position,
  }));
}

/** Les lignes des choix, chacune à son rang DANS son groupe. */
export function choiceRows(snapshot: BundleSnapshot) {
  return snapshot.groups.flatMap((group) =>
    group.choices.map((sku, position) => ({
      bundleId: snapshot.id,
      groupKey: group.key,
      sku,
      position,
    })),
  );
}
