import { InvalidOpeningAuthorError } from "../errors/account-errors.js";

/**
 * Qui, dans l'équipe, a ouvert une fiche — l'id de sa fiche d'annuaire, et
 * son nom **figé** à l'ouverture.
 *
 * `name` vaut `null` quand l'annuaire ne connaît pas l'auteur (marqueur de
 * semis, `sub` jamais relié) : on garde l'identifiant, on n'invente pas un nom.
 */
export interface OpeningAuthor {
  readonly staffUserId: string;
  readonly name: string | null;
}

/** Les trois valeurs telles que rangées en base, pour la relecture. */
export interface CompanyOpeningRecord {
  readonly declaredByStaffId: string | null;
  readonly declaredByName: string | null;
  readonly followedByStaffId: string | null;
}

/**
 * **Qui a ouvert la fiche, et qui la suit** — ce qui fait d'une ouverture par
 * l'équipe une acquisition qu'on peut piloter (`plan-suivi-commercial.md`, § 3.1).
 *
 * Trois naissances, et seulement trois, chacune par une fabrique qui la nomme :
 *
 * - un prospect ouvert par l'équipe (`openedBy`) : l'auteur, et le suiveur est
 *   l'auteur ;
 * - un site créé sous un principal (`siteOpenedBy`) : l'auteur, mais aucun
 *   suiveur — un site est de la structure, pas de l'acquisition ;
 * - une inscription du client (`none`) : ni auteur ni suiveur, tant que
 *   personne ne l'attribue.
 *
 * L'auteur est un fait de naissance, jamais muté ; le suiveur, lui, change
 * par un geste nommé de la société (`Company.assignFollower`).
 */
export class CompanyOpening {
  private constructor(
    readonly author: OpeningAuthor | null,
    readonly followerStaffId: string | null,
  ) {}

  /** Une société que le client a déclarée lui-même : personne ne l'a ouverte pour lui. */
  static none(): CompanyOpening {
    return new CompanyOpening(null, null);
  }

  /**
   * Un prospect ouvert par l'équipe : celui qui l'ouvre le suit.
   *
   * @throws {InvalidOpeningAuthorError} l'auteur n'a pas d'identifiant.
   */
  static openedBy(author: OpeningAuthor): CompanyOpening {
    const checked = checkedAuthor(author);
    return new CompanyOpening(checked, checked.staffUserId);
  }

  /**
   * Un site créé sous un principal : l'auteur est gardé, mais personne ne le
   * « suit » — le suivi commercial est celui du principal.
   *
   * @throws {InvalidOpeningAuthorError} l'auteur n'a pas d'identifiant.
   */
  static siteOpenedBy(author: OpeningAuthor): CompanyOpening {
    return new CompanyOpening(checkedAuthor(author), null);
  }

  /** La même ouverture, suivie par `followerStaffId` (ou par personne) ; l'auteur ne bouge pas. */
  withFollower(followerStaffId: string | null): CompanyOpening {
    return new CompanyOpening(this.author, followerStaffId);
  }

  /** Relit ce que la base a rangé, sans le revalider : une ligne lue est déjà passée par ici. */
  static reconstitute(record: CompanyOpeningRecord): CompanyOpening {
    return new CompanyOpening(
      record.declaredByStaffId === null
        ? null
        : { staffUserId: record.declaredByStaffId, name: record.declaredByName },
      record.followedByStaffId,
    );
  }
}

/** Un auteur sans identifiant n'est pas un auteur ; un nom blanc est un nom inconnu. */
function checkedAuthor(author: OpeningAuthor): OpeningAuthor {
  const staffUserId = author.staffUserId.trim();
  if (staffUserId === "") {
    throw new InvalidOpeningAuthorError();
  }
  const name = author.name?.trim() ?? "";
  return { staffUserId, name: name === "" ? null : name };
}
