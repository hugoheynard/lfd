import type { ReportDeliveryIncidentFields } from "@lfd/contracts";

/**
 * **« Déclarer un problème »** sur MA tournée (`a-la-porte.md`, § 3).
 * `photo` : les octets reçus, ou `null` — la photo est facultative.
 * `intentKey` : la clé que l'écran a fabriquée pour ce signalement — un envoi
 * rejoué (réseau du livreur qui coupe, double appui) n'en fait qu'un.
 */
export class ReportDeliveryIncidentCommand {
  constructor(
    readonly staffUserId: string,
    readonly roundId: string,
    readonly fields: ReportDeliveryIncidentFields,
    readonly photo: Buffer | null,
    readonly intentKey: string,
  ) {}
}
