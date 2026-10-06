/**
 * Port de **lecture** des accusés : quand CETTE personne a-t-elle lu CETTE
 * version — ou `null`, et le dialogue s'ouvre au départ.
 */
export abstract class DriverNoticeAcknowledgementsReader {
  abstract acknowledgedAt(staffUserId: string, version: number): Promise<Date | null>;
}
