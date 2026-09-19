// GPS / Live Tracking - the provider boundary (2026-09-19, WheelsEye
// integration prep - see docs/wheelseye-integration.md).
//
// Every GPS data source KCM ever talks to (WheelsEye today, hypothetically
// something else later) implements this ONE interface. The rest of the app
// - the KCM API routes in server.ts, and everything upstream of them -
// only ever calls a GpsProvider, never a specific provider's SDK/HTTP
// client directly. That's what makes "plug in the real WheelsEyeProvider
// once credentials exist" a one-file change instead of a rebuild:
//
//   KCM GPS UI -> KCM GPS API (server.ts) -> GpsProvider -> WheelsEyeProvider -> WheelsEye API (later)
//
// A provider method may reject/throw (network failure, not configured,
// invalid credentials, rate limited, malformed response, etc.) - callers
// (the KCM API routes) are responsible for catching that and translating
// it into a clean KCM API error response; a provider must never let one of
// these failures crash the process.
import {
  GpsVehicle, GpsRouteHistory, GpsDevice, GpsProviderStatus, GpsFleetSummary, GpsVehicleMapping
} from './gpsTypes';

export interface GpsProvider {
  // Human-readable provider identity - drives the "Provider: WheelsEye"
  // label the UI shows regardless of configuration state.
  readonly name: 'none' | 'mock' | 'wheelseye';

  // Cheap health/configuration check - never throws; a provider that can't
  // reach its own API (or was never configured at all) reports that HERE
  // rather than letting every other method fail individually.
  getStatus(): Promise<GpsProviderStatus>;

  // Every currently-tracked vehicle's live snapshot. `mappings` is the
  // KCM<->provider vehicle/device mapping (see GpsVehicleMapping) already
  // resolved by the caller - a provider that needs its own identifier to
  // look a vehicle up should use it rather than assuming kcmVehicleNumber
  // itself is meaningful to the provider's API.
  getVehicles(mappings: GpsVehicleMapping[]): Promise<GpsVehicle[]>;

  // One vehicle's live snapshot - undefined (not an error) if the vehicle
  // isn't mapped/tracked at all.
  getVehicle(kcmVehicleNumber: string, mappings: GpsVehicleMapping[]): Promise<GpsVehicle | undefined>;

  // One vehicle's Route History for one calendar day (`date`, YYYY-MM-DD).
  // undefined if the provider has nothing for that vehicle/day (not
  // necessarily an error - e.g. a day before the device was installed).
  getVehicleHistory(kcmVehicleNumber: string, date: string, mappings: GpsVehicleMapping[]): Promise<GpsRouteHistory | undefined>;

  // Device/hardware roster (WheelsEye's own "Devices" screen equivalent).
  getDevices(mappings: GpsVehicleMapping[]): Promise<GpsDevice[]>;

  // Fleet-wide Running/Stopped/No Signal counts. A provider MAY compute
  // this itself if its own API returns it directly; the default (see
  // computeFleetSummary in index.ts) just tallies getVehicles()'s own
  // result, which is always correct as a fallback and keeps this optional.
  getFleetSummary?(mappings: GpsVehicleMapping[]): Promise<GpsFleetSummary>;
}
