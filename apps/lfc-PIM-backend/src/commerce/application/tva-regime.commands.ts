/**
 * Commandes des régimes de TVA — une classe par intention, dispatchées par le
 * `CommandBus`. Le `tag` (handle Shopify) n'y figure pas : il est **dérivé** du taux
 * par le handler, jamais saisi.
 */
export interface TvaRegimePayload {
  readonly name: string;
  readonly description?: string | undefined;
  readonly percent: number;
}

export class CreateTvaRegimeCommand {
  constructor(readonly payload: TvaRegimePayload) {}
}

export class UpdateTvaRegimeCommand {
  constructor(
    readonly id: string,
    readonly payload: TvaRegimePayload,
  ) {}
}

export class RemoveTvaRegimeCommand {
  constructor(readonly id: string) {}
}
