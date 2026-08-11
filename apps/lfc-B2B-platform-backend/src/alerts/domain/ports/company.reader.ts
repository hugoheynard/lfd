/**
 * L'existence d'une société, vue depuis `alerts/`.
 *
 * Un port étroit exprès : ce contexte n'a besoin de rien d'autre du dossier
 * client. Lui donner accès à une vue riche l'inviterait à en dépendre, et à
 * casser la frontière qu'on tient partout ailleurs.
 */
export abstract class AlertCompanyReader {
  abstract exists(companyId: string): Promise<boolean>;
}
