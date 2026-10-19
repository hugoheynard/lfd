import type { Bundle } from "../../domain/entities/bundle.js";
import type { BundleSnapshot } from "../../domain/entities/bundle-shapes.js";
import { BundleNotFoundError } from "../../domain/errors/bundle-errors.js";
import type { BundleSubject } from "../../domain/events/bundle.events.js";
import type { BundleRepository } from "../../domain/ports/bundle.repository.js";

/** Ce que les gestes d'écriture des formules partagent : charger ou refuser, nommer le sujet. */

/** @throws {BundleNotFoundError} aucune formule ne porte cette clé. */
export async function requireBundle(bundles: BundleRepository, key: string): Promise<Bundle> {
  const bundle = await bundles.load(key);
  if (bundle === null) {
    throw new BundleNotFoundError(key);
  }
  return bundle;
}

/** Le sujet d'un fait : la clé, et le nom du moment. */
export function subjectOf(snapshot: BundleSnapshot): BundleSubject {
  return { key: snapshot.key, name: snapshot.name };
}
