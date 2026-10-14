/**
 * **Les textes des six étapes de la journée de démo**, mot pour mot du plan
 * (`documentation/commandes/architecture-jeu-de-donnees-par-etapes.md` §1 et §3.2, ordre
 * validé par Hugo le 2026-10-05 : les tournées sont composées avant la
 * production).
 *
 * Écrits côté écran et non servis : ce sont des phrases pour un humain, pas
 * des faits de la base. Les nombres, eux, viennent du serveur (`summary`).
 */
export interface DevScenarioStepText {
  readonly step: number;
  readonly title: string;
  /** Ce que c'est dans la vraie vie. */
  readonly explanation: string;
  /**
   * Ce que la phrase d'état dit quand c'est la dernière étape atteinte — une
   * phrase entière pour la dernière, qui se lit seule (§3.1).
   */
  readonly meaning: string;
  /** Ce que la bannière annonce pendant le chargement. */
  readonly loading: string;
  /** Où le voir, une fois faite. */
  readonly links: readonly { readonly label: string; readonly route: string }[];
}

/** La dernière étape : la journée est prête à partir. */
export const LAST_SCENARIO_STEP = 5;

export const DEV_SCENARIO_STEPS: readonly DevScenarioStepText[] = [
  {
    step: 0,
    title: 'Commandes passées',
    explanation:
      'Les clients ont commandé hier pour aujourd’hui : 9 retraits au comptoir, dont 3 de particuliers (2 au Labo, 1 au Village), et 3 au Village, approvisionné par transfert depuis le Labo ; et 19 livraisons, dont une en début d’après-midi (13:30–14:30) et une chez un particulier (avant 11:00). Chaque commande porte son site, et les écrans la colorent par catégorie. Rien n’est encore produit.',
    meaning: 'les commandes sont passées, rien n’est encore produit',
    loading: 'Passage des commandes d’hier, d’aujourd’hui et des jours à venir…',
    // Aucun écran ne liste toutes les commandes du jour (vérifié le 2026-10-05) :
    // le comptoir et la feuille de route les montrent, chacun pour son mode.
    links: [
      { label: 'Retrait boutique', route: '/comptoir/retrait' },
      { label: 'Feuille de route', route: '/livraison/feuille-de-route' },
    ],
  },
  {
    step: 1,
    title: 'Plan de production clôturé',
    explanation:
      'Le soir, on arrête les commandes du jour : le fournil sait quoi produire, et les retraits du Village partent dans un transfert interne.',
    meaning: 'le plan de production est clôturé',
    loading: 'Clôture du plan de production du jour…',
    links: [{ label: 'Prod manager', route: '/prod-manager' }],
  },
  {
    step: 2,
    title: 'Tournées composées',
    explanation:
      'Les livraisons du matin, celle du particulier comprise, sont réparties entre les camionnettes. La livraison de l’après-midi est laissée au calcul. Les bacs ne sont pas encore faits.',
    meaning: 'les tournées sont composées',
    loading: 'Répartition des livraisons entre les camionnettes…',
    links: [{ label: 'Tournées', route: '/tour-manager' }],
  },
  {
    step: 3,
    title: 'Production complète',
    explanation: 'Toutes les fournées sont sorties du four et remises au colisage.',
    meaning: 'la production est terminée',
    loading: 'Déclaration des fournées sorties du four…',
    links: [{ label: 'Fournée du jour', route: '/fournil' }],
  },
  {
    step: 4,
    title: 'Colisage complet',
    explanation:
      'Chaque commande est mise en sac (comptoir) ou en bacs (livraison). Trois livraisons restent volontairement en attente, pour montrer un colisage en cours. Les sacs du Village attendent leur transfert : ils ne se retirent qu’une fois le transfert reçu.',
    meaning: 'le colisage est terminé',
    loading: 'Mise en sacs et en bacs, commande par commande…',
    links: [{ label: 'Colisage', route: '/colisage' }],
  },
  {
    step: 5,
    title: 'Tournées chargées, prêtes à partir',
    explanation:
      'Une tournée par camionnette, bacs chargés ; la première vous est affectée. Puis la composition automatique est rejouée sur ce qui reste : elle place le transfert du Village dans une tournée du matin, dont le bac est chargé ; la démo permettant un second passage, elle ouvre seule une tournée d’après-midi sur la camionnette 1 pour ce qui restait, dont la livraison de 13:30.',
    meaning: 'La journée est prête : les tournées peuvent partir depuis Ma tournée.',
    loading: 'Chargement des bacs dans les camionnettes…',
    links: [
      { label: 'Tournées', route: '/tour-manager' },
      { label: 'Ma tournée', route: '/coursier' },
    ],
  },
];
