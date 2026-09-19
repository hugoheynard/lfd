import { AppellationAggregate } from "../../domain/entities/appellation.entity.js";
import type { InMemoryAppellationRepository } from "./in-memory-repositories.js";

/** La fiche d'appellation de départ des suites de ses trois gestes. */
export const APPELLATION_PAYLOAD = {
  code: "aop-beaufort",
  label: { fr: "Beaufort" },
  scheme: "AOP",
};

/** La fiche d'ingrédient de départ des suites de ses trois gestes. */
export const INGREDIENT_PAYLOAD = {
  key: "beurre-de-savoie",
  name: { fr: "Beurre de Savoie" },
  description: null,
  origin: "Savoie, France",
  appellationCode: null,
};

/** Une appellation posée directement dans le faux dépôt, sans passer par son handler. */
export function seedAppellation(
  appellations: InMemoryAppellationRepository,
  code: string,
  id: string,
) {
  return appellations.add(
    AppellationAggregate.open({ id, code, label: { fr: "Beaufort" }, scheme: "AOP", active: true }),
  );
}
