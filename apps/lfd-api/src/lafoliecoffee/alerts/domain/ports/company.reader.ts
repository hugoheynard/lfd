/**
 * Le dossier client, vu depuis `alerts/` : son existence, et le droit d'un
 * demandeur à s'y comparer.
 *
 * Un port étroit exprès : ce contexte n'a besoin de rien d'autre du dossier
 * client. Lui donner accès à une vue riche l'inviterait à en dépendre, et à
 * casser la frontière qu'on tient partout ailleurs.
 */
export abstract class AlertCompanyReader {
  abstract exists(companyId: string): Promise<boolean>;

  /**
   * Le demandeur est-il **membre** d'une société **active** ?
   *
   * Le mur du contrôle de panier. Ce qu'on y renvoie — « habituellement 4 » — est
   * l'habitude d'achat d'un compte : sans ce mur, n'importe quel client connecté
   * pourrait sonder celles d'un concurrent en essayant des identifiants de
   * société. Les deux conditions sont dans la même question parce qu'elles ont la
   * même réponse : non membre ou société non active, on ne compare rien.
   */
  abstract isActiveMember(userId: string, companyId: string): Promise<boolean>;
}
