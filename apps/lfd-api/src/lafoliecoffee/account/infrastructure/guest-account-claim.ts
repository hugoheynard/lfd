import { Injectable } from "@nestjs/common";

import type { VerifiedToken } from "../../../platform/auth/principal.js";
import { PrismaService } from "../../../platform/database/prisma.service.js";
import { DomainEventPublisher } from "../../../platform/events/domain-event-publisher.js";
import { Clock } from "../../../platform/time/clock.js";
import { GuestAccountClaimedEvent } from "../domain/events/guest-account-claimed.event.js";
import { mayClaimGuestFile, soleGuestFile } from "../domain/services/guest-claim.js";
import { normalizeEmail, tokenProvesAddress } from "./token-address-proof.js";

/**
 * Ce qu'il advient de la fiche invité à la première entrée d'un `sub` :
 *
 * - `none` — rien à rattacher (connexion non admise, adresse non prouvée ou
 *   vide, aucune fiche ou plusieurs) : un compte neuf sera créé ;
 * - `claimed` — CETTE requête a posé le `sub` sur la fiche ;
 * - `lost` — une autre requête a pris la fiche entre la lecture et
 *   l'écriture : relire avant de conclure.
 */
export type GuestClaimOutcome = "none" | "claimed" | "lost";

/** Une fiche invité, réduite à ce que le rattachement lit. */
interface GuestFile {
  readonly id: string;
  readonly email: string;
}

/**
 * **L'invité qui devient le compte** (R1 du plan
 * `documentation/comptabilite/fidelite/plan-bienvenue-et-invite-rattache.md`,
 * corrigé par son §7).
 *
 * Appelé par `UnknownSubjectAdmission` quand AUCUN compte connectable ne
 * porte l'adresse du jeton — la règle anti-doublon a déjà parlé. Si la
 * connexion prouve la boîte (`mayClaimGuestFile`) et qu'une seule fiche
 * invité (`auth0_sub IS NULL`) porte cette adresse, on pose le `sub` sur elle
 * au lieu de créer un compte : ses commandes, et leurs points, la suivent.
 *
 * 🔴 L'écriture est conditionnelle (`id` ET `auth0_sub IS NULL`) : deux
 * premières entrées simultanées ne prennent pas la fiche deux fois ; la
 * perdante rend `lost` et relit, comme une invitation disputée.
 *
 * Le statut n'est pas écrit : une fiche invité est `active` (D1 du plan sans
 * compte), le statut qu'a un compte créé au provisionnement. Une fiche que le
 * staff a désactivée reste désactivée — et l'entrée est refusée ensuite par le
 * résolveur, comme pour tout compte désactivé.
 *
 * `became_account_at` est posé ici sans garde « déjà posé » : une fiche sans
 * `sub` ne l'a jamais (aucun chemin ne retire un `sub`, vérifié le 2026-10-11).
 */
@Injectable()
export class GuestAccountClaim {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: DomainEventPublisher,
    private readonly clock: Clock,
  ) {}

  async claim(token: VerifiedToken): Promise<GuestClaimOutcome> {
    const email = token.email ?? "";
    // La preuve se compare à l'adresse du jeton lui-même : la fiche cherchée
    // porte, par construction, la même adresse normalisée.
    const claimant = {
      subject: token.subject,
      email,
      addressProven: tokenProvesAddress(token, email),
    };
    if (!mayClaimGuestFile(claimant)) {
      return "none";
    }
    const guest = soleGuestFile(await this.guestFilesOf(email));
    if (guest === null) {
      return "none";
    }
    const { count } = await this.prisma.user.updateMany({
      where: { id: guest.id, auth0Sub: null },
      data: { auth0Sub: token.subject, emailVerified: true, becameAccountAt: this.clock.now() },
    });
    if (count !== 1) {
      return "lost";
    }
    this.events.publish(new GuestAccountClaimedEvent(guest.id));
    return "claimed";
  }

  /**
   * Les fiches invité de cette adresse. Même normalisation que le registrar
   * invité (`orders/infrastructure/prisma-guest-buyer.registrar.ts`) — blancs
   * et casse —, et la comparaison est refaite en mémoire : `mode:
   * "insensitive"` compile en `ILIKE` sans échapper `_` ni `%` (constaté le
   * 2026-09-14, Prisma 7.8).
   */
  private async guestFilesOf(email: string): Promise<readonly GuestFile[]> {
    const candidates = await this.prisma.user.findMany({
      where: { auth0Sub: null, email: { equals: email.trim(), mode: "insensitive" } },
      select: { id: true, email: true },
    });
    const target = normalizeEmail(email);
    return candidates.filter((candidate) => normalizeEmail(candidate.email) === target);
  }
}
