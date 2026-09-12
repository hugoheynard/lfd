# Les champs facultatifs du mandat doivent se saisir sur la fiche client

**Ouvert le 2026-09-12**, en posant l'ICS en cases sur la fiche d'exemple.
🟡 Demande produit — rien n'est cassé, il manque une surface de saisie.

## Le fait

Le mandat SEPA au modèle EPC porte des zones que **le client** renseigne, et que
nous imprimons pour lui quand nous les connaissons. Elles sont aujourd'hui
**imprimées vides**, parce qu'aucun écran ne permet de les saisir.

| Zone    | Ce que c'est                                                                              | Qui la renseigne                         |
| ------- | ----------------------------------------------------------------------------------------- | ---------------------------------------- |
| 14      | **Code identifiant du débiteur** — le code que le client veut voir revenir sur son relevé | le client, pour son propre rapprochement |
| 15 · 16 | **Tiers débiteur** et son code — quand quelqu'un paie pour le compte d'un autre           | le client                                |
| 17 · 18 | **Tiers créancier** et son code — quand on encaisse pour le compte d'un tiers             | nous, et ce n'est pas notre cas          |
| 19 · 20 | **Numéro et description du contrat**                                                      | nous ou le client, selon l'accord        |

⚠️ **Aucune ne conditionne la validité du mandat.** Le formulaire les range sous
« informations relatives au contrat entre le créancier et le débiteur —
fournies seulement à titre indicatif ». C'est pour ça qu'elles ont été gardées
sur la page plutôt que supprimées : une zone absente change le formulaire, une
zone vide se remplit à la main.

## Ce qui est demandé

Ces champs doivent **apparaître sur la fiche d'information du client**, dans sa
section « mandat SEPA », pour que le mandat sorte prérempli plutôt que d'obliger
le client à écrire ce que nous savons déjà.

## Ce que ça suppose, et qui n'existe pas encore

🔴 **Un mandat nominatif.** Ces champs n'ont nulle part où vivre : la fiche
d'exemple est la même pour tout le monde, et l'agrégat de mandat direct n'existe
pas. Ils se rangent sur le mandat, pas sur la société — un client peut avoir eu
deux mandats successifs avec des références de contrat différentes.

Cette demande est donc **derrière la frappe de la RUM**, et pas à côté : tant
qu'il n'y a pas de mandat à nommer, il n'y a pas d'endroit où poser ces champs.

## Ce qu'il faudra trancher au moment de le faire

- **Lesquels exposer ?** Les zones 17 et 18 décrivent un encaissement pour le
  compte d'un tiers, ce que nous ne faisons pas. Les afficher vides sur un écran
  interne ferait six champs dont deux ne se remplissent jamais.
- **Qui saisit quoi ?** La zone 14 appartient au client — la remplir à sa place
  demande de la lui avoir demandée. Un champ que le staff invente vaut moins
  qu'une case vide.
- **Facultatif jusqu'où ?** Aucun ne doit bloquer l'émission du mandat. Le jour
  où l'un d'eux devient obligatoire à l'écran, le mandat devient impossible à
  sortir pour un client qui n'a rien à y mettre.
