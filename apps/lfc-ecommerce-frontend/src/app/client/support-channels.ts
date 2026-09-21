/**
 * Ce que le contenu de plateforme dit pour joindre le service commercial — le
 * `commercialContact`, et non l'identité du pied de page.
 */
export interface PublishedReach {
  readonly phone: string;
  readonly phoneHref: string;
  readonly email: string;
}

/** Un moyen de joindre le service : ce qu'on lit, et où le lien mène. */
export interface SupportChannel {
  readonly label: string;
  readonly href: string;
}

export interface SupportChannels {
  readonly phone: SupportChannel | null;
  readonly email: SupportChannel | null;
}

/**
 * Les canaux du service commercial, tirés du **contact commercial** du contenu
 * de plateforme — corrigé au back-office sans déploiement.
 *
 * ⚠️ Plus l'identité du pied de page, depuis le 2026-09-14 : le pied de page
 * affiche le standard de la maison, Mon compte la personne qui suit le compte
 * pro (Hugo). La fonction ne sait pas lequel on lui passe ; ce sont la carte et
 * le panneau qui lisent `ClientContent.commercialContact`.
 *
 * Partagé par la carte (qui se tait sans aucun canal) et par le panneau (qui les
 * donne) : deux lectures séparées sont deux occasions d'afficher un numéro que
 * l'autre ne connaît pas. Un canal non renseigné vaut `null`.
 */
export function supportChannels(reach: PublishedReach): SupportChannels {
  const phoneLabel = reach.phone.trim();
  const phoneHref = reach.phoneHref.trim();
  const emailLabel = reach.email.trim();
  return {
    phone:
      phoneLabel === ''
        ? null
        : {
            label: phoneLabel,
            href: phoneHref === '' ? `tel:${phoneLabel.replace(/\s/gu, '')}` : phoneHref,
          },
    email: emailLabel === '' ? null : { label: emailLabel, href: `mailto:${emailLabel}` },
  };
}
