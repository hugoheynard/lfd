/**
 * Le dossier client de la maquette.
 *
 * ⚠️ SIMULATION, mais **aucun champ n'est inventé** : tout vient du modèle de la
 * fiche client du back-office — `raisonSociale`, `formeJuridique`, `siret`,
 * `vatNumber`, `owner`, `contacts`, `kbis` avec son `certifiedBy`,
 * `addresses.billing` / `addresses.delivery`, `grantedTerms`. C'est ce qui
 * permet à cet écran d'être une VUE et pas une promesse.
 *
 * `08-mon-compte.md` ne demande que trois ajouts, tous côté back-office : un
 * droit de lecture client sur son propre dossier (aujourd'hui staff-only),
 * l'invitation d'un interlocuteur par le détenteur, et la création d'un espace
 * pro par le client.
 *
 * 🔴 **L'IDENTITÉ en est partie le 2026-09-06.** Enseigne, raison sociale,
 * forme juridique, SIRET, n° de TVA et référence viennent de `GET /me` (cf.
 * `ClientCompany`). L'écran affichait « Brasserie Marchand » à quelqu'un qui
 * n'est pas elle — sur l'écran censé lui dire qui il est chez nous.
 *
 * Trois affirmations sont parties SANS remplaçant, faute de source : la remise
 * (un prix négocié vit dans la mercuriale, article par article), le plafond de
 * crédit (le modèle le nomme comme une perspective) et la date d'entrée (elle
 * existe en base, pas sur le fil).
 *
 * 🔴 **Les ADRESSES en sont parties le même jour.** Facturation et livraisons
 * viennent de `GET /companies/:id/addresses` (cf. `ClientAddresses`), et leur
 * zone comme leur tarif se calculent sur le code postal — la maquette écrivait
 * « zone 1 · 20 € » à côté, sans qu'aucun barème ne les soutienne. C'était la
 * plus dangereuse des maquettes : une adresse d'exemple à côté d'une commande
 * réelle est une livraison à la mauvaise porte.
 */

/**
 * Les trois états d'une personne, et ils ne se confondent pas.
 *
 * Un CONTACT n'est pas un utilisateur : le cabinet comptable reçoit les
 * factures, sans mot de passe, sans panier, sans rien voir de l'app.
 * L'invitation est une décision séparée, jamais un effet de bord de la création.
 */
export type UserSpace = 'active' | 'invited' | 'contact';

export interface AccountUser {
  readonly id: string;
  readonly name: string;
  readonly initials: string;
  readonly email: string;
  readonly role: string;
  readonly phone: string;
  readonly space: UserSpace;
  /** Date d'activation (`active`) ou d'envoi de l'invitation (`invited`). */
  readonly since: string;
  readonly canOrder: boolean;
  readonly canInvoices: boolean;
  readonly canAdmin: boolean;
  /** Le détenteur, sorti de la liste : il occupe la carte de tête. */
  readonly holder: boolean;
}

export const MOCK_ACCOUNT = {
  pickupHabit: 'Le Labo · 7 h – 8 h',
  language: 'Français',
  kbis: {
    file: 'kbis-marchand-fils.pdf',
    filed: '12/02/2024',
    size: '214 Ko',
    verified: '14/02/2024',
    /** Le modèle garde QUI a certifié — une vérification anonyme n'engage personne. */
    verifiedBy: 'Léa, La Folie Coffee',
  },
  sepa: 'Mandat signé le 14/02/2024 · IBAN •••• 3041',
  card: 'Visa •••• 4242 · pour les commandes hors crédit',
} as const;

export const MOCK_USERS: readonly AccountUser[] = [
  {
    id: 'pierre',
    name: 'Pierre Marchand',
    initials: 'P',
    email: 'pierre@chalet-barmettes.fr',
    role: 'Détenteur du compte',
    phone: '06 12 44 08 71',
    space: 'active',
    since: '14/02/2024',
    canOrder: true,
    canInvoices: true,
    canAdmin: true,
    holder: true,
  },
  {
    id: 'helene',
    name: 'Hélène Marchand',
    initials: 'HM',
    email: 'helene@brasserie-marchand.fr',
    role: 'Gérante',
    phone: '06 74 21 90 33',
    space: 'active',
    since: '19/02/2024',
    canOrder: true,
    canInvoices: true,
    canAdmin: false,
    holder: false,
  },
  {
    id: 'karim',
    name: 'Karim Bel',
    initials: 'KB',
    email: 'karim@brasserie-marchand.fr',
    role: 'Chef de cuisine',
    phone: '07 81 55 12 06',
    space: 'active',
    since: '02/03/2024',
    canOrder: true,
    canInvoices: false,
    canAdmin: false,
    holder: false,
  },
  {
    id: 'compta',
    name: 'Cabinet Ferrand',
    initials: 'CF',
    email: 'compta@cabinet-ferrand.fr',
    role: 'Comptable',
    // Un contact n'a pas de téléphone au dossier : l'écran écrit « non
    // renseigné » plutôt que de laisser un vide qui se lit comme un bug.
    phone: '',
    space: 'contact',
    since: '',
    canOrder: false,
    canInvoices: true,
    canAdmin: false,
    holder: false,
  },
  {
    id: 'lena',
    name: 'Léna Rieu',
    initials: 'LR',
    email: 'lena@brasserie-marchand.fr',
    role: 'Responsable de salle',
    phone: '06 09 77 41 28',
    space: 'invited',
    since: '3 mars',
    canOrder: true,
    canInvoices: false,
    canAdmin: false,
    holder: false,
  },
];
