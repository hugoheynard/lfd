/**
 * **Les textes des six étapes de la journée de démo**, mot pour mot du plan
 * (`documentation/order/plan-jeu-de-donnees-par-etapes.md` §1 et §3.2, ordre
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
      'Les clients ont commandé hier pour aujourd’hui : 7 au comptoir, 17 en livraison. Rien n’est encore produit.',
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
    explanation: 'Le soir, on arrête les commandes du jour : le fournil sait quoi produire.',
    meaning: 'le plan de production est clôturé',
    loading: 'Clôture du plan de production du jour…',
    links: [{ label: 'Prévisionnel', route: '/production/previsionnel' }],
  },
  {
    step: 2,
    title: 'Tournées composées',
    explanation:
      'Le calcul répartit les livraisons du jour entre les camionnettes. Les bacs ne sont pas encore faits.',
    meaning: 'les tournées sont composées',
    loading: 'Répartition des livraisons entre les camionnettes…',
    links: [{ label: 'Tournées', route: '/livraison/tournees' }],
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
      'Chaque commande est mise en sac (comptoir) ou en bacs (livraison). Trois livraisons restent volontairement en attente, pour montrer un colisage en cours.',
    meaning: 'le colisage est terminé',
    loading: 'Mise en sacs et en bacs, commande par commande…',
    links: [{ label: 'Colisage', route: '/colisage' }],
  },
  {
    step: 5,
    title: 'Tournées chargées, prêtes à partir',
    explanation: 'Une tournée par camionnette, bacs chargés. La première vous est affectée.',
    meaning: 'La journée est prête : les tournées peuvent partir depuis Ma tournée.',
    loading: 'Chargement des bacs dans les camionnettes…',
    links: [
      { label: 'Tournées', route: '/livraison/tournees' },
      { label: 'Ma tournée', route: '/coursier' },
    ],
  },
];
