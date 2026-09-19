# Comptabilité — qui encaisse, sous quelle identité, et par quel moyen

Tout ce qui touche à **l'entité qui émet** et au **prélèvement**. Le reste du
commerce — le compte client, la commande, le catalogue — vit dans
[`../b2b/`](../b2b/).

Ce dossier a été ouvert le **2026-09-10**, en sortant deux documents de `b2b/`.
Ils y étaient rangés par projet ; ils se lisent par sujet, et ce sujet-là a
gagné son propre contexte dans le code (`apps/lfd-api/src/b2b/accounting/`), son
propre droit staff (`b2b_accounting`) et son propre espace dans le back-office.

## Par où entrer

| Doc                                          | Quand l'ouvrir                                                                                                                                                             |
| -------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`prelevement-sepa.md`](prelevement-sepa.md) | **Toujours.** C'est le document unique du sujet : l'objectif, l'état des lieux vérifié, le mandat, l'IBAN, le fichier `pain.008`, les objections ouvertes et le découpage. |
| [`rum.md`](rum.md)                           | Quand on touche à la **référence unique de mandat** : ses contraintes, comment elle est frappée, et pourquoi ce n'est plus l'identifiant du mandat.                        |
| [`lexique.md`](lexique.md)                   | Quand un sigle bloque la lecture : ICS, RUM, SDD, `pain.008`, séquences.                                                                                                   |

### Les plans du mandat et du RIB

| Doc                                                                                  | État                                                                                            |
| ------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------- |
| [`plan-rib-client.md`](plan-rib-client.md)                                           | ✅ en production — le client voit et saisit le RIB de sa société                                |
| [`plan-mandat-client.md`](plan-mandat-client.md)                                     | ✅ en production — le mandat côté client, derrière le drapeau `customerMandate`                 |
| [`plan-mandat-deux-schemas.md`](plan-mandat-deux-schemas.md)                         | ✅ en production — CORE ou interentreprises au choix de l'entité, figé sur le mandat            |
| [`plan-mentions-obligatoires-du-mandat.md`](plan-mentions-obligatoires-du-mandat.md) | 🟡 commité, pas déployé — SIREN, forme juridique du titulaire, frappe refusée sans ses mentions |
| [`plan-restes-du-mandat.md`](plan-restes-du-mandat.md)                               | 🟡 lots 1-3 construits — `DtOfSgntr`, verrou du créancier, purge ; amendement différé           |

### Les todos du sujet

Elles vivent **ici** et non dans `../todos/` (décidé par Hugo le 2026-09-15) :
tout ce qui touche la RUM et le SEPA se lit au même endroit.

| Todo                                                                       | Ce qui reste                                                                                                   |
| -------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| [`todo-mandat-restes-de-la-frappe.md`](todo-mandat-restes-de-la-frappe.md) | 🟡 l'amendement d'un mandat actif, différé jusqu'à la réponse de la banque                                     |
| [`todo-mandat-core-contre-b2b.md`](todo-mandat-core-contre-b2b.md)         | 🔴 libellé bancaire du mandat interentreprises, « 13 mois », second débit d'un ponctuel, questions à la banque |
| [`todo-rib-client-transmission.md`](todo-rib-client-transmission.md)       | 🔴 sécurité de la transmission de l'IBAN saisi par le client                                                   |

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

| Ce qui existe                   | Où                                               | État                                                                                                                                                                                                       |
| ------------------------------- | ------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Le mandat **Stripe**            | `src/b2b/payments/`                              | **supprimé** le 2026-09-19 — aucun mandat Stripe en production (Hugo) ; ses deux colonnes restent en base, ni lues ni écrites ([`todo-mandat-restes-de-la-frappe.md`](todo-mandat-restes-de-la-frappe.md)) |
| Le **mandat imprimé**           | `accounting/domain/services/sepa-mandate-pdf.ts` | **livré** — CORE ou interentreprises selon le mandat ; marqué EXEMPLE sans RUM, signable avec                                                                                                              |
| Le mandat **direct**, nominatif | `src/b2b/payments/`                              | **livré** — frappé, imprimé, envoyé, activé sur preuve ; restes dans [`todo-mandat-restes-de-la-frappe.md`](todo-mandat-restes-de-la-frappe.md)                                                            |

### La RUM

Frappée à chaque mandat par `Rum.mint`
(`src/b2b/payments/domain/value-objects/rum.ts`) — sa forme et ses bornes sont
dans [`rum.md`](rum.md).

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
