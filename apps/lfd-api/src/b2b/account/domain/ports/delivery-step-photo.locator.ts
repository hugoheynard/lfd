/**
 * Port de **lecture** de la clé de photo d'une étape.
 *
 * Séparé de {@link DeliveryProcedureReader} parce que ses consommateurs le
 * sont : servir une image n'a besoin ni des titres ni des textes, et la route
 * de la photo est appelée une fois par vignette.
 */
export abstract class DeliveryStepPhotoLocator {
  /**
   * La clé de stockage de la photo de l'étape, ou `null` si l'étape n'en a pas
   * — ou n'appartient pas à cette adresse de cette société.
   */
  abstract photoKeyOf(companyId: string, addressId: string, stepId: string): Promise<string | null>;
}
