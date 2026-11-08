import { Injectable } from "@nestjs/common";

import { AddressPrint } from "../../domain/ports/address-print.js";
import { MarketingAddress, marketingKeyOf } from "../../domain/value-objects/marketing-address.js";

/**
 * Fait d'une adresse saisie ou d'une clé déchiffrée l'adresse du registre :
 * sa clé normalisée et son empreinte à clé. Le seul endroit qui appelle
 * {@link AddressPrint}.
 */
@Injectable()
export class MarketingAddresses {
  constructor(private readonly prints: AddressPrint) {}

  of(address: string): MarketingAddress {
    const key = marketingKeyOf(address);
    return MarketingAddress.of(key, this.prints.of(key));
  }
}
