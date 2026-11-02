import type { UnitOfWork } from "../../../platform/database/unit-of-work.js";
import type { ResupplyOrigin } from "../domain/resupply-origin.js";
import { ResupplySendingKeyTakenError } from "../domain/resupply-sending-key-errors.js";
import { SiteResupplyAlreadyWrittenError } from "../domain/site-resupply-errors.js";
import type { SiteResupplyRepository } from "../domain/site-resupply.repository.js";

/** Ce qu'un envoi idempotent désigne : la clé de l'écran, le point, le geste. */
export interface ResupplySendingKey {
  readonly key: string;
  readonly siteId: string;
  readonly origin: ResupplyOrigin;
}

/**
 * **Un envoi, une fois** — la clé fournie par l'écran, une par ouverture du
 * panneau, devient l'identifiant du réassort (plan A1, lot A1.4 ; étendu à
 * « Envoyer un réassort » du fournil, audit du réassort C-A, 2026-11-02).
 * Sa clé primaire est la contrainte unique : deux clics ne font qu'un réassort.
 *
 * Dans l'unité de travail : un réassort déjà écrit sous cette clé, à CE point
 * et de CE geste, est un rejeu — rien ne se refait. Deux envois de la même clé
 * qui se croisent : le second bute sur la clé primaire, sa transaction est
 * défaite, et la clé est relue HORS d'elle pour dire si c'était un rejeu.
 *
 * Une clé prise par un réassort d'un autre point ou d'un autre geste est
 * refusée en le nommant (C-B) : avant, le garde lisait sous le point seul,
 * l'écriture butait sur la clé primaire, l'erreur était avalée et l'écran
 * recevait la clé d'un réassort qui n'était pas le sien.
 *
 * @throws {ResupplySendingKeyTakenError}
 */
export async function sendOnceUnderKey(
  uow: UnitOfWork,
  resupplies: SiteResupplyRepository,
  sending: ResupplySendingKey,
  write: () => Promise<void>,
): Promise<void> {
  try {
    await uow.run(async () => {
      if (await alreadySent(resupplies, sending)) {
        return;
      }
      await write();
    });
  } catch (error) {
    if (!(error instanceof SiteResupplyAlreadyWrittenError)) {
      throw error;
    }
    if (!(await alreadySent(resupplies, sending))) {
      throw new ResupplySendingKeyTakenError(sending.key);
    }
  }
}

/** Vrai si CE réassort est déjà écrit ; une clé à ce point mais d'un autre geste est refusée. */
async function alreadySent(
  resupplies: SiteResupplyRepository,
  sending: ResupplySendingKey,
): Promise<boolean> {
  const existing = await resupplies.load(sending.siteId, sending.key);
  if (existing === null) {
    return false;
  }
  if (existing.origin !== sending.origin) {
    throw new ResupplySendingKeyTakenError(sending.key);
  }
  return true;
}
