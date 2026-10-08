# Les questions à la Caisse d'Épargne

> Rassemblées le 2026-10-08 (Hugo), à partir de
> [`prelevement-sepa.md`](prelevement-sepa.md) § 12, du lot figé, du
> prélèvement automatique ([`../facturation/prelevement-automatique.md`](../facturation/prelevement-automatique.md))
> et de la réponse du service EDI du 2026-10-08 sur l'import des mandats.
> Une réponse reçue se reporte ici, datée, puis dans le document qu'elle
> débloque.

## Déjà répondu (2026-10-08)

- **Import des mandats** : modèle CSV `ModeleImportMandats`, colonnes A à H
  obligatoires, enregistré en CSV, **sans ligne d'en-tête** à l'import.
- **Avant les mandats**, importer les **RIB destinataires**.

## Le texte à envoyer

> Bonjour,
>
> Merci pour le retour de votre service EDI sur l'import des mandats. Pour
> préparer nos fichiers correctement du premier coup, pourriez-vous nous
> préciser les points suivants ?
>
> **1. Import des RIB destinataires**
>
> - Pouvez-vous nous transmettre le modèle du fichier d'import des RIB
>   destinataires (colonnes obligatoires, ordre, format) ?
>
> **2. Import des mandats (modèle reçu)**
>
> - Colonne G « Séquence de paiement » : quelles valeurs exactes ? (`RCUR` /
>   `OOFF`, `FRST`, ou « Récurrent » / « Ponctuel » ?)
> - Colonne H « Nature du prélèvement » : quelles valeurs exactes ? (`CORE` /
>   `B2B`, ou autre libellé ?)
> - Colonne F « Date de signature » : quel format ? (`JJ/MM/AAAA` ou
>   `AAAA-MM-JJ` ?)
> - Encodage du fichier et caractères admis : faut-il retirer les accents des
>   noms ? Longueur maximale du nom du débiteur ?
> - Le point-virgule final de chaque ligne est-il attendu ?
> - Un mandat déjà importé puis modifié (nouveau compte du client) : faut-il
>   le réimporter avec les colonnes « Ancien IBAN » / « Ancienne RUM », ou
>   passer par un autre geste ?
>
> **3. La remise de prélèvement (le fichier des débits)**
>
> - Le portail accepte-t-il une remise au format **XML SEPA `pain.008`** ?
>   Si oui, quelle version : `pain.008.001.02` ou `pain.008.001.08` ?
> - Disposez-vous d'un **guide d'implémentation** (champs obligatoires au-delà
>   de la norme, en particulier le BIC du débiteur) ?
> - Pouvons-nous **tester** une remise avant la première vraie : environnement
>   de recette, dépôt « à blanc » ou validation sans exécution ?
> - Le dépôt : quel canal (portail, EBICS), quel nommage de fichier, quelle
>   taille maximale, et **comment savoir que la remise est reçue et acceptée** ?
> - **Délai de présentation** : combien de jours ouvrés avant la date de
>   prélèvement le fichier doit-il être déposé, et avant quelle heure
>   (en CORE et en B2B) ?
> - Premier prélèvement sous un mandat neuf : séquence **`FRST` ou `RCUR`** ?
>
> **4. Les retours (rejets, impayés)**
>
> - Sous quelle forme recevons-nous les rejets et retours : fichier
>   `pain.002`, relevé `camt.054`, ou seulement le portail ?
> - Sous quel délai et par quel canal ? Peut-on les télécharger en fichier ?
>
> **5. Les mandats et la pré-notification**
>
> - Le délai de **pré-notification** de 14 jours peut-il être réduit par
>   contrat (CGV et mandat) ? À combien de jours au minimum ?
> - Mandats **B2B** : le client doit déclarer le mandat à sa propre banque ;
>   avez-vous une exigence de votre côté ?
> - Acceptez-vous un mandat signé **électroniquement**, et à quel niveau
>   (simple, avancée, qualifiée) ?
> - Amendement de mandat (changement de compte du client, dans la même
>   banque ou dans une autre) : quels champs exigez-vous ?
>
> **6. Notre compte créancier**
>
> - Pouvez-vous nous confirmer notre **BIC** créancier et notre **ICS** ?
> - Quels sont les **frais** par remise et par prélèvement (et par rejet) ?
>
> Merci beaucoup,

## Ce que chaque réponse débloque

| Question           | Débloque                                                            |
| ------------------ | ------------------------------------------------------------------- |
| 1, 2               | l'export des RIB destinataires et des mandats (à bâtir)             |
| 3 version, guide   | la conformité du `pain.008` déjà produit                            |
| 3 test             | un premier dépôt sans risque                                        |
| 3 délai, heure     | la « limite de dépôt » du calendrier (aujourd'hui « à renseigner ») |
| 3 FRST/RCUR        | la séquence du premier prélèvement                                  |
| 4                  | PA5, l'import des retours                                           |
| 5 pré-notification | prélever le 5 ou le 10 (aujourd'hui au plus tôt le 15)              |
| 5 signature        | le parcours de signature du mandat (papier, prestataire ou maison)  |
| 6 frais            | le calcul de rentabilité du prélèvement direct, jamais fait         |
