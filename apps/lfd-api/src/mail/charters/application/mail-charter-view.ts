import type { MailEditorStamp } from "@lfd/mail-blocks";

import type { MailCharterStamp } from "../domain/mail-space-charter.js";

/** Un geste tel que l'écran le lit : l'instant en ISO, l'identifiant interne de la fiche staff. */
export function charterStampView(stamp: MailCharterStamp): MailEditorStamp {
  return { at: stamp.at.toISOString(), staffId: stamp.staffId };
}
