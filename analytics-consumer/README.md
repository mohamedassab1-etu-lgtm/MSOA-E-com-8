# Analytics Consumer

Consommateur Kafka autonome en Java 17. Il écoute `catalog-events`, compte les
événements `ProductViewed` et les vues par produit en mémoire.

Depuis la racine du dépôt, compilez le module :

```powershell
.\mvnw.cmd -f analytics-consumer\pom.xml compile
```

Lancez le consommateur avec le groupe par défaut (`analytics-group-1`) :

```powershell
.\mvnw.cmd -f analytics-consumer\pom.xml exec:java
```

Un identifiant de groupe peut être passé en argument :

```powershell
.\mvnw.cmd -f analytics-consumer\pom.xml exec:java "-Dexec.args=analytics-group-1"
```

Kafka reprend la consommation à partir de la position mémorisée pour un groupe
existant. Pour rejouer l'historique depuis le début, lancez le consommateur avec
un nouvel identifiant de groupe, par exemple `analytics-group-2`. Le réglage
`auto.offset.reset=earliest` permet alors de lire les messages depuis l'offset 0.
Les statistiques sont conservées uniquement en mémoire pendant l'exécution.
