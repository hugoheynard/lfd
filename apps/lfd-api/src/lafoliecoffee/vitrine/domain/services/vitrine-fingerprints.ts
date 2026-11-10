import { createHash } from "node:crypto";

import type { ContentLocale, ShopCatalogueView, VitrineElementKeys } from "@lfd/contracts";

import { VitrineChanges, type VitrineGroup } from "../vitrine-changes.js";
import type { VitrineContents } from "../vitrine-contents.js";
import { vitrineCatalogueOf } from "./vitrine-view.js";

/** Les langues que la vitrine sert (décision 7 du §5) — une empreinte les couvre toutes. */
export const VITRINE_LANGUAGES = ["fr", "en", "it"] as const satisfies readonly ContentLocale[];
export type VitrineLanguage = (typeof VITRINE_LANGUAGES)[number];

/**
 * **Ce que le balayage lit UNE fois** (S3) : la vue publique et les textes
 * effectifs, dans chaque langue servie. Filtrée ensuite par abonné.
 */
export interface VitrineShowcase {
  readonly catalogues: Readonly<Record<VitrineLanguage, ShopCatalogueView>>;
  readonly texts: Readonly<Record<VitrineLanguage, Readonly<Record<string, string>>>>;
}

/** Le genre d'un élément, tel que la table des empreintes le range. */
export type VitrineElementKind = "item" | "operation" | "shelf" | "text";

/** Une empreinte d'élément. */
export interface VitrineElementPrint {
  readonly kind: VitrineElementKind;
  readonly key: string;
  readonly fingerprint: string;
}

const GROUP_OF: Readonly<Record<VitrineElementKind, VitrineGroup>> = {
  item: "items",
  operation: "operations",
  shelf: "shelves",
  text: "texts",
};

/**
 * **Les empreintes de la vue d'un abonné** (W3′) : une par élément, sur ses
 * trois langues à la fois — un nom traduit qui change, un prix qui baisse à
 * minuit, une opération qui ouvre changent l'empreinte. Les ensembles qu'il
 * ne reçoit pas ne produisent rien.
 */
export function vitrinePrintsFor(
  showcase: VitrineShowcase,
  contents: VitrineContents,
): readonly VitrineElementPrint[] {
  // Sans origine : `URLProduct` se déduit du SKU, déjà dans l'empreinte, et
  // changer l'origine configurée ne doit pas notifier tout le catalogue.
  const views = VITRINE_LANGUAGES.map((language) =>
    vitrineCatalogueOf(showcase.catalogues[language], contents, language, null),
  );
  const prints = new Map<string, { kind: VitrineElementKind; key: string; parts: unknown[] }>();
  const collect = (kind: VitrineElementKind, key: string, part: unknown): void => {
    const id = `${kind}\u0000${key}`;
    const entry = prints.get(id) ?? { kind, key, parts: [] };
    entry.parts.push(part);
    prints.set(id, entry);
  };
  views.forEach((view) => {
    view.items.forEach((item) => collect("item", item.sku, item));
    view.shelves.forEach((shelf) => collect("shelf", shelf.id, shelf));
    view.operations.forEach((operation) => collect("operation", operation.key, operation));
  });
  if (contents.has("texts")) {
    VITRINE_LANGUAGES.forEach((language) => {
      Object.entries(showcase.texts[language]).forEach(([key, text]) =>
        collect("text", key, [language, text]),
      );
    });
  }
  return [...prints.values()].map(({ kind, key, parts }) => ({
    kind,
    key,
    fingerprint: digest(parts),
  }));
}

/** Les genres qu'un abonné reçoit : seuls ceux-là se comparent. */
export function vitrineKindsFor(contents: VitrineContents): ReadonlySet<VitrineElementKind> {
  const kinds = new Set<VitrineElementKind>();
  if (contents.has("catalogue")) {
    kinds.add("item");
    kinds.add("shelf");
  }
  if (contents.has("operations")) {
    kinds.add("operation");
  }
  if (contents.has("texts")) {
    kinds.add("text");
  }
  return kinds;
}

/** Ce que la comparaison décide : la notification, et ce que la table retient. */
export interface VitrineComparison {
  readonly changes: VitrineChanges;
  readonly upserts: readonly VitrineElementPrint[];
  readonly removals: readonly Pick<VitrineElementPrint, "kind" | "key">[];
}

/**
 * Compare la vue du moment à la dernière empreinte ÉMISE (B3).
 *
 * 🔴 Les genres que l'abonné ne reçoit plus ne sont ni comparés ni oubliés :
 * décocher une case n'envoie AUCUN retrait (M1) — l'agence relit le
 * catalogue si elle le veut.
 */
export function compareVitrinePrints(
  previous: readonly VitrineElementPrint[],
  current: readonly VitrineElementPrint[],
  kinds: ReadonlySet<VitrineElementKind>,
): VitrineComparison {
  const id = (print: Pick<VitrineElementPrint, "kind" | "key">): string =>
    `${print.kind}\u0000${print.key}`;
  const before = new Map(
    previous.filter((print) => kinds.has(print.kind)).map((print) => [id(print), print]),
  );
  const now = new Set(current.map(id));
  const upserts = current.filter(
    (print) => before.get(id(print))?.fingerprint !== print.fingerprint,
  );
  const removals = [...before.values()].filter((print) => !now.has(id(print)));
  const changes = VitrineChanges.of({
    changed: keysByGroup(upserts),
    removed: keysByGroup(removals),
  });
  return { changes, upserts, removals: removals.map(({ kind, key }) => ({ kind, key })) };
}

function keysByGroup(
  prints: readonly Pick<VitrineElementPrint, "kind" | "key">[],
): VitrineElementKeys {
  const of = (group: VitrineGroup): readonly string[] =>
    prints.filter((print) => GROUP_OF[print.kind] === group).map((print) => print.key);
  return {
    items: of("items"),
    operations: of("operations"),
    shelves: of("shelves"),
    texts: of("texts"),
  };
}

function digest(parts: readonly unknown[]): string {
  return createHash("sha256").update(JSON.stringify(parts), "utf8").digest("hex");
}
