import { VitrineReadKeyRefusedError } from "../domain/errors/vitrine-errors.js";
import type { VitrineSubscriberReader } from "../domain/ports/vitrine-subscriber.reader.js";
import { hashVitrineReadKey } from "../domain/services/vitrine-read-key.js";
import type { VitrineContents } from "../domain/vitrine-contents.js";

/**
 * Les cases de l'abonné que la clé désigne. La clé **identifie**, elle ne
 * protège pas : la vue est publique (S4). Une clé absente ou inconnue est
 * refusée quand même — sans abonné, on ne saurait pas quelles cases appliquer.
 *
 * Un abonné **coupé** ne lit plus (décision de Hugo, 2026-10-18) : sa clé est
 * refusée par la même erreur qu'une clé inconnue, sans indice qu'elle a
 * existé. Le rallumer lui rend la lecture, avec la même clé.
 *
 * @throws {VitrineReadKeyRefusedError}
 */
export async function contentsOfReadKey(
  subscribers: VitrineSubscriberReader,
  readKey: string | undefined,
): Promise<VitrineContents> {
  if (readKey === undefined || readKey === "") {
    throw new VitrineReadKeyRefusedError();
  }
  const holder = await subscribers.holderOfReadKey(hashVitrineReadKey(readKey));
  if (holder === null || !holder.active) {
    throw new VitrineReadKeyRefusedError();
  }
  return holder.contents;
}
