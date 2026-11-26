/** Le récapitulatif qu'un rectificatif remplace — le PDF et l'e-mail le nomment (D8). */
export abstract class ReplacedRecapReader {
  /** Le numéro du récapitulatif remplacé par celui-ci ; `null` pour une première émission. */
  abstract numberReplacedBy(recapId: string): Promise<string | null>;
}
