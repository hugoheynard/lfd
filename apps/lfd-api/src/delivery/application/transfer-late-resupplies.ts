import type { LoadingStopRow } from "../domain/ports/delivery-loading.reader.js";

/**
 * R4c — les réassorts « au plus tôt » entrés dans le transfert APRÈS son
 * dernier bac chargé. `TransferAttachment` range dans un transfert non
 * parti, chargé ou non (vérifié le 2026-10-22 : `InternalTransfer.attach` ne
 * refuse qu'un transfert parti ou reçu) : l'écran du chargement demande donc
 * un bac de plus. Rien de chargé encore : rien à signaler, les bacs se
 * déclarent de toute façon.
 */
export function resuppliesAfterLoadingOf(stop: LoadingStopRow): number {
  const loads = [...stop.loaded.values()].map((at) => at.getTime());
  if (loads.length === 0) {
    return 0;
  }
  const lastLoad = Math.max(...loads);
  return (stop.resuppliesAttachedAt ?? []).filter((at) => at.getTime() > lastLoad).length;
}
