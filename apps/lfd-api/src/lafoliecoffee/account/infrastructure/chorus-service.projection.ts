import type { ChorusServiceView } from "@lfd/contracts";

import { dayOfColumn } from "./chorus-service.columns.js";

/** Les colonnes de `company_chorus_service` que la fiche staff lit. */
export const CHORUS_SERVICE_SELECT = {
  payerCompanyId: true,
  serviceCode: true,
  commitmentNumber: true,
  commitmentEndsOn: true,
  recordedAt: true,
  recordedByName: true,
  recordedByRole: true,
} as const;

/** Une ligne de `company_chorus_service`, telle que {@link CHORUS_SERVICE_SELECT} la lit. */
export interface ChorusServiceRow {
  readonly payerCompanyId: string;
  readonly serviceCode: string;
  readonly commitmentNumber: string;
  readonly commitmentEndsOn: Date | null;
  readonly recordedAt: Date;
  readonly recordedByName: string;
  readonly recordedByRole: string;
}

/** La fiche du service Chorus rangée, telle que la fiche staff la montre. */
export function chorusServiceView(row: ChorusServiceRow | null): ChorusServiceView | null {
  if (row === null) {
    return null;
  }
  const endsOn = dayOfColumn(row.commitmentEndsOn);
  return {
    payerCompanyId: row.payerCompanyId,
    serviceCode: row.serviceCode,
    currentCommitment:
      row.commitmentNumber === "" || endsOn === null
        ? null
        : { number: row.commitmentNumber, endsOn },
    recordedAt: row.recordedAt.toISOString(),
    recordedBy: { name: row.recordedByName, role: row.recordedByRole },
  };
}
