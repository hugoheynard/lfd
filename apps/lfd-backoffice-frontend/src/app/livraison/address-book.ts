import type { DeliveryAddressBookRow, GpsPoint } from '@lfd/contracts';

/** Six décimales : de l'ordre de 10 cm, la précision d'une porte. */
const GPS_DECIMALS = 6;

/** Le zoom d'OpenStreetMap où l'on distingue une porte d'une autre. */
const MAP_ZOOM = 19;

const DOORSTEP_RULE_LABELS: Readonly<Record<string, string>> = {
  ask: 'Demander',
  deposit: 'Déposer',
  bring_back: 'Rapporter',
};

/** « 45.566080, 5.918000 ». */
export function gpsLabelOf(point: GpsPoint): string {
  return `${point.lat.toFixed(GPS_DECIMALS)}, ${point.lng.toFixed(GPS_DECIMALS)}`;
}

/** Le point sur OpenStreetMap, marqueur posé, au zoom d'une rue. */
export function osmUrlOf(point: GpsPoint): string {
  const lat = point.lat.toFixed(GPS_DECIMALS);
  const lng = point.lng.toFixed(GPS_DECIMALS);
  return `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=${MAP_ZOOM}/${lat}/${lng}`;
}

/** La règle à la porte en mots ; `null` renvoie au réglage global. */
export function doorstepRuleLabelOf(rule: string | null): string {
  if (rule === null) {
    return 'Réglage global';
  }
  return DOORSTEP_RULE_LABELS[rule] ?? rule;
}

/** « 5 min », ou « global » quand l'adresse suit le réglage global. */
export function stopMinutesLabelOf(minutes: number | null): string {
  return minutes === null ? 'global' : `${String(minutes)} min`;
}

/** Ce que la recherche et le filtre retiennent. */
export interface AddressBookFilter {
  readonly query: string;
  readonly withoutGpsOnly: boolean;
}

/** Sans point GPS : ni porte, ni stationnement. */
export function lacksGps(row: DeliveryAddressBookRow): boolean {
  return row.door === null && row.parking === null;
}

function fold(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();
}

/** Les adresses qui répondent à la recherche (client, ville, libellé, note) et au filtre. */
export function filterAddressBook<Row extends DeliveryAddressBookRow>(
  rows: readonly Row[],
  filter: AddressBookFilter,
): readonly Row[] {
  const needle = fold(filter.query.trim());
  return rows.filter((row) => {
    if (filter.withoutGpsOnly && !lacksGps(row)) {
      return false;
    }
    if (needle === '') {
      return true;
    }
    return [row.tradeName, row.legalName, row.ville, row.addressLabel, row.note].some((field) =>
      fold(field).includes(needle),
    );
  });
}
