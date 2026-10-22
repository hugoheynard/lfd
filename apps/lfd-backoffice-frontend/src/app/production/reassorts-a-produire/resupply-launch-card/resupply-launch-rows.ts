import type { ResupplyProductionDayView } from '@lfd/contracts';

/** Un réassort « au plus tôt » envoyé, tel que la carte « Au plus tôt » le montre. */
export interface ResupplyLaunchRow {
  readonly resupplyId: string;
  readonly siteLabel: string;
  readonly name: string | null;
  readonly pieces: number;
  /** L'envoi : instant ISO, et nom figé de qui l'a envoyé. */
  readonly placedAt: string;
  readonly placedBy: string | null;
  /** Instant ISO du lancement au fournil ; `null` tant qu'il ne l'est pas. */
  readonly launchedAt: string | null;
  readonly launchedBy: string | null;
  /** « Parti » (R4d) : la tournée qui porte son transfert ; `null` sinon. */
  readonly departedAt: string | null;
  readonly departedBy: string | null;
  /** « Arrivé » (R3e) : transfert reçu, ou « Monté » ; `null` sinon. */
  readonly arrivedAt: string | null;
  readonly arrivedBy: string | null;
}

/** Faute de nom au répertoire, le point reste désigné — jamais une ligne vide. */
const UNKNOWN_POINT = 'Point inconnu';

/**
 * Les réassorts « au plus tôt » ENVOYÉS de la journée, tous points (R4a) :
 * ceux que le fournil peut lancer, et ceux qu'il a lancés. Un annulé ni un
 * « pour demain » n'en sont : le soir entre au plan par l'arrêt.
 */
export function resupplyLaunchRows(view: ResupplyProductionDayView): readonly ResupplyLaunchRow[] {
  return view.sites.flatMap((site) =>
    site.resupplies
      .filter((resupply) => resupply.target === 'asap' && resupply.status === 'placed')
      .map((resupply) => ({
        resupplyId: resupply.id,
        siteLabel: site.siteLabel ?? UNKNOWN_POINT,
        name: resupply.name,
        pieces: resupply.lines.reduce((sum, line) => sum + line.quantity, 0),
        placedAt: resupply.placedAt,
        placedBy: resupply.placedBy,
        launchedAt: resupply.launchedAt,
        launchedBy: resupply.launchedBy,
        departedAt: resupply.departedAt,
        departedBy: resupply.departedBy,
        arrivedAt: resupply.arrivedAt,
        arrivedBy: resupply.arrivedBy,
      })),
  );
}
