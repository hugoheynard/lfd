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

/** Les deux temps d'un envoi : lire (hors transaction), puis écrire (dedans). */
export interface ResupplySendingSteps<P> {
  readonly prepare: () => Promise<P>;
  readonly write: (prepared: P) => Promise<void>;
}

/**
 * **Un envoi, une fois** — la clé fournie par l'écran, une par ouverture du
 * panneau, devient l'identifiant du réassort (la sortie de réserve, A1.4 ; étendu à
 * « Envoyer un réassort » du fournil, audit du réassort C-A, 2026-11-02).
 * Sa clé primaire est la contrainte unique : deux clics ne font qu'un réassort.
 *
 * La clé est relue AVANT toute lecture (`prepare` : point, catalogue) : un
 * rejeu après qu'un article a été retiré du catalogue ou le point archivé
 * était refusé (404) pour un envoi déjà parti (audit final, 2026-11-03).
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
export async function sendOnceUnderKey<P>(
  uow: UnitOfWork,
  resupplies: SiteResupplyRepository,
  sending: ResupplySendingKey,
  steps: ResupplySendingSteps<P>,
): Promise<void> {
  if (await alreadySent(resupplies, sending)) {
    return;
  }
  const prepared = await steps.prepare();
  try {
    await uow.run(async () => {
      if (await alreadySent(resupplies, sending)) {
        return;
      }
      await steps.write(prepared);
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
