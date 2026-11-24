import { NegotiatedScope } from "../../../domain/ports/negotiated-scope.js";

/** Aucun payeur sur devis de période : rien ne borne la commande. */
export class UnboundedNegotiatedScope extends NegotiatedScope {
  scopeFor(): Promise<ReadonlySet<string> | null> {
    return Promise.resolve(null);
  }
}

/**
 * Un tarif convenu posé par payeur ; un payeur absent n'est pas sur devis.
 * Garde les questions reçues, pour vérifier le payeur et le jour lus.
 */
export class RecordingNegotiatedScope extends NegotiatedScope {
  readonly asked: { readonly payerCompanyId: string; readonly day: string | null }[] = [];

  constructor(private readonly scopes: ReadonlyMap<string, readonly string[]>) {
    super();
  }

  scopeFor(payerCompanyId: string, day: string | null): Promise<ReadonlySet<string> | null> {
    this.asked.push({ payerCompanyId, day });
    const skus = this.scopes.get(payerCompanyId);
    return Promise.resolve(skus === undefined ? null : new Set(skus));
  }
}
