// GPS / Live Tracking - provider-independent data model (2026-09-19,
// WheelsEye integration prep - see docs/wheelseye-integration.md).
//
// IMPORTANT: nothing in this file is WheelsEye-specific. These types
// describe what KCM's OWN GPS screens need to render, not what any one
// provider's API actually returns - a GpsProvider implementation (see
// GpsProvider.ts) is responsible for translating whatever shape its real
// API uses into this shape. That's the whole point of the provider
// boundary: swapping WheelsEyeProvider's real implementation in later (once
// the official API key/docs arrive) should never require touching this
// file, the UI, or the KCM API routes that already consume it.
//
// Every field below is optional except the ones KCM itself always knows
// (kcmVehicleNumber) or that are structurally required for a value to mean
// anything at all (movementStatus/connectionStatus, which fall back to
// UNKNOWN precisely so a provider that doesn't report a given field never
// forces a fake value into it - see each provider's own comment).

// Normalized fleet/vehicle status - deliberately KCM's own vocabulary, not
// any provider's raw status strings. A provider adapter maps its own
// values into these four (see WheelsEyeProvider.ts's own comment for why
// that mapping isn't guessed yet) - never assume a provider's raw status
// string can be used directly.
export type GpsMovementStatus = 'RUNNING' | 'STOPPED' | 'NO_SIGNAL' | 'UNKNOWN';

// Whether the device/vehicle is currently reachable at all - distinct from
// movementStatus (a vehicle can be CONNECTED but STOPPED, or NO_SIGNAL
// precisely because it's DISCONNECTED).
export type GpsConnectionStatus = 'CONNECTED' | 'DISCONNECTED' | 'UNKNOWN';

export type GpsIgnitionStatus = 'ON' | 'OFF' | 'UNKNOWN';

// One vehicle's current/live snapshot - what the Live Vehicles list and the
// Vehicle Details panel render.
export interface GpsVehicle {
  // KCM's own identity - always present, this is the join key between a
  // GPS snapshot and KCM's existing Vehicle Master (Fleet & Vehicles). All
  // other fields below are provider-sourced/optional.
  kcmVehicleNumber: string;

  // The provider's own identifier(s) for this vehicle/device - shape and
  // meaning entirely provider-defined (see GpsVehicleMapping below for how
  // KCM records the KCM<->provider link). Kept as opaque strings here since
  // KCM never interprets them itself.
  providerVehicleId?: string;
  providerDeviceId?: string;

  latitude?: number;
  longitude?: number;
  currentAddress?: string;

  speedKmh?: number;
  ignition?: GpsIgnitionStatus;
  movementStatus: GpsMovementStatus;
  connectionStatus: GpsConnectionStatus;

  // When the provider itself last recorded a position/status (i.e. the
  // GPS device's own fix time) vs. when KCM last successfully fetched that
  // data from the provider - kept distinct since a stale device fix behind
  // a fresh fetch is exactly the "NO_SIGNAL" signal worth showing, not
  // hidden by a fetch time that always looks current.
  gpsTimestamp?: string; // ISO 8601
  lastUpdatedAt?: string; // ISO 8601

  todayDistanceKm?: number;
  runningDurationMinutes?: number;
  stoppedDurationMinutes?: number;

  driverId?: string;
  driverName?: string;
}

// One contiguous running or stopped segment within a day's Route History.
export interface GpsRouteSegment {
  type: 'RUNNING' | 'STOPPED';
  startTime: string; // ISO 8601
  endTime?: string; // absent = segment still ongoing (e.g. "today, still running")
  durationMinutes?: number;
  distanceKm?: number; // only meaningful for a RUNNING segment
  startAddress?: string;
  endAddress?: string; // only meaningful for a RUNNING segment
  startLatitude?: number;
  startLongitude?: number;
  endLatitude?: number;
  endLongitude?: number;
}

// A single route point, for route playback - only populated when a
// provider's API actually supports a point-by-point breadcrumb trail (see
// each provider's own comment; not every provider necessarily offers this).
export interface GpsRoutePoint {
  latitude: number;
  longitude: number;
  timestamp: string; // ISO 8601
  speedKmh?: number;
}

// One day's Route History for one vehicle.
export interface GpsRouteHistory {
  kcmVehicleNumber: string;
  date: string; // YYYY-MM-DD
  segments: GpsRouteSegment[];
  // Point-by-point breadcrumb trail for map playback - optional, only when
  // the provider's API supports it (see GpsRoutePoint's own comment).
  points?: GpsRoutePoint[];
  totalDistanceKm?: number;
  totalRunningMinutes?: number;
  totalStoppedMinutes?: number;
}

// Device/hardware information - WheelsEye's own "Devices" screen (SIM,
// IMEI, install date, GSM/battery, etc.). Deliberately its own type, not
// folded into GpsVehicle or Vehicle (Fleet & Vehicles) - see this feature's
// own architecture note (section 12 of the spec this was built from):
// device/hardware detail belongs in a separate provider/device structure,
// never bloated into the main Vehicle Master.
export interface GpsDevice {
  kcmVehicleNumber?: string; // absent if this device isn't yet mapped to a KCM vehicle
  providerDeviceId?: string;
  deviceModel?: string;
  simNumber?: string;
  installationDate?: string; // YYYY-MM-DD
  connectionStatus?: GpsConnectionStatus;
  gsmSignalPercent?: number;
  batteryPercent?: number;
  lastLocation?: string;
  remarks?: string;
}

// Overall provider health/configuration - what the GPS screen's top banner
// and GET /api/gps/status render. `configured: false` is the ONLY state
// possible until real WheelsEye credentials exist - see NoneGpsProvider.
export interface GpsProviderStatus {
  provider: 'none' | 'mock' | 'wheelseye';
  configured: boolean;
  message: string;
  // Present only when configured && a live check has actually run - never
  // fabricated for a not-configured provider.
  lastCheckedAt?: string;
}

// KCM Vehicle Number <-> provider vehicle/device identifier - the mapping
// concept from section 8/21 of this feature's spec. Persisted (see
// src/db/service.ts's gpsVehicleMappings functions) so it can be prepared
// ahead of time and referenced by every provider implementation, rather
// than hardcoded per-provider.
export interface GpsVehicleMapping {
  id: string; // = kcmVehicleNumber (one mapping per KCM vehicle)
  kcmVehicleNumber: string;
  providerVehicleId?: string;
  providerDeviceId?: string;
  provider: 'wheelseye'; // fixed for now - the only provider this maps to; widen if a second provider is ever added
  notes?: string;
  updatedAt?: string; // ISO 8601, stamped server-side on every save
}

// Fleet-wide counts for the "All / Running / Stopped / No Signal" filter
// bar - always derived server-side from the same GpsVehicle[] the vehicle
// list itself renders, never computed separately (so the two can never
// disagree, and never from a fake client-side timer - see this feature's
// own "no fake frontend timers" requirement).
export interface GpsFleetSummary {
  total: number;
  running: number;
  stopped: number;
  noSignal: number;
  unknown: number;
}
