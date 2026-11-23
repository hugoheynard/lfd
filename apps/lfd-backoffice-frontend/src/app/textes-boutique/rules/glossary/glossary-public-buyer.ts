/**
 * Les segments des textes d'un organisme public (Chorus Pro) : l'engagement
 * juridique et le code service au panier, au récapitulatif et au détail de
 * commande, le règlement au compte seul, et le dépôt sur Chorus d'une facture.
 */
export const GLOSSARY_PUBLIC_BUYER: Readonly<Record<string, string>> = {
  payHintPublic: 'Règlement — aide (organisme public)',
  publicAccountUnavailable: 'Organisme public — compte indisponible',
  commitmentTitle: 'Engagement — titre',
  commitmentNumber: "Engagement — numéro d'engagement",
  commitmentNumberRequiredHint: 'Engagement — aide (numéro obligatoire)',
  commitmentNumberOptionalHint: 'Engagement — aide (numéro facultatif)',
  commitmentOptional: 'Engagement — mention « facultatif »',
  commitmentServiceCode: 'Engagement — code service',
  commitmentServiceCodeHint: 'Engagement — aide (code service)',
  commitmentNumberMissing: 'Engagement — numéro manquant',
  commitmentServiceCodeMissing: 'Engagement — code service manquant',
  commitmentUnread: 'Engagement — exigences illisibles',
  commitmentRunning: 'Engagement — en cours, jusqu’au',
  commitmentEnded: 'Engagement — pris fin le',
  recapCommitment: 'Récapitulatif — engagement',
  recapCommitmentNumber: "Récapitulatif — numéro d'engagement",
  recapCommitmentService: 'Récapitulatif — code service',
  detailCommitment: 'Détail — engagement',
  detailCommitmentNumber: "Détail — numéro d'engagement",
  detailCommitmentService: 'Détail — code service',
  chorusDeposited: 'Facture déposée sur Chorus Pro — date',
  chorusPending: 'Facture en cours de dépôt sur Chorus Pro',
};
