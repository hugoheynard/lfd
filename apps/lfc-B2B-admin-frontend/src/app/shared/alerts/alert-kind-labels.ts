import type { AlertKind } from '@lfd/contracts';

/** Comment un type d'alerte s'écrit à l'écran. Le vocabulaire vit dans le contrat. */
interface AlertKindLabel {
  readonly title: string;
  /** Ce que la règle surveille, en une phrase — sous le titre. */
  readonly subtitle: string;
  /**
   * Ce que le commercial en fait. C'est cette ligne qui décide s'il laisse la
   * règle allumée : « ça détecte X » ne suffit pas, il faut « et alors ? ».
   */
  readonly why: string;
  readonly icon: string;
}

export const ALERT_KIND_LABELS: Readonly<Record<AlertKind, AlertKindLabel>> = {
  'product.first_order': {
    title: 'Produit jamais commandé',
    subtitle: "Le client prend une référence qui n'apparaît dans aucune de ses commandes.",
    why: "Un premier essai est le meilleur moment pour appeler : c'est là qu'on apprend pourquoi, et qu'on transforme un test en habitude.",
    icon: 'plus',
  },
  'product.quantity_drift': {
    title: 'Écart à sa moyenne',
    subtitle: "La quantité d'un produit s'écarte nettement de ce que ce client prend d'habitude.",
    why: 'Une hausse est une opportunité, une baisse un signal de départ. Dans les deux cas, personne ne le verra en lisant les commandes une par une.',
    icon: 'stats',
  },
  'product.quantity_outlier': {
    title: 'Quantité aberrante pour le produit',
    subtitle:
      "La quantité s'écarte de ce qu'on commande habituellement de ce produit, tous clients confondus.",
    why: "Le filet de sécurité de la PREMIÈRE commande : sans historique du compte, la règle d'écart est aveugle, et c'est justement là qu'un 5 tapé 500 passe sans que personne ne le voie.",
    icon: 'warning',
  },
  'subscription.changed': {
    title: 'Panier récurrent modifié',
    subtitle:
      'Un client vient de changer son panier récurrent — contenu, fréquence ou acheminement.',
    why: "Un panier récurrent est un engagement de volume : le voir bouger vaut un appel. Une fréquence qui s'espace annonce souvent un départ, bien avant que le chiffre ne le montre.",
    icon: 'reload',
  },
};

/** Les canaux, dans l'ordre où on les coche. */
export const DELIVERY_LABELS = {
  staffInApp: 'Me prévenir dans le back-office',
  staffEmail: 'Me prévenir par e-mail',
  customerVisible: 'Afficher au client, sous la ligne concernée',
} as const;
