import type { ShopCopyAdminView, ShopCopyEntryView, ShopCopyLocaleView } from "@lfd/contracts";

import type { ShopCopyAdminReader } from "../domain/ports/shop-copy-admin.reader.js";
import type { ShopCopyEntryState } from "../domain/shop-copy-entry.js";
import { SHOP_COPY_LOCALES, type ShopCopyLocale } from "../domain/shop-copy-locale.js";
import type { ShopCopyManifest, ShopCopyManifestEntry } from "../domain/shop-copy-manifest.js";
import { staleTranslations } from "../domain/shop-copy-staleness.js";

type Publication = Awaited<ReturnType<ShopCopyAdminReader["publication"]>>;
type Rows = ReadonlyMap<string, ReadonlyMap<ShopCopyLocale, ShopCopyEntryState>>;

/**
 * Assemble l'écran d'édition : chaque clé du manifeste, dans son ordre, avec
 * ses trois langues ; puis les orphelines — les lignes dont la clé a quitté
 * le code.
 */
export function shopCopyAdminView(
  manifest: ShopCopyManifest,
  states: readonly ShopCopyEntryState[],
  publication: Publication,
): ShopCopyAdminView {
  const rows = byKey(states);
  const entries = manifest.entries().map((entry) => entryView(entry.key, entry, rows));
  const orphans = [...rows.keys()]
    .filter((key) => !manifest.knows(key))
    .sort()
    .map((key) => entryView(key, null, rows));
  return {
    version: publication.version,
    publishedAt: publication.publishedAt?.toISOString() ?? null,
    publishedBy: publication.publishedBy,
    pendingCount: states.filter((state) => state.draft.state !== "unchanged").length,
    entries,
    orphans,
  };
}

function byKey(states: readonly ShopCopyEntryState[]): Rows {
  const rows = new Map<string, Map<ShopCopyLocale, ShopCopyEntryState>>();
  for (const state of states) {
    const locales = rows.get(state.key) ?? new Map<ShopCopyLocale, ShopCopyEntryState>();
    locales.set(state.locale, state);
    rows.set(state.key, locales);
  }
  return rows;
}

function entryView(
  key: string,
  entry: ShopCopyManifestEntry | null,
  rows: Rows,
): ShopCopyEntryView {
  const locales = rows.get(key);
  const view = (locale: ShopCopyLocale): ShopCopyLocaleView =>
    localeView(entry?.originals[locale] ?? null, locales?.get(locale) ?? null);
  return {
    key,
    space: entry?.space ?? null,
    variables: entry?.variables ?? [],
    locales: { fr: view("fr"), en: view("en"), it: view("it") },
    staleTranslations: staleTranslations(
      Object.fromEntries(
        SHOP_COPY_LOCALES.map((locale) => [locale, locales?.get(locale)?.drafted?.at ?? null]),
      ),
    ),
  };
}

function localeView(original: string | null, state: ShopCopyEntryState | null): ShopCopyLocaleView {
  const draft = state?.draft ?? { state: "unchanged" as const };
  return {
    original,
    draftState: draft.state,
    draftText: draft.state === "set" ? draft.text : null,
    publishedText: state?.publishedText ?? null,
    revision: state?.revision ?? 0,
    draftAt: state?.drafted?.at.toISOString() ?? null,
    draftBy: state?.drafted?.staffId ?? null,
  };
}
