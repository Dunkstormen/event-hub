# FIR and airport reference data

Event Hub stores FIRs and airports as canonical records rather than copying
free-text identifiers into events. Both types use unique, uppercase,
four-character ICAO codes. Airport-to-FIR membership is an explicit relation:
it must not be inferred from an airport code prefix.

## Initial scope

The MVP seed contains the five event-management FIR scopes represented in
VATSIM Scandinavia's training structure:

| ICAO | Name |
| --- | --- |
| `BIRD` | Reykjavík FIR |
| `EFIN` | Helsinki FIR |
| `EKDK` | Copenhagen FIR |
| `ENOR` | Polaris FIR |
| `ESAA` | Sweden FIR |

It also contains a deliberately compact operational set of 21 airports across
those scopes. This is enough to build event forms and discovery without
pretending to be a complete aeronautical database. `EKVG` is explicitly
associated with `BIRD`; this is one reason code prefixes are not used to derive
FIR membership.

The seed was checked against current primary or operational sources:

- [VATSIM Scandinavia training structure](https://wiki.vatsim-scandinavia.org/books/common/page/introduction-to-atc-training-in-polaris-fir)
- [VATSIM Scandinavia Danish sector and airport coverage](https://wiki.vatsim-scandinavia.org/books/danish-airports-charts/page/acc-sectors-in-denmark)
- [VATSIM Scandinavia Swedish airport briefings](https://wiki.vatsim-scandinavia.org/books/swedish-airports-charts/chapter/airport-briefings)
- [VATSIM Scandinavia Norwegian airport briefings](https://wiki.vatsim-scandinavia.org/books/norwegian-airports-charts)
- [Fintraffic Finland eAIP](https://www.ais.fi/eaip/)
- [Iceland eAIP](https://eaip.isavia.is/)

## Updating and importing

The checked-in seed is the bootstrap source, not a live operational feed. A
change must be reviewed like a schema migration:

1. Compare the proposed code, name, and FIR association with a current AIP or
   the applicable VATSIM Scandinavia operational source.
2. Upsert by ICAO code.
3. Set `active = false` when a record is withdrawn. Do not delete it.
4. Reassign an airport only when the source explicitly changes its FIR.
5. Record the source and effective date in the change or import report.

Omitting a record from an import must never delete or deactivate it
automatically. That fail-safe preserves historical event relations and requires
an explicit decision before a code disappears from active selectors.

## API lookups

The public v1 endpoints are:

- `GET /v1/firs`
- `GET /v1/firs/:icaoCode`
- `GET /v1/airports`
- `GET /v1/airports/:icaoCode`

Collections are ordered by ICAO code and use the common cursor/limit envelope.
Both collection endpoints accept `q` for case-insensitive code/name search and
`active` for lifecycle filtering. Airport lookups additionally accept
`firIcaoCode`. Unknown parameters, lowercase ICAO path values, and malformed
cursors return the standard v1 error envelope.
