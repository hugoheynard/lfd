/**
 * **Pourquoi un contenu de bon est né** (`documentation/commandes/reliquat/reliquat.md`, § 7) :
 * `born`, le bon naît ; `departure_decided`, il suit un départ incomplet
 * décidé ; `replanned`, toute autre réécriture de ses lignes ou de ses
 * montants. 🔴 Valeurs écrites en base (CHECK `delivery_note_version_cause_known`).
 */
export const DELIVERY_NOTE_VERSION_CAUSES = ["born", "departure_decided", "replanned"] as const;
export type DeliveryNoteVersionCause = (typeof DELIVERY_NOTE_VERSION_CAUSES)[number];

/** Une cause de réécriture : la naissance n'en est pas une. */
export type DeliveryNoteChangeCause = Exclude<DeliveryNoteVersionCause, "born">;

/** Une version à figer : laquelle, et pourquoi. */
export interface DeliveryNoteVersionToKeep {
  readonly contentVersion: number;
  readonly cause: DeliveryNoteVersionCause;
}

/**
 * **La version à figer après une écriture**, ou `null` : le bon n'existait
 * pas (`previous = null`) → sa version naît ; sa version a monté → la
 * nouvelle, avec la cause que l'agrégat a retenue (`replanned` faute
 * d'en connaître une) ; sinon rien — une écriture sans changement de contenu
 * (un pas d'état, une impression) ne fige rien.
 */
export function versionToKeep(
  previous: number | null,
  written: number,
  cause: DeliveryNoteChangeCause | null,
): DeliveryNoteVersionToKeep | null {
  if (previous === null) {
    return { contentVersion: written, cause: "born" };
  }
  return written > previous ? { contentVersion: written, cause: cause ?? "replanned" } : null;
}

/** La version d'un bon à sa naissance : le BL d'origine. */
export const FIRST_CONTENT_VERSION = 1;

/** Une version rangée, telle que les lectures la rendent. */
export interface KeptVersion {
  readonly contentVersion: number;
  readonly cause: DeliveryNoteVersionCause;
  readonly recordedAt: Date;
}

/** Les versions d'un bon dans la forme de la liste des documents, par version croissante. */
export function versionViewsOf(kept: readonly KeptVersion[]): readonly {
  readonly version: number;
  readonly cause: DeliveryNoteVersionCause;
  readonly recordedAt: string;
}[] {
  return [...kept]
    .sort((a, b) => a.contentVersion - b.contentVersion)
    .map((v) => ({
      version: v.contentVersion,
      cause: v.cause,
      recordedAt: v.recordedAt.toISOString(),
    }));
}
