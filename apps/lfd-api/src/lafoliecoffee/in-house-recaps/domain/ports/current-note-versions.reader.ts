import type { CurrentNoteVersion } from "../entities/in-house-recap.js";

/** La version de contenu COURANTE de BL donnés — jamais une version figée (D8). */
export abstract class CurrentNoteVersionsReader {
  abstract versionsOf(deliveryNoteIds: readonly string[]): Promise<readonly CurrentNoteVersion[]>;
}
