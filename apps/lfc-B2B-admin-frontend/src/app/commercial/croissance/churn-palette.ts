import type { TerminationReason } from '@lfd/contracts';

/**
 * **Palette catégorielle du churn** — une teinte STABLE par catégorie de départ
 * (la couleur suit l'entité, jamais son rang). Jeu à 7 teintes validé CVD (écart
 * suffisant en vision normale et daltonienne). Partagée par le **sunburst** (anneau
 * intérieur) et le **taux de rattrapage** (barres par catégorie) pour que l'œil
 * relie les deux cartes d'un coup.
 */
export const CHURN_COLORS: Record<TerminationReason, string> = {
  competitor: '#2a78d6',
  closure: '#eb6834',
  price: '#1baf7a',
  quality: '#eda100',
  no_need: '#e87ba4',
  unresponsive: '#008300',
  other: '#4a3aa7',
};

/** Teinte neutre du rattrapage **global** (catégorie « all », hors palette). */
export const CHURN_GLOBAL_COLOR = '#475569';
