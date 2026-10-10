import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import { UserStatus } from "../../../platform/database/client/client.js";
import { UnitOfWork } from "../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../platform/events/domain-event-publisher.js";
import type { VerifiedToken } from "../../../platform/auth/principal.js";
import { AccountExistsUnderAnotherSignInError } from "../domain/errors/account-errors.js";
import { InvitationExpiredError } from "../domain/errors/invitation-errors.js";
import { personName } from "../domain/events/journal-names.js";
import { LoginMethodSwitchedAtFirstEntryEvent } from "../domain/events/person-acts.event.js";
import { signInRouteOfSubject } from "../domain/value-objects/sign-in-route.js";
import { Clock } from "../../../platform/time/clock.js";
import { MembershipAcceptance } from "./membership-acceptance.js";

/**
 * Ce qu'il advient d'un `sub` inconnu avant qu'on lui crée un compte :
 *
 * - `new` — aucun compte connectable ne porte son adresse : on peut créer ;
 * - `claimed` — c'était la première entrée d'un invité, et CETTE requête a
 *   rattaché son compte au nouveau `sub` ;
 * - `lost` — une autre requête a modifié le compte invité entre la lecture et
 *   l'écriture : relire avant de conclure.
 */
export type Admission = "new" | "claimed" | "lost";

/** Un compte connectable qui porte déjà l'adresse du jeton. */
interface Holder {
  readonly id: string;
  readonly email: string;
  readonly auth0Sub: string | null;
  readonly status: UserStatus;
  readonly firstName: string;
  readonly lastName: string;
}

/**
 * **Que faire d'un `sub` qu'on ne connaît pas, sous une adresse qu'on connaît.**
 *
 * Sorti de `CustomerPrincipalResolver` le 2026-10-09 (connexion par code
 * e-mail), quand la règle a gagné un second cas et le résolveur dépassé la
 * taille d'un fichier.
 *
 * ## 🔴 Pas de second compte, quel que soit le moyen
 *
 * Un sujet inconnu dont l'adresse est déjà portée par un compte connectable
 * (`auth0_sub` non nul) sous un AUTRE `sub` est refusé, et le refus nomme le
 * moyen par lequel le compte existant se connecte. Les sujets `auth0|…` en
 * étaient exemptés jusqu'au 2026-10-09, au motif qu'Auth0 refuse lui-même une
 * seconde inscription sous la même adresse : c'est vrai DANS une connexion,
 * faux entre deux — et la connexion `email` existe à côté depuis ce jour-là.
 * Un `auth0|…` inconnu sous l'adresse d'un compte ouvert par code ouvrait donc
 * un doublon.
 *
 * ## La seule exception : la première entrée d'un invité
 *
 * Un client invité par le staff a reçu une identité à mot de passe (`auth0|…`)
 * et un lien pour la poser. Mesuré en production le 2026-10-09 : 43 comptes
 * dans cet état, `invited`, jamais entrés. Avec la seule règle anti-doublon,
 * chacun aurait été REFUSÉ en arrivant par code.
 *
 * Le compte est donc RATTACHÉ au nouveau `sub` quand, à la fois :
 *
 * - le jeton **prouve** l'adresse (`email_verified`) — un code reçu, un
 *   fournisseur qui l'atteste ;
 * - un SEUL compte porte cette adresse, et il est `invited` — c'est-à-dire
 *   jamais entré : `CustomerPrincipalResolver.record` le passe `active` à la
 *   première requête authentifiée, et rien d'autre ne le remet `invited`.
 *
 * La justification (2026-10-09) : l'invitation a été envoyée à CETTE boîte,
 * qui pouvait déjà entrer par le lien de l'invitation. Prouver la boîte par un
 * code ne donne rien de plus que ce que le lien donnait déjà. Hors de ce cas —
 * compte actif, déjà entré —, le refus tient.
 *
 * ⚠️ **Cette justification n'était vraie que pendant la vie du lien**
 * (corrigé le 2026-10-10, §8.1 bis de
 * `architecture-compte-client-cycle-de-vie.md`). Le lien meurt au bout de
 * 7 jours ; le code, lui, ne meurt pas. Sans autre garde, prouver la boîte
 * donnait donc PLUS que le lien : une entrée des mois après l'invitation. Le
 * rattachement exige désormais qu'au moins une invitation vive encore
 * (`claim`), et n'accepte que celles-là.
 *
 * L'écriture est conditionnelle (`id`, `status = invited`, ancien `sub`) et
 * passe le compte `active` dans le même geste : deux premières entrées
 * simultanées sous deux moyens différents n'en font gagner qu'une, et la
 * perdante, en relisant, trouve un compte actif — donc le refus.
 *
 * ⚠️ L'ancienne identité `auth0|…` reste chez Auth0 : aucun appel à l'API de
 * gestion n'est fait. Elle n'ouvre plus rien chez nous, son `sub` n'étant plus
 * celui d'aucun compte ; son lien d'invitation, s'il est suivi, crée une
 * session sur un `sub` inconnu — qui tombe alors sous la règle anti-doublon.
 *
 * Le préfixe du sujet n'est lu que pour PARLER (nommer le moyen, le journal) :
 * aucun accès n'en dépend.
 */
@Injectable()
export class UnknownSubjectAdmission {
  constructor(
    private readonly prisma: PrismaService,
    private readonly unitOfWork: UnitOfWork,
    private readonly events: DomainEventPublisher,
    private readonly acceptance: MembershipAcceptance,
    private readonly clock: Clock,
  ) {}

  /**
   * @throws {AccountExistsUnderAnotherSignInError} l'adresse est portée par un
   *   compte connectable qui n'est pas un invité jamais entré, ou le jeton ne
   *   prouve pas l'adresse.
   */
  async admit(token: VerifiedToken): Promise<Admission> {
    const email = token.email?.trim() ?? "";
    if (email === "") {
      return "new";
    }
    const holders = await this.holdersOf(email);
    const [only] = holders;
    if (only === undefined) {
      return "new";
    }
    if (holders.length === 1 && token.emailVerified === true && isNeverEntered(only)) {
      return (await this.claim(only, token)) ? "claimed" : "lost";
    }
    throw new AccountExistsUnderAnotherSignInError(signInRouteOfSubject(only.auth0Sub ?? ""));
  }

  /**
   * Les comptes connectables de cette adresse. La comparaison est refaite en
   * mémoire : `mode: "insensitive"` compile en `ILIKE` sans échapper `_` ni `%`
   * (constaté le 2026-09-14, Prisma 7.8).
   */
  private async holdersOf(email: string): Promise<readonly Holder[]> {
    const candidates = await this.prisma.user.findMany({
      where: { auth0Sub: { not: null }, email: { equals: email, mode: "insensitive" } },
      select: {
        id: true,
        email: true,
        auth0Sub: true,
        status: true,
        firstName: true,
        lastName: true,
      },
    });
    const target = normalizeEmail(email);
    return candidates.filter((candidate) => normalizeEmail(candidate.email) === target);
  }

  /**
   * Réécrit le `sub` du compte invité et l'active, à condition qu'il soit
   * toujours invité et toujours sous son ancien `sub`, ET qu'au moins un de
   * ses rattachements l'accueille ; la trace part dans la même transaction.
   * Rend `false` si une autre requête est passée avant.
   *
   * 🔴 C'est ICI que passait le trou de l'invitation expirée (objection B1 de
   * `vitruve`, 2026-10-10) : une connexion par code ou par Google arrive
   * toujours par ce chemin, jamais par `record()`. Les rattachements dont
   * l'invitation vit sont acceptés dans la même transaction ; s'il n'y en a
   * aucun, tout est défait — ni `sub` réécrit, ni statut — et l'entrée est
   * refusée (§8.1 bis, point 2).
   *
   * @throws {InvitationExpiredError} aucune invitation vivante.
   */
  private async claim(holder: Holder, token: VerifiedToken): Promise<boolean> {
    try {
      return await this.unitOfWork.run(() => this.claimOrUndo(holder, token));
    } catch (error) {
      // Levée DANS la transaction pour la défaire ; dite (journal, cloche) APRÈS,
      // pour que le fait du refus ne soit pas défait avec elle.
      if (error instanceof InvitationExpiredError) {
        return this.acceptance.refuse(holder.id);
      }
      throw error;
    }
  }

  private async claimOrUndo(holder: Holder, token: VerifiedToken): Promise<boolean> {
    const { count } = await this.prisma.user.updateMany({
      where: { id: holder.id, status: UserStatus.invited, auth0Sub: holder.auth0Sub },
      data: { auth0Sub: token.subject, status: UserStatus.active },
    });
    if (count !== 1) {
      return false;
    }
    if ((await this.acceptance.acceptLive(holder.id, this.clock.now())) === 0) {
      // Lever défait la transaction : la réécriture du `sub` ne survit pas.
      throw new InvitationExpiredError(holder.id);
    }
    await this.events.publishTraced(
      new LoginMethodSwitchedAtFirstEntryEvent(
        holder.id,
        personName(holder.firstName, holder.lastName),
        providerOf(token.subject),
        null,
      ),
    );
    return true;
  }
}

/** Invité jamais entré : la première requête authentifiée l'aurait passé `active`. */
function isNeverEntered(holder: Holder): boolean {
  return holder.status === UserStatus.invited;
}

/** Le fournisseur d'un sujet — ce qui précède la barre —, pour le journal. */
function providerOf(subject: string): string {
  const bar = subject.indexOf("|");
  return bar <= 0 ? "unknown" : subject.slice(0, bar);
}

/** Forme de comparaison d'une adresse : la casse et les blancs ne font pas une autre adresse. */
function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}
