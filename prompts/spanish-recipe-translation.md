# Regole di traduzione della fonte spagnola

La fonte è `1080 recetas de cocina` di Simone Ortega. Il campo `originalTitle` e
`originalText` sono la base di controllo e non devono essere alterati durante la
traduzione.

## Titoli

- Conserva sempre il titolo spagnolo in `originalTitle`.
- Usa in `title` il titolo italiano solo quando la traduzione è affidabile.
- Per i nomi traducibili, conserva entrambe le forme: titolo italiano principale
  e titolo spagnolo originale ricercabile.
- Mantieni in spagnolo i termini culinari o culturali caratteristici, per
  esempio `tortilla`, `paella`, `solomillo`, `secreto`, `chorizo`, `morcilla`,
  `gazpacho`, `salmorejo` e `fabada`. È possibile tradurre il contesto, per
  esempio `Tortilla de patatas` → `Tortilla di patate`.

## Ingredienti e procedimento

- Traduci in italiano gli ingredienti comuni e facilmente reperibili in Italia.
- Mantieni il nome spagnolo per salumi, tagli, prodotti o preparazioni tipiche
  quando la traduzione farebbe perdere precisione culturale o gastronomica.
- Non convertire quantità, proporzioni, tempi, temperature o passaggi.
- Non introdurre sostituzioni, ingredienti impliciti o spiegazioni non presenti
  nella fonte.
- Se un termine, una quantità o una frase non è leggibile o è ambigua, conserva
  l’originale e aggiungi una voce a `warnings` e `uncertainFields`.

## Verifica

- Ogni ricetta deve mantenere il riferimento numerico e il testo spagnolo
  originale.
- La traduzione non è completa finché `translationStatus` non è `complete`.
- Il dataset non deve essere aggiunto a `datasets/catalog.json` prima del
  completamento della traduzione e della verifica dei campi incerti.
