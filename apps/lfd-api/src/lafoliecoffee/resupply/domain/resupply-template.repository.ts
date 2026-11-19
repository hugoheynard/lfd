import type { ResupplyTemplate } from "./resupply-template.js";

/**
 * Port d'**écriture** des modèles de réassort : l'agrégat entier, chargé puis
 * rendu. `save` insère un modèle neuf (version 0 ; un identifiant déjà écrit
 * lève `ResupplyTemplateAlreadyWrittenError`) et réécrit les autres sous la
 * version lue — une version périmée lève `ResupplyTemplateChangedMeanwhileError`.
 * Un nom déjà porté par un modèle actif du point lève
 * `ResupplyTemplateNameTakenError`.
 */
export abstract class ResupplyTemplateRepository {
  abstract load(templateId: string): Promise<ResupplyTemplate | null>;

  abstract save(template: ResupplyTemplate): Promise<void>;
}
