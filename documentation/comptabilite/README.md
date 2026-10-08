# Comptabilité — qui encaisse, sous quelle identité, et par quel moyen

Tout ce qui touche à **l'entité qui émet** et au **prélèvement**. Le reste du
commerce — le compte client, la commande, le catalogue — vit dans
[`../b2b/`](../b2b/).

Ce dossier a été ouvert le **2026-09-10**, en sortant deux documents de `b2b/`.
Ils y étaient rangés par projet ; ils se lisent par sujet, et ce sujet-là a
gagné son propre contexte dans le code (`apps/lfd-api/src/b2b/accounting/`), son
propre droit staff (`b2b_accounting`) et son propre espace dans le back-office.

## Par où entrer

Rangé par thème le 2026-10-08 (Hugo : « mets `facturation` en sous-dossier de
`comptabilite`, et classe les docs par thème »). Chaque sous-dossier garde ses
plans, ses docs d'état et ses todos (les todos vivent **ici** et non dans
`../todos/`, décidé par Hugo le 2026-09-15).

| Dossier                        | Ce qu'on y trouve                                                                                                               |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------- |
| [`facturation/`](facturation/) | la facture : simulateur de dossier, émission Factur-X, bons et facture concordants, le prélèvement qui suit la facture          |
| [`prelevement/`](prelevement/) | le prélèvement SEPA : le document unique, le mois automatique, le lot figé, les blocages, les rejets, les questions à la banque |
| [`mandat/`](mandat/)           | le mandat et le RIB : RUM, mandat côté client, deux schémas, mentions obligatoires, RIB client                                  |
| [`fidelite/`](fidelite/)       | les points de fidélité et les questions au cabinet                                                                              |
| [`prix/`](prix/)               | les limites de prix                                                                                                             |
| [`lexique.md`](lexique.md)     | quand un sigle bloque la lecture : ICS, RUM, SDD, `pain.008`, séquences                                                         |

### Prélèvement

| Doc                                                                                                                            | État                                                                                                                                                                 |
| ------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`prelevement/prelevement-sepa.md`](prelevement/prelevement-sepa.md)                                                           | **Toujours.** Le document unique du sujet : l'objectif, l'état des lieux vérifié, le mandat, l'IBAN, le fichier `pain.008`, les objections ouvertes et le découpage. |
| [`prelevement/prelevement-automatique.md`](prelevement/prelevement-automatique.md)                                             | ✅ doc d'état — le mois de prélèvement : réglages, calendrier TARGET2, avis, préparation automatique, écran « Prélèvement du mois »                                  |
| [`prelevement/plan-lot-de-prelevement-fige.md`](prelevement/plan-lot-de-prelevement-fige.md)                                   | 📐 plan v2, contredit par `vitruve` — figer le lot `pain.008`, un état d'encaissement par commande, identifiants SEPA par lot                                        |
| [`prelevement/plan-blocage-prelevement-et-liens-de-paiement.md`](prelevement/plan-blocage-prelevement-et-liens-de-paiement.md) | le blocage du prélèvement et les liens de paiement                                                                                                                   |
| [`prelevement/question-banque.md`](prelevement/question-banque.md)                                                             | ❓ les questions à la banque, prêtes à envoyer ; et ce que chaque réponse débloque                                                                                   |
| [`prelevement/todo-rejets-bancaires.md`](prelevement/todo-rejets-bancaires.md)                                                 | 🔴 les rejets et contestations d'un prélèvement déposé : rien ne revient aujourd'hui                                                                                 |

### Mandat et RIB

| Doc                                                                                                | État                                                                                                    |
| -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| [`mandat/rum.md`](mandat/rum.md)                                                                   | la **référence unique de mandat** : contraintes, frappe, pourquoi ce n'est plus l'identifiant du mandat |
| [`mandat/mandat-deux-schemas.md`](mandat/mandat-deux-schemas.md)                                   | ✅ doc d'état — CORE ou interentreprises au choix de l'entité, figé sur le mandat                       |
| [`mandat/rib-client.md`](mandat/rib-client.md)                                                     | ✅ doc d'état — le client voit et saisit le RIB de sa société ; refusé si un mandat est actif           |
| [`mandat/plan-mandat-client.md`](mandat/plan-mandat-client.md)                                     | ✅ en production — le mandat côté client, derrière le drapeau `customerMandate`                         |
| [`mandat/plan-mentions-obligatoires-du-mandat.md`](mandat/plan-mentions-obligatoires-du-mandat.md) | 🟡 commité, pas déployé — SIREN, forme juridique du titulaire, frappe refusée sans ses mentions         |
| [`mandat/plan-restes-du-mandat.md`](mandat/plan-restes-du-mandat.md)                               | 🟡 lots 1-3 construits — `DtOfSgntr`, verrou du créancier, purge ; amendement différé                   |
| [`mandat/todo-mandat-restes-de-la-frappe.md`](mandat/todo-mandat-restes-de-la-frappe.md)           | 🟡 l'amendement d'un mandat actif, différé jusqu'à la réponse de la banque                              |
| [`mandat/todo-mandat-core-contre-b2b.md`](mandat/todo-mandat-core-contre-b2b.md)                   | 🔴 libellé bancaire du mandat interentreprises, « 13 mois », second débit d'un ponctuel                 |
| [`mandat/todo-rib-client-transmission.md`](mandat/todo-rib-client-transmission.md)                 | 🔴 sécurité de la transmission de l'IBAN saisi par le client                                            |

### Fidélité et prix

| Doc                                                                                                                  | État                                                                |
| -------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| [`fidelite/points-de-fidelite.md`](fidelite/points-de-fidelite.md)                                                   | les points de fidélité                                              |
| [`fidelite/plan-points-de-fidelite.md`](fidelite/plan-points-de-fidelite.md)                                         | le plan des points de fidélité                                      |
| [`fidelite/question-cabinet-fidelite-et-cartes-cadeaux.md`](fidelite/question-cabinet-fidelite-et-cartes-cadeaux.md) | ❓ les questions au cabinet                                         |
| [`prix/limites-de-prix.md`](prix/limites-de-prix.md)                                                                 | ✅ doc d'état — la limite qui protège la marge des actions cumulées |

> **Fusion du 2026-09-12.** Trois documents se partageaient le prélèvement — le
> socle Stripe, la conception directe, et le format du fichier. Ils se
> contredisaient **volontairement** (le premier décrivait un système qu'on
> quitte), et chacun portait un bandeau pour le dire. Ça marche tant qu'on sait
> lequel lire en premier ; ce savoir-là ne se transmet pas. Les trois sont
> supprimés, leur contenu est dans le document unique, et les contradictions y
> sont racontées **au passé** plutôt que mises en vis-à-vis.

## Ce qu'il faut savoir avant d'y toucher

### L'entité juridique émettrice (`LegalEntity`) — en service

Code : `apps/lfd-api/src/b2b/accounting/`. Écran : Comptabilité › Entités
juridiques. Ouvert à l'écran le 2026-09-12, il fonctionne.

- **Trois ports sur une seule table**, et un seul est exporté. `CreditorReader`
  rend une **copie figée** ; exporter le port d'écriture laisserait un autre
  contexte charger l'agrégat et le muter depuis chez lui, et l'immuabilité de
  l'ICS ne serait plus tenue par personne.
- **L'ICS ne se remplace pas.** Chaque mandat signé le porte imprimé.
- **L'IBAN créancier entre par une seule route et ne ressort par aucune.** La
  vue n'en rend que quatre caractères. Un e2e le tient sur ce que le serveur
  **sérialise**, pas sur ce qu'un mapper prétend.
- Le **logo** est une donnée, pas une constante du produit : une seconde entité
  aurait le sien.
- La surface HTTP est en **trois contrôleurs** depuis le 2026-09-12 — le
  registre, ce qui décide de l'encaissement (ICS, compte, pré-notification), et
  ce qui sort en octets (logo, fiche de mandat). Même adresse de base.

### Le mandat SEPA — trois choses portent ce nom

| Ce qui existe                   | Où                                               | État                                                                                                                                                                                                                     |
| ------------------------------- | ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Le mandat **Stripe**            | `src/b2b/payments/`                              | **supprimé** le 2026-09-19 — aucun mandat Stripe en production (Hugo) ; ses deux colonnes restent en base, ni lues ni écrites ([`mandat/todo-mandat-restes-de-la-frappe.md`](mandat/todo-mandat-restes-de-la-frappe.md)) |
| Le **mandat imprimé**           | `accounting/domain/services/sepa-mandate-pdf.ts` | **livré** — CORE ou interentreprises selon le mandat ; marqué EXEMPLE sans RUM, signable avec                                                                                                                            |
| Le mandat **direct**, nominatif | `src/b2b/payments/`                              | **livré** — frappé, imprimé, envoyé, activé sur preuve ; restes dans [`mandat/todo-mandat-restes-de-la-frappe.md`](mandat/todo-mandat-restes-de-la-frappe.md)                                                            |

### La RUM

Frappée à chaque mandat par `Rum.mint`
(`src/b2b/payments/domain/value-objects/rum.ts`) — sa forme et ses bornes sont
dans [`mandat/rum.md`](mandat/rum.md).

## Ce qui n'est pas ici

- **La facturation** — [`../b2b/architecture-facturation.md`](../b2b/architecture-facturation.md),
  dont le document unique périme la tranche 7 et la §6. Elle déménagera ici le
  jour où son code rejoindra `b2b/accounting/`, pas avant : un doc qu'on range
  d'après un plan décrit un dépôt qui n'existe pas.
- **Les alertes de compte client**, la **commande**, le **catalogue** — dans
  `../b2b/` et `../order/`.

## L'état d'esprit

Quatre **objections bloquantes** restent ouvertes, et le document unique dit
laquelle bloque quelle tranche. **Aucune ne touche l'entité juridique** — c'est
pour ça que la reprise a commencé par elle, et pas parce que c'était le plus
facile.

Et une question qui n'est pas technique : **le calcul des frais**, motif
d'origine de tout le chantier, n'a jamais été chiffré contre le coût d'un
émetteur direct. Une reprise devrait commencer par là.
