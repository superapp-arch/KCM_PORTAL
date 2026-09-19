# GPS / Live Tracking — WheelsEye Integration

Status as of 2026-09-19: **base architecture built, no live provider connected yet.**

## 1. Purpose

Give KCM Portal users the vehicle-visibility functionality they currently
get by separately opening WheelsEye — which vehicles are running/stopped/
unreachable, exact location, speed, ignition, route history, and device
status — inside the KCM Portal itself, so nobody needs a second tool just
to monitor the fleet.

This is a **visibility/monitoring feature only.**

## 2. What is currently implemented

- A provider-independent GPS architecture (`src/services/gps/`):
  `gpsTypes.ts` (data model), `GpsProvider.ts` (the interface every
  provider implements), `NoneGpsProvider.ts` (the default — reports
  "not configured", returns empty data, never errors), `MockGpsProvider.ts`
  (development-only demo data), `WheelsEyeProvider.ts` (placeholder —
  reports itself as "not configured", makes no network calls),
  `index.ts` (`getGpsProvider()` factory, selected by the `GPS_PROVIDER`
  env var).
- KCM API routes (`server.ts`, prefix `/api/gps`) that call the selected
  provider and return only the provider-independent shape — never a raw
  WheelsEye payload, never provider credentials:
  - `GET /api/gps/status`
  - `GET /api/gps/vehicles` (live snapshot for every active KCM vehicle + fleet summary counts)
  - `GET /api/gps/vehicles/:vehicleNumber`
  - `GET /api/gps/vehicles/:vehicleNumber/history?date=YYYY-MM-DD`
  - `GET /api/gps/devices`
  - `GET/POST /api/gps/vehicle-mappings`, `DELETE /api/gps/vehicle-mappings/:id`

  All of these require a valid KCM session (401 without one) — stricter
  than `/api/fleet`'s own routes, which have no server-side auth at all.
  The mapping write routes are further restricted to the same roles
  Fleet & Vehicles' own tab already trusts.
- A KCM Vehicle Number ↔ provider vehicle/device identifier mapping table
  (`gps_vehicle_mappings`, `src/db/schema.ts`/`src/db/service.ts`) —
  deliberately its own table, not new columns on the Vehicle Master.
- A new nav item, **Fleet / Vehicle Management → GPS / Live Tracking**
  (`src/components/GpsLiveTracking.tsx`, wired into `Administration.tsx`),
  with three tabs:
  - **Live Vehicles** — search, All/Running/Stopped/No Signal filter,
    sort, a vehicle list, a map-area placeholder, and a vehicle detail
    panel (current status + Route History for a selected date).
  - **Devices** — device/hardware roster table.
  - **Vehicle Mapping** — register/remove the KCM↔provider mapping ahead
    of the real connection.
- `GPS_PROVIDER=none` (or unset) as the default — the app works completely
  normally, the GPS screen shows a clear "Not Configured" banner, and no
  external request is ever made.

## 3. What is intentionally NOT implemented

- **No real WheelsEye API calls anywhere.** No endpoint paths,
  authentication scheme, request/response shapes, or base URLs have been
  guessed. `WheelsEyeProvider.ts` is a placeholder that always reports
  "not configured" and logs a warning (server-side only) if one of its
  data methods is ever called.
- **No fake/mock data in production.** `MockGpsProvider` only activates
  when `GPS_PROVIDER=mock` is explicitly set, and `getGpsProvider()`
  refuses to select it at all when `NODE_ENV=production` (falls back to
  `none` with a warning), regardless of the env var.
- **No connection between GPS distance and KCM Mileage.** Fuel
  Management, Mileage (Opening/Closing KM, Total Litres, Total Amount,
  mileage/cost-per-km), and the Vehicle Mileage Master are completely
  unmodified by this feature and never read from or write to anything
  GPS-related.
- **No real map library.** The "Live Vehicles" tab has a placeholder map
  area (clearly labeled) rather than an integrated map, since there's no
  real coordinate data yet and adding a mapping library is a separate
  decision.
- **No device data in the core Vehicle Master.** Device/hardware
  information (SIM, IMEI, install date, GSM/battery, etc.) lives in its
  own `GpsDevice` type and its own "Devices" tab, never as new fields on
  `Vehicle`.

## 4. Current provider status

`GPS_PROVIDER=none` (the default). `GET /api/gps/status` returns:

```json
{
  "provider": "none",
  "configured": false,
  "message": "GPS integration is not configured yet. Official WheelsEye API credentials and documentation are pending."
}
```

## 5. Future WheelsEye integration steps

Once the official WheelsEye API key and documentation are provided:

1. Read the confirmed authentication scheme, base URL, and endpoint paths
   from that documentation — do not reuse anything guessed here.
2. Implement `WheelsEyeProvider.ts`'s methods (`getStatus`, `getVehicles`,
   `getVehicle`, `getVehicleHistory`, `getDevices`), each one mapping
   WheelsEye's own response fields into the provider-independent types in
   `gpsTypes.ts` — only the fields the documentation actually confirms
   exist; leave the rest `undefined` rather than inventing a fallback.
3. Map WheelsEye's own status vocabulary into
   `GpsMovementStatus`/`GpsConnectionStatus`
   (`RUNNING`/`STOPPED`/`NO_SIGNAL`/`UNKNOWN`,
   `CONNECTED`/`DISCONNECTED`/`UNKNOWN`) — never assume WheelsEye's raw
   status strings already match these.
4. Set `GPS_PROVIDER=wheelseye`, `WHEELSEYE_API_BASE_URL`,
   `WHEELSEYE_API_KEY`, and (if needed) `WHEELSEYE_ACCOUNT_ID` in the
   real environment (never committed to Git).
5. Register each vehicle's WheelsEye vehicle/device identifier via the
   Vehicle Mapping tab (or `POST /api/gps/vehicle-mappings`) — this can be
   done ahead of time, independent of step 2–4.
6. Nothing in `server.ts`'s GPS routes, `GpsLiveTracking.tsx`, or
   `gpsTypes.ts` needs to change for this — the provider swap is
   contained entirely to `WheelsEyeProvider.ts`.

## 6. Vehicle mapping concept

```
KCM Vehicle Number (e.g. KA53D9302)
        ↓
GpsVehicleMapping.providerVehicleId  (WheelsEye's own vehicle identifier)
        ↓
GpsVehicleMapping.providerDeviceId   (WheelsEye's own device ID / IMEI, if applicable)
```

One mapping row per KCM vehicle (`gps_vehicle_mappings`, keyed by KCM
Vehicle Number). `providerVehicleId`/`providerDeviceId` are free-text
strings — their exact shape/meaning is entirely WheelsEye's own, not
interpreted by KCM.

## 7. Expected live-tracking data (`GpsVehicle`)

Vehicle number, current location (lat/lng + address), speed, ignition,
running/stopped status, GPS/device connectivity, last updated time,
today's distance, running/stopped duration, driver (if available). See
`src/services/gps/gpsTypes.ts` for the exact optional/required shape —
every field except `kcmVehicleNumber`/`movementStatus`/`connectionStatus`
is optional, since not every provider necessarily reports every field.

## 8. Expected route-history data (`GpsRouteHistory`)

Per-day running/stopped segments (start/end time, duration, distance,
start/end location), daily totals, and — only if the API supports it — a
point-by-point breadcrumb trail for route playback (`GpsRoutePoint[]`).

## 9. Expected device data (`GpsDevice`)

Vehicle, device model, SIM, installation date, connectivity, GSM/battery,
IMEI/device ID, remarks.

## 10. Security requirements

- The WheelsEye API key/credentials must live server-side only
  (`process.env.WHEELSEYE_*`) — never in React source, `localStorage`/
  `sessionStorage`, a Vite-exposed env var, Git, console logs, or any
  client-facing API response.
- Every `/api/gps/*` route requires a valid KCM session.
- A provider implementation must handle timeout, network failure,
  provider-unavailable, invalid/expired credentials, rate limiting, and a
  malformed response without crashing the process — return a clean
  "not configured"/empty result or a normal KCM API error instead.

## 11. Configuration variables

| Variable | Purpose |
|---|---|
| `GPS_PROVIDER` | `none` (default), `mock` (dev only, refused in production), or `wheelseye` |
| `WHEELSEYE_API_BASE_URL` | Set once the official base URL is known |
| `WHEELSEYE_API_KEY` | Set once issued — server-side only |
| `WHEELSEYE_ACCOUNT_ID` | Set only if WheelsEye's API requires an account/tenant identifier |

See `.env.example`.

## 12. API documentation that will be required later

- Authentication scheme (API key header? OAuth? account-scoped token?)
- Exact endpoint paths for: vehicle list/live status, single-vehicle
  status, route/trip history, device roster
- Exact response field names/types for everything listed in sections 7–9
  above
- Status/ignition/connectivity vocabulary WheelsEye's API actually returns
- Rate limits
- Whether route playback (point-by-point breadcrumbs) is available via
  the API at all, and at what granularity

---

**GPS distance is currently for visibility/tracking only. It is NOT
connected to KCM Mileage, Fuel Management, or the Vehicle Mileage
Master**, and will not be unless explicitly requested and separately
discussed later.
