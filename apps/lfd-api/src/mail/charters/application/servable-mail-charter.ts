import { isMailSpace, type MailSpace } from "@lfd/mail-blocks";

import type { PublishedMailCharterEntry } from "../../templates/effective-copy/published-mail-charters.js";
import { parseMailCharterSettings } from "./mail-charter-shape.js";

/** Une charte publiée telle que la base la rend, colonne `jsonb` encore à relire. */
export interface StoredPublishedMailCharter {
  readonly space: string;
  readonly version: number;
  readonly settings: unknown;
}

/**
 * La charte publiée d'un espace, telle que l'envoi peut la servir — ou
 * illisible, et l'espace part avec la charte de départ. `null` : la ligne
 * n'est pas un espace de ce code (rangée à la main).
 */
export function servableMailCharter(
  row: StoredPublishedMailCharter,
): readonly [MailSpace, PublishedMailCharterEntry] | null {
  if (!isMailSpace(row.space)) {
    return null;
  }
  const settings = parseMailCharterSettings(row.settings);
  return [
    row.space,
    settings === null
      ? { kind: "unreadable", version: row.version }
      : { kind: "servable", settings, version: row.version },
  ];
}
