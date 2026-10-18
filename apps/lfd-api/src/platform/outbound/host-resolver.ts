import { lookup } from "node:dns/promises";

import { Injectable } from "@nestjs/common";

/** Une adresse résolue. */
export interface ResolvedAddress {
  readonly address: string;
  readonly family: 4 | 6;
}

/**
 * La résolution d'un nom — un port, pour que les tests du relais éprouvent le
 * refus d'une adresse privée sans dépendre du DNS de la machine.
 */
export abstract class HostResolver {
  /** Toutes les adresses du nom : le relais les vérifie TOUTES avant d'en épingler une. */
  abstract resolve(hostname: string): Promise<readonly ResolvedAddress[]>;
}

/** La résolution du système (`getaddrinfo`), celle qu'aurait faite la connexion. */
@Injectable()
export class DnsHostResolver extends HostResolver {
  async resolve(hostname: string): Promise<readonly ResolvedAddress[]> {
    const found = await lookup(hostname, { all: true, verbatim: true });
    return found.map(({ address, family }) => ({ address, family: family === 6 ? 6 : 4 }));
  }
}
