import type { ResupplyProductionDayView, ResupplyTarget } from '@lfd/contracts';

/** Un réassort d'un point servi sur place, tel que la carte « À monter » le montre. */
export interface ResupplyMountRow {
  readonly siteId: string;
  readonly resupplyId: string;
  readonly siteLabel: string;
  readonly name: string | null;
  readonly target: ResupplyTarget;
  readonly pieces: number;
  /** Instant ISO de « Monté » ; `null` tant qu'il est attendu. */
  readonly arrivedAt: string | null;
  readonly arrivedBy: string | null;
}

/** Faute de nom au répertoire, le point reste désigné — jamais une ligne vide. */
const UNKNOWN_POINT = 'Point inconnu';

/**
 * Les réassorts envoyés des points servis SUR PLACE (lot R3e) : ceux d'un
 * point servi par transfert arrivent à la réception du transfert, pas par
 * « Monté ». Un réassort annulé n'est pas à monter.
 */
export function resupplyMountRows(view: ResupplyProductionDayView): readonly ResupplyMountRow[] {
  const byTransfer = new Set(view.transferSiteIds);
  return view.sites
    .filter((site) => !byTransfer.has(site.siteId))
    .flatMap((site) =>
      site.resupplies
        .filter((resupply) => resupply.status === 'placed')
        .map((resupply) => ({
          siteId: site.siteId,
          resupplyId: resupply.id,
          siteLabel: site.siteLabel ?? UNKNOWN_POINT,
          name: resupply.name,
          target: resupply.target,
          pieces: resupply.lines.reduce((sum, line) => sum + line.quantity, 0),
          arrivedAt: resupply.arrivedAt,
          arrivedBy: resupply.arrivedBy,
        })),
    );
}
