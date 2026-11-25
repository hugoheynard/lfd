import { type DeliveryAddressBookRow, deliverySpecsSchema, type GpsPoint } from "@lfd/contracts";

/** Une adresse du carnet telle que la requête la lit, sans type Prisma. */
export interface DeliveryAddressBookSource {
  readonly id: string;
  readonly companyId: string;
  readonly label: string;
  readonly ligne1: string;
  readonly ligne2: string;
  readonly codePostal: string;
  readonly ville: string;
  readonly pays: string;
  readonly isDefault: boolean;
  readonly deliverySpecs: unknown;
  readonly depositAllowed: boolean;
  readonly doorstepRule: string | null;
  readonly parkingLat: number | null;
  readonly parkingLng: number | null;
  readonly tradeName: string;
  readonly legalName: string;
  readonly hasProcedure: boolean;
}

/**
 * Une ligne du carnet pour Tour manager. Des consignes illisibles se lisent
 * « sans consignes » (ni porte, ni note, ni contact, ni temps sur place) :
 * une adresse mal formée ne doit pas éteindre toute la table.
 */
export function deliveryAddressBookRowOf(
  source: DeliveryAddressBookSource,
): DeliveryAddressBookRow {
  const specs = deliverySpecsSchema.safeParse(source.deliverySpecs);
  const read = specs.success ? specs.data : null;
  return {
    addressId: source.id,
    companyId: source.companyId,
    tradeName: source.tradeName,
    legalName: source.legalName,
    addressLabel: source.label,
    ligne1: source.ligne1,
    ligne2: source.ligne2,
    codePostal: source.codePostal,
    ville: source.ville,
    pays: source.pays,
    isDefault: source.isDefault,
    door: read?.gps ?? null,
    parking: pointOf(source.parkingLat, source.parkingLng),
    note: read?.note ?? "",
    deliveryContact: read?.deliveryContact ?? null,
    depositAllowed: source.depositAllowed,
    doorstepRule: source.doorstepRule,
    stopMinutes: read?.stopMinutes ?? null,
    hasProcedure: source.hasProcedure,
  };
}

function pointOf(lat: number | null, lng: number | null): GpsPoint | null {
  return lat === null || lng === null ? null : { lat, lng };
}
