import type { IntentRecord } from "../../../../platform/intent/gesture-intent.js";
import { IntentRecordUnreadableError } from "../../../../platform/intent/intent-errors.js";
import { type IntentCodec, readIntentString } from "../../../../platform/intent/once-per-intent.js";

/**
 * Les noms stables des trois écritures d'une mercuriale gardées par une clé
 * d'intention. Une clé servie pour l'un est refusée pour l'autre.
 */
export const MERCURIALE_GESTURES = {
  pose: "pricing.pose-mercuriale",
  amend: "pricing.amend-mercuriale",
  correctWindow: "pricing.correct-mercuriale-window",
} as const;

/**
 * Le résultat d'une pose : le nombre d'articles posés. Gardé en chaîne — le
 * registre ne range que des chaînes, des booléens et `null` — et relu comme
 * un entier positif ou nul, sans quoi la relecture lève une erreur nommée.
 */
export const POSED_LINES_REPLAY: IntentCodec<number> = {
  write: (posedLines): IntentRecord => ({ posedLines: String(posedLines) }),
  read: (record, gesture) => {
    const posedLines = Number(readIntentString(record, "posedLines", gesture));
    if (!Number.isSafeInteger(posedLines) || posedLines < 0) {
      throw new IntentRecordUnreadableError(gesture, "posedLines");
    }
    return posedLines;
  },
};

/** Le résultat d'un avenant : son identifiant. */
export const AMENDMENT_ID_REPLAY: IntentCodec<string> = {
  write: (amendmentId): IntentRecord => ({ amendmentId }),
  read: (record, gesture) => readIntentString(record, "amendmentId", gesture),
};
