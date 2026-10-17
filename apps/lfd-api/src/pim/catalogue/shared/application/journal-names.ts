import { contextLabelsOf } from "../../../sales-contexts/application/context-labels.js";
import { SalesContextRegistry } from "../../../sales-contexts/domain/ports/sales-context.registry.js";
import { VatRateNotFoundError } from "../../../vat-rates/domain/errors/vat-rate-errors.js";
import { VatRateRepository } from "../../../vat-rates/domain/ports/vat-rate.repository.js";

/**
 * **Les noms que les faits du catalogue figent** (D5 du plan des phrases du
 * journal, lot B) : un objet cité l'est avec son nom **du moment**, parce que
 * le journal dit ce qui était vrai quand c'est arrivé. Un taux renommé depuis
 * se lit sous son ancien nom sur les lignes d'avant.
 *
 * Partagé par les familles et les fiches, qui citent les mêmes taux : deux
 * façons de les nommer finiraient par raconter deux histoires. (La matrice
 * des canaux, qu'elles citaient aussi, ne s'écrit plus depuis X4.)
 *
 * Un objet cité introuvable est un **refus**, pas un nom inventé : la base
 * refuserait de toute façon l'écriture qui le cite (clé étrangère), et un
 * journal qui écrirait l'identifiant à la place du nom mentirait sur ce qu'il
 * sait.
 */

/** Un objet cité avec son nom du moment. */
export interface NamedRef {
  readonly id: string;
  readonly name: string;
}

/** Un changement de taux, contexte par contexte — la charge des faits `*.vat_changed`. */
export type VatChange = Readonly<
  Record<string, { readonly from: string | null; readonly to: string | null }>
>;

/** Le même changement, chaque taux nommé. */
export type NamedVatChange = Readonly<
  Record<string, { readonly from: NamedRef | null; readonly to: NamedRef | null }>
>;

/**
 * Nomme les taux d'un changement de TVA.
 *
 * @throws {VatRateNotFoundError} un taux cité n'existe pas.
 */
async function namedVatChange(
  change: VatChange,
  rates: VatRateRepository,
): Promise<NamedVatChange> {
  const names = new Map(
    (await rates.listAll()).map((rate) => [rate.id, rate.snapshot().name] as const),
  );
  const nameOf = (id: string | null): NamedRef | null => {
    if (id === null) {
      return null;
    }
    const name = names.get(id);
    if (name === undefined) {
      throw new VatRateNotFoundError(id);
    }
    return { id, name };
  };
  return Object.fromEntries(
    Object.entries(change).map(([context, { from, to }]) => [
      context,
      { from: nameOf(from), to: nameOf(to) },
    ]),
  );
}

/**
 * **La charge d'un fait `*.vat_changed`**, hors sujet : chaque taux nommé, et
 * le libellé du moment de chaque contexte cité (`contextLabels`, lot D du plan
 * des phrases, 2026-09-19) — sans lui, un contexte créé à l'écran se lisait
 * sous sa clé.
 *
 * Partagée par les quatre écrivains (taux et canaux, famille et fiche) : un
 * écrivain qui oublierait la table écrirait une charge que le catalogue refuse
 * sous le harnais.
 *
 * @throws {VatRateNotFoundError} un taux cité n'existe pas.
 */
export async function vatChangePayload(
  change: VatChange,
  rates: VatRateRepository,
  contexts: SalesContextRegistry,
): Promise<{
  readonly vatByContext: NamedVatChange;
  readonly contextLabels: Readonly<Record<string, string>>;
}> {
  return {
    vatByContext: await namedVatChange(change, rates),
    contextLabels: await contextLabelsOf(contexts, Object.keys(change)),
  };
}
