import { POSITION_RETENTION_DAYS } from "../services/position-retention.js";

/**
 * **Le texte d'information du livreur sur ses données** — source unique
 * (`documentation/legal/rgpd-livreur.md`, §7 point 2 et §8).
 *
 * Une INFORMATION préalable, pas un consentement (Hugo, 2026-10-06) : entre
 * employeur et salarié, le consentement n'est pas une base valable.
 *
 * 🔴 **Ce texte est tenu par une porte.** `documentation/legal/rgpd-registre.json`
 * porte `texteInformation: { version, empreinte }` : l'empreinte des entrées
 * `livreur` du registre doit être celle que CETTE version a vue
 * (`pnpm lint:rgpd-staff`). Ajouter une donnée du livreur fait échouer la porte
 * tant qu'on n'a pas écrit ici une nouvelle version — et une nouvelle version
 * réaffiche le dialogue une fois à chaque livreur.
 *
 * **Version 2** (2026-10-06) : la position du téléphone, relevée au geste
 * seulement (`documentation/livraisons/livreur/gps-y-aller-et-position.md`, YA-D4).
 * Hugo, le même jour : on PRÉVIENT, on ne demande pas — le texte énonce un
 * fait, et ne propose aucun refus. Le geste n'est jamais bloqué par une
 * position indisponible : c'est un comportement, pas une option offerte.
 *
 * Les durées : seule la position en a une, `POSITION_RETENTION_DAYS` (60 j) ;
 * le registre dit toutes les autres `aucune-limite-decidee` ou `a-decider`
 * pour le livreur et le réceptionnaire (vérifié le 2026-10-06) — le texte le
 * dit, sans en inventer. Le contact n'existe dans aucun document
 * légal du dépôt (`texte-politique-de-confidentialite.md` le laisse « À
 * COMPLÉTER ») : il reste à compléter ici aussi.
 */
export interface DriverInformationNotice {
  readonly version: number;
  readonly title: string;
  readonly intro: string;
  readonly sections: readonly DriverNoticeSection[];
}

export interface DriverNoticeSection {
  readonly heading: string;
  readonly lines: readonly string[];
}

/** La phrase que le livreur dit à la personne qui réceptionne. */
export const RECEIVER_SENTENCE =
  "« Nous enregistrons votre nom, une photo de la livraison et, si besoin, votre signature, pour prouver que la commande vous a été remise. »";

export const CURRENT_DRIVER_NOTICE: DriverInformationNotice = {
  version: 2,
  title: "Vos données de livreur",
  intro:
    "Avant de démarrer, voici ce que l'application enregistre quand vous livrez, pourquoi, qui le voit et combien de temps. Ce n'est pas une demande d'accord : c'est une information. Vous pouvez relire ce texte à tout moment dans « Mes données ».",
  sections: [
    {
      heading: "Ce qui est enregistré sur vous",
      lines: [
        "Les tournées qui vous sont affectées.",
        "L'heure de départ de votre tournée, l'heure de votre arrivée à chaque arrêt, l'heure de clôture de chaque arrêt et l'heure de votre retour.",
        `La position de votre téléphone est relevée au moment de chaque geste (arrivée, remise, dépôt, clôture d'un arrêt sans remise), jamais en continu. Si le téléphone ne la donne pas, le geste est enregistré sans elle.`,
        "Les bacs que vous chargez, et quand.",
        "Les problèmes que vous signalez : leur motif, votre note, la photo si vous en prenez une, et l'heure.",
        "Votre nom sur ces gestes — chargement, remise, signalement, retour — pour savoir qui a fait quoi.",
        "La date à laquelle vous avez lu ce texte.",
      ],
    },
    {
      heading: "Ce que vous enregistrez sur les personnes que vous livrez",
      lines: [
        "Le nom de la personne qui reçoit la commande, une photo de la marchandise remise et, quand l'arrêt l'exige, sa signature.",
        "Une photo de problème peut montrer une personne ou un lieu : ne photographiez que ce qui est utile.",
        `Dites-le-lui, en une phrase : ${RECEIVER_SENTENCE}`,
      ],
    },
    {
      heading: "Pourquoi",
      lines: [
        "Organiser et suivre les livraisons, garder la trace des bacs, traiter les problèmes signalés, et prouver la remise de la commande en cas de litige.",
        "La position relevée au geste sert d'abord à vous faciliter les tournées suivantes : des adresses justes, l'endroit où se garer, la bonne porte, les consignes d'accès — pour vous et pour le prochain livreur. Elle sert aussi à prouver la livraison en cas de litige. Elle ne sert jamais à suivre vos déplacements, ni à mesurer votre vitesse ou votre temps de travail.",
      ],
    },
    {
      heading: "Ce que nous n'en faisons pas",
      lines: [
        "Ces heures et ces positions ne servent ni à mesurer votre vitesse, ni à contrôler votre temps de travail.",
        "Aucune position n'est relevée entre deux gestes : ni pendant le trajet, ni pendant les pauses, ni après le retour.",
      ],
    },
    {
      heading: "Qui le voit",
      lines: [
        "Vous voyez vos tournées, et aucune autre.",
        "Les personnes qui ont le droit d'organiser les tournées voient les heures, les bacs, les problèmes signalés et qui a fait chaque geste.",
        "Les commerciaux concernés sont prévenus des problèmes signalés.",
        "Le nom, la photo et la signature de la personne livrée ne sont visibles que de ceux qui ont le droit de consulter les preuves de livraison.",
      ],
    },
    {
      heading: "Combien de temps",
      lines: [
        `Les positions relevées au geste sont effacées au bout de ${String(POSITION_RETENTION_DAYS)} jours ; l'heure du geste, elle, reste.`,
        "La durée de conservation des autres données est en cours de définition. Ce texte sera mis à jour quand elle sera fixée.",
      ],
    },
    {
      heading: "Vos droits",
      lines: [
        "Vous pouvez demander à consulter vos données, à les faire corriger, à les faire effacer dans les limites prévues par la loi, ou vous opposer à certains usages. Écrivez à : [À COMPLÉTER : contact].",
        "Vous pouvez aussi adresser une réclamation à la CNIL (www.cnil.fr).",
      ],
    },
  ],
};
