import type { ResupplyProductionDayView, ResupplyTarget } from '@lfd/contracts';

import { resupplyLinesAmountLabel } from '../../../shared/resupply-labels';

/** Un réassort d'un point servi sur place, tel que la carte « À monter » le montre. */
export interface ResupplyMountRow {
  readonly siteId: string;
  readonly resupplyId: string;
  readonly siteLabel: string;
  readonly name: string | null;
  readonly target: ResupplyTarget;
  /** « 12 pièces », « 1,25 kg », ou les deux (lot L2b-4) : jamais des grammes comptés en pièces. */
  readonly amount: string;
  /** Instant ISO de « Monté » ; `null` tant qu'il est attendu. */
  readonly arrivedAt: string | null;
  readonly arrivedBy: string | null;
  /**
   * « Monté » s'offre : un réassort du soir, ou un « au plus tôt » LANCÉ —
   * au Labo, on lance puis on monte (Q4, `reassort-boutiques/au-plus-tot.md`).
   */
  readonly mountable: boolean;
}

/** Faute de nom au répertoire, le point reste désigné — jamais une ligne vide. */
const UNKNOWN_POINT = 'Point inconnu';

/**
 * Les réassorts envoyés des points servis SUR PLACE (lot R3e) : ceux d'un
 * point servi par transfert arrivent à la réception du transfert, pas par
 * « Monté ». Un réassort annulé n'est pas à monter. Un « au plus tôt » pas
 * encore lancé se montre sans « Monté » : il n'est pas au plan du fournil
 * (correctif R4a/Q4, lot R4b). Une sortie de réserve (A1.4) n'y figure pas :
 * le pain est déjà fait et parti du colisage, il n'y a rien à monter (D4,
 * 2026-11-02) — elle arrive par sa réception au point.
 */
export function resupplyMountRows(view: ResupplyProductionDayView): readonly ResupplyMountRow[] {
  const byTransfer = new Set(view.transferSiteIds);
  return view.sites
    .filter((site) => !byTransfer.has(site.siteId))
    .flatMap((site) =>
      site.resupplies
        .filter((resupply) => resupply.status === 'placed' && resupply.origin !== 'reserve')
        .map((resupply) => ({
          siteId: site.siteId,
          resupplyId: resupply.id,
          siteLabel: site.siteLabel ?? UNKNOWN_POINT,
          name: resupply.name,
          target: resupply.target,
          amount: resupplyLinesAmountLabel(resupply.lines),
          arrivedAt: resupply.arrivedAt,
          arrivedBy: resupply.arrivedBy,
          mountable: resupply.target !== 'asap' || resupply.launchedAt !== null,
        })),
    );
}
