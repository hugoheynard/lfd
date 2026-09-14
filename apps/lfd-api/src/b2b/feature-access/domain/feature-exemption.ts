import type { FeatureKey } from "@lfd/contracts";

import { EmailAddress } from "../../account/domain/value-objects/email-address.js";
import type { StaffTrace } from "../../account/domain/value-objects/staff-trace.js";
import { requireFeatureKey } from "./feature-override.js";

/**
 * Une **exemption** : une adresse qui garde le niveau le plus ouvert d'une clé.
 *
 * L'adresse passe par {@link EmailAddress} — le même contrôle et la même
 * normalisation que l'e-mail d'un compte client. C'est ce qui garantit que
 * l'adresse écrite ici se compare à l'identique à celle d'un `Principal` : deux
 * normalisations écrites séparément finiraient par diverger, et l'exemption ne
 * jouerait plus pour une majuscule.
 */
export class FeatureExemption {
  private constructor(
    readonly id: string,
    readonly key: FeatureKey,
    readonly email: string,
    readonly at: Date,
    readonly author: StaffTrace,
  ) {}

  /**
   * @throws {UnknownFeatureError} la clé n'est pas au catalogue.
   * @throws {InvalidEmailError} l'adresse n'en est manifestement pas une.
   */
  static grant(input: {
    readonly id: string;
    readonly key: string;
    readonly email: string;
    readonly at: Date;
    readonly author: StaffTrace;
  }): FeatureExemption {
    const key = requireFeatureKey(input.key);
    const email = EmailAddress.create(input.email).value;
    return new FeatureExemption(input.id, key, email, input.at, input.author);
  }
}
