// GPS / Live Tracking - provider factory (2026-09-19, WheelsEye
// integration prep - see docs/wheelseye-integration.md).
//
// The ONLY place a GpsProvider implementation is ever instantiated -
// server.ts's GPS routes call getGpsProvider() and only ever talk to the
// GpsProvider interface after that, never to a concrete class directly.
import { GpsProvider } from './GpsProvider';
import { NoneGpsProvider } from './NoneGpsProvider';
import { MockGpsProvider } from './MockGpsProvider';
import { WheelsEyeProvider } from './WheelsEyeProvider';
import { GpsFleetSummary, GpsVehicle } from './gpsTypes';

// Cached per-process - env vars don't change at runtime, and every provider
// here is cheap/stateless anyway, but no reason to reconstruct one per
// request.
let cachedProvider: GpsProvider | null = null;
let cachedProviderKey: string | null = null;

// `allKcmVehicleNumbers` is only ever consulted for the 'mock' provider
// (see MockGpsProvider) - real providers (`none`/`wheelseye`) never need
// KCM's own vehicle list handed to them, they work entirely off the
// KCM<->provider mapping table instead (see GpsVehicleMapping).
export function getGpsProvider(allKcmVehicleNumbers: string[] = []): GpsProvider {
  const requested = (process.env.GPS_PROVIDER || 'none').trim().toLowerCase();
  // Cache key includes the vehicle list length only so a materially
  // different mock fleet (dev data changed) still rebuilds - cheap enough
  // that exactness here doesn't matter beyond avoiding a stale empty list.
  const cacheKey = `${requested}:${allKcmVehicleNumbers.length}`;
  if (cachedProvider && cachedProviderKey === cacheKey) return cachedProvider;

  let provider: GpsProvider;
  if (requested === 'mock') {
    // Safety net (see MockGpsProvider's own comment): mock demo data must
    // never be reachable in production, regardless of how GPS_PROVIDER is
    // set - a misconfigured/leftover env var is a real, ordinary deploy
    // mistake this guards against, not just a theoretical one.
    if (process.env.NODE_ENV === 'production') {
      console.warn('[gps] GPS_PROVIDER=mock is not allowed when NODE_ENV=production - falling back to "none". Remove GPS_PROVIDER or set it to a real provider.');
      provider = new NoneGpsProvider();
    } else {
      provider = new MockGpsProvider(allKcmVehicleNumbers);
    }
  } else if (requested === 'wheelseye') {
    provider = new WheelsEyeProvider({
      apiBaseUrl: process.env.WHEELSEYE_API_BASE_URL,
      apiKey: process.env.WHEELSEYE_API_KEY,
      accountId: process.env.WHEELSEYE_ACCOUNT_ID
    });
  } else {
    provider = new NoneGpsProvider();
  }

  cachedProvider = provider;
  cachedProviderKey = cacheKey;
  return provider;
}

// Shared fallback for GpsProvider.getFleetSummary - a provider that doesn't
// implement its own (the interface marks it optional) gets counts derived
// straight from its own getVehicles() result, which is always correct even
// if slightly less efficient than a provider-native tally. Kept here
// (rather than duplicated per-provider) so every provider's summary logic
// can never drift from what the vehicle list itself shows.
export function computeFleetSummary(vehicles: GpsVehicle[]): GpsFleetSummary {
  return {
    total: vehicles.length,
    running: vehicles.filter(v => v.movementStatus === 'RUNNING').length,
    stopped: vehicles.filter(v => v.movementStatus === 'STOPPED').length,
    noSignal: vehicles.filter(v => v.movementStatus === 'NO_SIGNAL').length,
    unknown: vehicles.filter(v => v.movementStatus === 'UNKNOWN').length
  };
}

export * from './gpsTypes';
export type { GpsProvider } from './GpsProvider';
