import type { CustomerAudience } from "@lfd/contracts";

/**
 * **Le public de qui écrit**, déduit au serveur — jamais pris au corps.
 * `b2b` pour une société ACTIVE (`audienceOf`, la même règle que la caisse),
 * `b2c` sinon.
 */
export abstract class ContactSenderAudience {
  /** `null` = espace perso : `b2c`, sans lecture. */
  abstract of(companyId: string | null): Promise<CustomerAudience>;
}
