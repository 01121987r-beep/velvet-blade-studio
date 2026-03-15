# Architettura

## Obiettivo
Replicare la logica centrale dell'app precedente: il cliente vede solo cio che l'admin configura.

## Data flow
1. L'admin entra nel pannello desktop.
2. Aggiorna servizi, specialisti, disponibilita, eccezioni o prenotazioni.
3. Il backend salva sul database SQLite.
4. L'app cliente interroga solo API e ricostruisce i passi del flusso.
5. Gli slot disponibili vengono calcolati runtime unendo:
   - regole settimanali
   - eccezioni
   - blocchi manuali
   - prenotazioni confermate

## Modelli dati
### services
- `id`
- `name`
- `description`
- `duration_minutes`
- `price`
- `image_url`
- `icon`
- `active`
- `featured_home`
- `sort_order`

### specialists
- `id`
- `name`
- `role`
- `bio`
- `photo_url`
- `active`

### specialist_services
Relazione molti-a-molti tra specialisti e servizi.

### availability_rules
Definisce le fasce orarie settimanali per ogni specialista.
- `weekday`
- `label`
- `start_time`
- `end_time`
- `active`

### availability_exceptions
Definisce ferie, chiusure o blocchi temporanei su date specifiche o intervalli di date.
- `date_from`
- `date_to`
- `start_time`
- `end_time`
- `scope`
- `note`

### manual_slot_blocks
Blocchi puntuali a slot singolo effettuati da admin.

### bookings
- `booking_token`
- `service_id`
- `specialist_id`
- `booking_date`
- `booking_time`
- `end_time`
- `customer_name`
- `customer_phone`
- `customer_device_id`
- `status`
- `source`

## Regole business implementate
- niente servizi hardcoded lato cliente
- niente specialisti hardcoded lato cliente
- disponibilita solo da regole admin
- intervallo slot di 30 minuti
- settimana prenotabile limitata alla settimana corrente
- nessuna doppia prenotazione su stesso specialista/orario
- prenotazioni cliente modificabili o annullabili dalla sezione dedicata
- admin puo cambiare stato e disponibilita centralmente

## Note di estensione
Questa base e pronta per:
- wrapping Android con Capacitor
- autenticazione cliente piu forte
- notifiche locali
- deploy su Render con `DB_PATH` persistente
- upload immagini reali invece di URL
