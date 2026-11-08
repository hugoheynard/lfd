/**
 * Port des modèles **hors de l'éditeur** (`outOfEditor` — la sonde de
 * déploiement) : listés à part, hors des problèmes (décision 10). Le
 * registre est du code, pas une table.
 */
export abstract class MailProbeTemplates {
  abstract keys(): readonly string[];
}
