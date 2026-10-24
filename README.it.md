# Thermo Orb Card

Una sola card Lovelace per Home Assistant che riunisce tutti i dispositivi clima sotto forma di **orb 3D** animate: termostati, testine termostatiche, climatizzatori, ventole, umidificatori/deumidificatori e semplici sensori di temperatura/umidità.

Tutto è facoltativo. La card mostra solo le entità che esistono e hanno uno stato utilizzabile, quindi si adatta a qualsiasi impianto senza segnaposto vuoti.

**Documentazione:** [English](README.md) · Italiano

## Funzioni

- Una orb per ogni entità `climate`, `fan` o `humidifier`, più orb composte solo da sensori. Colore e animazione seguono lo stato del dispositivo (riscaldamento, raffrescamento, deumidificazione, umidificazione, ventola, in attesa, spento).
- Temperatura attuale grande, temperatura impostata, perla trascinabile sull'anello e pulsanti +/−. Pulsanti modalità HVAC, velocità e modalità ventola, programmi, umidità obiettivo: i controlli compaiono solo se l'entità li supporta.
- Due visualizzazioni: **selezionabile** (una stanza o un dispositivo alla volta, scelti con i chip) oppure **griglia** (tutte le stanze affiancate).
- I dispositivi possono essere raggruppati in stanze, oppure elencati senza stanza.
- Pulsanti di modalità globale facoltativi (ad esempio Comfort / Manuale / Spento) collegati a un helper `input_select`.
- Riga facoltativa con lo stato del riscaldamento centrale (ad esempio "numero di valvole aperte").
- Chip facoltativi manuale/automatico ed estate/inverno, accanto alla riga del riscaldamento centrale.
- Chip facoltativi di casa: temperatura e umidità minima, media e massima, colorati per intervallo.
- Chip di temperatura e umidità per ogni stanza, accanto all'orb.
- Dimensioni di cifre, pulsanti e selettori regolabili separatamente e un colore per ogni stato dell'orb.
- Editor visuale completo e interfaccia italiano/inglese in base alla lingua di Home Assistant. Funziona su smartphone.

## Installazione

### HACS (consigliato)

1. HACS → ⋮ → **Repository personalizzati**.
2. Aggiungi l'URL di questo repository con categoria **Dashboard**.
3. Installa **Thermo Orb Card** e ricarica il browser.

Se la risorsa non viene aggiunta in automatico, aggiungi `/hacsfiles/thermo-orb-card/thermo-orb-card.js` come *modulo JavaScript* in **Impostazioni → Dashboard → ⋮ → Risorse**.

### Manuale

1. Copia `thermo-orb-card.js` in `/config/www/`.
2. Aggiungi `/local/thermo-orb-card.js` come *modulo JavaScript* in **Impostazioni → Dashboard → ⋮ → Risorse**.

Dopo aver aggiornato il file, aggiungi una versione all'URL (ad esempio `/local/thermo-orb-card.js?v=2`) oppure svuota la cache del browser o dell'app Companion, altrimenti Home Assistant può continuare a servire la copia vecchia.

## Aggiungere la card

Aggiungi una card **Thermo Orb (clima 3D)** e configurala dall'editor visuale, oppure in YAML:

```yaml
type: custom:thermo-orb-card
title: Clima
layout: select
mode_entity: input_select.thermo_orb_mode
central_heating_entity: sensor.thermo_orb_active_valves
temperature_avg_entity: sensor.thermo_orb_temperature_avg
temperature_max_entity: sensor.thermo_orb_temperature_max
temperature_min_entity: sensor.thermo_orb_temperature_min
humidity_avg_entity: sensor.thermo_orb_humidity_avg
humidity_max_entity: sensor.thermo_orb_humidity_max
humidity_min_entity: sensor.thermo_orb_humidity_min
rooms:
  - name: Soggiorno
    icon: mdi:sofa
    entities:
      - climate.soggiorno
      - climate.soggiorno_valvola
    temperature_entity: sensor.temperatura_soggiorno
    humidity_entity: sensor.umidita_soggiorno
  - name: Camera
    entities:
      - climate.condizionatore_camera
  - name: Bagno
    entities:
      - humidifier.deumidificatore_bagno
    humidity_entity: sensor.umidita_bagno
  - name: Corridoio
    temperature_entity: sensor.temperatura_corridoio
```

I dispositivi che non appartengono a nessuna stanza si possono elencare al livello principale, ciascuno con i propri sensori:

```yaml
type: custom:thermo-orb-card
layout: select
entity_columns: 1
entities:
  - climate.termostato_soggiorno
  - climate.valvola_cucina
  - fan.deumidificatore
loose_sensors:
  climate.termostato_soggiorno:
    temperature_entity: sensor.temperatura_soggiorno
    humidity_entity: sensor.umidita_soggiorno
  climate.valvola_cucina:
    temperature_entity: sensor.temperatura_cucina
```

Tutte le chiavi, tranne i dispositivi stessi, sono facoltative: ometti quelle che non ti servono.

### Opzioni

| Chiave | Descrizione |
| --- | --- |
| `title` | Titolo mostrato sopra la card. |
| `layout` | `select` = una stanza/un dispositivo alla volta, scelti con i chip. `grid` = tutte le stanze affiancate. Se omesso: `grid` quando è impostato `columns` o le stanze usano `climate_entity`, altrimenti `select`. |
| `room_columns` | Stanze per riga nella visualizzazione `grid`. Vuoto = automatico. (`columns` è accettato come alias.) |
| `entity_columns` | Orb per riga per i dispositivi senza stanza. Predefinito `1`. |
| `rooms` | Elenco delle stanze (sotto). |
| `entities` | Dispositivi senza stanza. Ogni elemento è un entity ID oppure un oggetto con `entity`, `name`, `temperature_entity`, `humidity_entity`. |
| `loose_sensors` | Sensori di temperatura/umidità per i dispositivi senza stanza: `entity_id: {temperature_entity, humidity_entity}`. L'editor visuale lo scrive per te. |
| `rooms[].name` | Titolo della stanza. |
| `rooms[].icon` | Icona della stanza. Il valore predefinito dipende dal tipo di dispositivo. |
| `rooms[].entities` | Entità `climate`, `fan` o `humidifier`. Una stanza senza entità ma con un sensore di temperatura o umidità diventa un'orb solo sensore. |
| `rooms[].temperature_entity` | Sensore di temperatura della stanza, mostrato come chip accanto all'orb. Per le entità `climate`, se manca si usa l'attributo `current_temperature`. |
| `rooms[].humidity_entity` | Sensore di umidità della stanza. Il chip dell'umidità compare solo se è impostato. |
| `rooms[].orb_columns` | Orb per riga dentro questa stanza. Predefinito `1`. |
| `mode_entity` | `input_select` usato per i pulsanti di modalità globale. I pulsanti sono nascosti se manca o non è disponibile. |
| `mode_options` | Pulsanti globali: `option` (un valore dell'helper, maiuscole/minuscole ignorate), `label`, `icon`, `color`. Predefiniti: `auto` → *Comfort*, `heat` → *Manuale*, `off` → *Spento* (tradotti in automatico). Un pulsante la cui `option` non esiste nell'helper viene nascosto. |
| `central_heating_entity` / `central_heating_label` | Riga di stato. Un numero maggiore di 0 è mostrato come attivo e lampeggia in rosso, altrimenti è verde. Tocca per i dettagli. |
| `manual_auto_entity` | Chip facoltativo manuale/automatico. Accetta `input_boolean`, `switch`, `binary_sensor`, `input_select`, `select`, `sensor`. |
| `manual_auto_on` | Per le entità booleane: cosa significa *on*, `manual` oppure `auto`. Se omesso si deduce dal nome dell'entità. |
| `manual_auto_options` | Etichetta/icona/colore personalizzati per stato: elenco di `option`, `label`, `icon`, `color`. |
| `season_entity` | Chip facoltativo estate/inverno. Stessi domini accettati. |
| `season_on` | Per le entità booleane: cosa significa *on*, `summer` oppure `winter`. Se omesso si deduce dal nome dell'entità. |
| `season_options` | Etichetta/icona/colore personalizzati per stato, come `manual_auto_options`. |
| `modes_readonly` | `true`: toccando i chip manuale/automatico ed estate/inverno si aprono solo i dettagli, senza cambiare lo stato. |
| `temperature_avg_entity`, `temperature_max_entity`, `temperature_min_entity` | Sensori numerici per i chip di temperatura di casa. |
| `humidity_avg_entity`, `humidity_max_entity`, `humidity_min_entity` | Sensori numerici per i chip di umidità di casa. |
| `temp_thresholds` | `[bassa, alta]` per i colori dei chip temperatura. Predefinito `[18, 22]` °C. Solo YAML. |
| `humidity_thresholds` | `[bassa, alta]` per i colori dei chip umidità. Predefinito `[40, 60]` %. Solo YAML. |
| `current_size` | Grandezza della temperatura attuale (cifra grande), 50–200 %. Predefinito `100`. L'orb si adatta alla scritta. |
| `target_size` | Grandezza del testo della temperatura impostata, 50–200 %. |
| `room_chips_size` | Grandezza dei chip di temperatura/umidità della stanza, 50–200 %. |
| `step_buttons_size` | Grandezza dei pulsanti + e −, 50–200 %. |
| `selectors_size` | Grandezza dei selettori di modalità e dei controlli, 50–200 %. |
| `orb_color` | Colore dell'orb di riserva per tutti gli stati. |
| `orb_color_auto`, `_manual`, `_off`, `_heat`, `_heat_demand`, `_cool`, `_dry`, `_humid`, `_fan` | Colore dell'orb per stato, ad esempio `orb_color_heat`. `_heat_demand` si usa quando il dispositivo riporta `hvac_action: heating`. I colori sono `[r, g, b]` oppure `'#rrggbb'`. |

### Da sapere

- Un dispositivo o una stanza è nascosto se nessuna delle sue entità ha uno stato utilizzabile (`unknown`/`unavailable`).
- I chip (valori di casa, valori di stanza, manuale/automatico, stagione, riscaldamento centrale) compaiono solo se la loro entità esiste e ha un valore utilizzabile.
- I pulsanti di modalità globale **cambiano soltanto l'helper**. Serve qualcosa che reagisca e comandi i dispositivi: il package facoltativo qui sotto lo fa per le entità `climate`.
- Se usi un tuo helper, ogni `option` in `mode_options` deve corrispondere a una sua opzione. Le maiuscole non contano (`auto` corrisponde a `Auto`) e la card invia sempre il valore esatto dell'helper.
- Toccando un chip manuale/automatico o stagione si commuta un booleano o si scorrono le opzioni di un `input_select`; una pressione prolungata (mezzo secondo) apre i dettagli.
- I colori dell'orb per manuale e auto seguono `manual_auto_entity`: il suo stato può essere un testo come `Manual` / `Auto` (ad esempio un `input_select`) oppure on/off (ad esempio un `input_boolean`, dove `manual_auto_on` indica cosa significa *on*).
- Le temperature sono mostrate nell'unità della tua installazione di Home Assistant.

## Package facoltativo: modalità globali e statistiche di casa

[`packages/thermo_orb.yaml`](packages/thermo_orb.yaml) crea l'helper, l'automazione e i sensori di casa, incluso il conteggio opzionale delle valvole:

- `input_select.thermo_orb_mode` con le opzioni `auto`, `heat`, `off`
- un'automazione che applica la modalità scelta alle tue entità `climate`
- `sensor.thermo_orb_active_valves`, che conta le valvole configurate con `hvac_action: heating`
- `sensor.thermo_orb_temperature_avg` / `_max` / `_min`
- `sensor.thermo_orb_humidity_avg` / `_max` / `_min`

**Requisiti:** Home Assistant 2025.10 o successivo. I sensori sorgente devono riportare °C e %: i valori in °F non vengono convertiti, quindi convertili prima.

### Configurazione

1. Copia il file in `/config/packages/`.
2. Verifica che i package siano abilitati in `configuration.yaml` (se hai già una sezione `homeassistant:`, aggiungi `packages:` al suo interno):

   ```yaml
   homeassistant:
     packages: !include_dir_named packages
   ```

3. Modifica i quattro punti segnati `EDIT ME` nel file:
   - le tue entità `climate` (automazione),
   - le entità `climate` delle valvole termostatiche da contare (solo quelle con attributo `hvac_action`),
   - i sensori di temperatura delle stanze,
   - i sensori di umidità delle stanze.

   Ogni elenco è scritto una volta sola e riusato da tutte le modalità/statistiche.
4. **Impostazioni → Sistema → Riavvia** (controlla prima la configurazione).
5. Nella card imposta `mode_entity: input_select.thermo_orb_mode`, `central_heating_entity: sensor.thermo_orb_active_valves` e le sei chiavi `*_entity` dell'esempio sopra. `mode_options` non serve: i valori predefiniti della card coincidono con il package. Le medie vengono calcolate dai sensori sorgente inseriti nei due elenchi `EDIT ME` e sono già comprese nel package.

### Note

- Ogni dispositivo riceve la modalità con `climate.set_hvac_mode`, quindi deve supportare `auto`, `heat` e `off`. Se alcuni non le supportano, dai a quella modalità un elenco separato nell'automazione invece di riusare quello condiviso.
- Il conteggio centrale considera attive le valvole configurate il cui attributo `hvac_action` vale `heating`; il sensore conta solo gli elementi che aggiungi alla sua lista. Se non vuoi la riga, ometti `central_heating_entity` dalla card.
- Ventole e umidificatori non sono toccati dall'automazione: usano servizi diversi.
- I chip manuale/automatico ed estate/inverno non sono creati dal package: servono a chi ha già queste entità. Se non le hai, ometti `manual_auto_entity` e `season_entity`.
- Finché non sostituisci gli entity ID segnaposto, l'automazione registra un errore quando premi una modalità e i sensori statistici risultano `unknown` (la card allora nasconde i chip).

## Risoluzione dei problemi

- **"Custom element doesn't exist"**: la risorsa non è registrata; controlla la pagina Risorse e svuota la cache del browser.
- **La card sembra uguale dopo un aggiornamento**: Home Assistant sta ancora servendo il file vecchio; cambia la versione nell'URL della risorsa (`?v=2`) oppure svuota la cache.
- **Manca un pulsante di modalità**: la sua `option` non corrisponde a nessuna opzione dell'helper (le maiuscole sono ignorate).
- **Manca un chip**: il suo sensore non è configurato o non ha uno stato numerico.
- **Manca una stanza o un'orb**: nessuna delle sue entità ha uno stato utilizzabile.
