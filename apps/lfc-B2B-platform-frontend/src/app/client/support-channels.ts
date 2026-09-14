/** Ce que l'identité publiée de la plateforme dit pour joindre le service. */
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
 * Les canaux du service commercial, tirés de l'identité PUBLIÉE — les mêmes que
 * le pied de page affiche au bureau, corrigés au back-office sans déploiement.
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
