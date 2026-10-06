import type { ReportDeliveryIncidentFields } from "@lfd/contracts";

/**
 * **« Déclarer un problème »** sur MA tournée (`a-la-porte.md`, § 3).
 * `photo` : les octets reçus, ou `null` — la photo est facultative.
 */
export class ReportDeliveryIncidentCommand {
  constructor(
    readonly staffUserId: string,
    readonly roundId: string,
    readonly fields: ReportDeliveryIncidentFields,
    readonly photo: Buffer | null,
  ) {}
}
