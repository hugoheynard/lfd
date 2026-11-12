import type { IntentRecord } from "../../../platform/intent/gesture-intent.js";
import { type IntentCodec, readIntentString } from "../../../platform/intent/once-per-intent.js";

/**
 * Le résultat gardé d'un geste comptable qui crée une chose et rend son
 * identifiant (un export, un essai, une entité) : un second envoi de la même
 * clé d'intention rend ce même identifiant, sans rien recréer.
 */
export const CREATED_ID_REPLAY: IntentCodec<string> = {
  write: (id): IntentRecord => ({ id }),
  read: (record, gesture) => readIntentString(record, "id", gesture),
};

/** Le séparateur des identifiants gardés — un ULID n'en contient jamais. */
const ID_SEPARATOR = " ";

/** Le même, pour un geste qui rend plusieurs identifiants (les lots constitués). */
export const CREATED_IDS_REPLAY: IntentCodec<readonly string[]> = {
  write: (ids): IntentRecord => ({ ids: ids.join(ID_SEPARATOR) }),
  read: (record, gesture) =>
    readIntentString(record, "ids", gesture)
      .split(ID_SEPARATOR)
      .filter((id) => id !== ""),
};
