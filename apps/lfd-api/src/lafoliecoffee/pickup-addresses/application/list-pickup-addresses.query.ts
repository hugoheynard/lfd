import type { CustomerAudience } from "@lfd/contracts";

/**
 * Query : lister les points de retrait proposés, par ancienneté.
 *
 * `audience` les borne à une clientèle — en base (Hugo, 2026-10-15 : « c'est
 * devenu un choix business ») ; `null` les rend tous, pour l'équipe.
 */
export class ListPickupAddressesQuery {
  constructor(readonly audience: CustomerAudience | null) {}
}
