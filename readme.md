# Minel Kapasitetsprognose

Internt styringsverktøy for Minel-konsernet. Kombinerer mannskapsprognose, kontraktsoppfølging og Ordrestyring-data i ett bilde.

**Produksjon:** [calm-plant-0bcddaa03.7.azurestaticapps.net](https://calm-plant-0bcddaa03.7.azurestaticapps.net)
**Stack:** Single-file vanilla JS/HTML — Azure Static Web App + Azure Functions (proxy til Ordrestyring GraphQL API) + SharePoint (datapersistens)

---

## Funksjoner

### Kapasitetsprognose
Viser mannskapsbehov per uke eller måned hentet fra timeregistreringssystemet. Filtrerbar per selskap og tidsperiode (Fra/Til datovelger).

### Ordrereserve
Manuelt registrerte kontrakter med kontraktssum, fakturert beløp og gjenstående verdi. Klikk på et selskaps-kort for å åpne prosjektkortet (skuffen).

### Rammeavtale / løpende serviceavtale
Aktiver med huk i kontraktsskjemaet. Forbruk beregnes lineært basert på andel gjennomførte uker — ingen OS-ordrenummer nødvendig. Innstillingen lagres separat i nettleseren og mistes ikke ved synkronisering.

### Ordrestyring-kobling (OrdreNr)
Henter fakturert beløp automatisk fra Ordrestyring. Støtter flere ordrenummer per prosjekt separert med `/`, `,`, `;` eller mellomrom (f.eks. `37202/36969`). Beløpene summeres. OrdreNr er unike per selskap.

### Manuell overstyring av fakturert beløp
For konsernprosjekter som ikke fremkommer korrekt i OS: åpne prosjektkortet → klikk ✏ Overstyr → legg inn beløp manuelt. Vises med amber farge. Tilbakestilles med ↩ Tilbakestill.

### Kvartal/år-filter på ordrereserven
Filterknapper over ordrereserven viser kumulativt forbruk frem til og med valgt kvartal/år. Nyttig for kvartalsvis rapportering.

### SharePoint-synkronisering
Data lagres dobbelt: SharePoint (delt på tvers av brukere) og localStorage (offline-sikkerhet). Statusindikatoren i headeren viser synkroniseringsstatus i sanntid. Endringer ved offline synkroniseres automatisk ved neste vellykkede forsøk.

---

## Arkitektur

```
src/index.html          — hele applikasjonen (én fil)
api/ordrestyring-proxy/ — Azure Function: GraphQL-proxy mot Ordrestyring (per-selskap Bearer-tokens)
api/sharepoint-*/       — Azure Functions: lese/skrive prosjektdata i SharePoint
```

### Datasikkerhet
- `Sites.Selected` er **aldri** i `_scopes` (login-scope) — kun brukt server-side via `spFetch()`
- `Sites.ReadWrite.All` er **forbudt**
- Avvikssystem deployes **aldri** til calm-plant SWA

### Datapersistens
- Prosjekter: SharePoint-filer per selskap, merget med localStorage (`lastEditedAt`-vinner; lokalt vinner ved likt tidsstempel)
- Rammeavtale-overrides: `minel_avtale_overrides` i localStorage (separat fra prosjektdata)
- OS-override: `osRevenueOverride`-felt på prosjektobjektet (lagres i SharePoint)

---

## Utvikling

```bash
# Push til produksjon
# Rediger src/index.html, kjør deretter push-fix.bat
```

Commit-metode: git plumbing via `push-fix.bat` (ikke standard `git commit`) — se kommentarer i batfilen.
