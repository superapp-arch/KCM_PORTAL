// GPS / Live Tracking - WheelsEye provider (2026-09-19, WheelsEye
// integration prep - see docs/wheelseye-integration.md).
//
// ============================================================================
// THIS IS A PLACEHOLDER. DO NOT ADD REAL WHEELSEYE API CALLS TO THIS FILE
// UNTIL THE OFFICIAL WHEELSEYE API KEY AND DOCUMENTATION HAVE BEEN PROVIDED.
// ============================================================================
//
// No endpoint paths, authentication scheme, request/response shapes, or
// base URLs are guessed anywhere in this file - per direct instruction, not
// even a single WHEELSEYE_* endpoint constant. When the official
// documentation arrives, implement each method below by:
//   1. Reading the confirmed endpoint/auth scheme from that documentation.
//   2. Mapping WheelsEye's own response fields into gpsTypes.ts's
//      provider-independent shapes (GpsVehicle/GpsRouteHistory/GpsDevice) -
//      only the fields the documentation actually confirms exist; leave
//      the rest undefined rather than inventing a fallback value.
//   3. Mapping WheelsEye's own status vocabulary into GpsMovementStatus/
//      GpsConnectionStatus (RUNNING/STOPPED/NO_SIGNAL/UNKNOWN,
//      CONNECTED/DISCONNECTED/UNKNOWN) - never assume WheelsEye's raw
//      status strings already match these.
// Until then, this class only ever reports itself as "not configured" -
// selected by getGpsProvider() (index.ts) whenever GPS_PROVIDER=wheelseye
// is set but WHEELSEYE_API_KEY/WHEELSEYE_API_BASE_URL aren't, so setting
// the env var ahead of time doesn't require this file to change at all.
import { GpsProvider } from './GpsProvider';
import { GpsVehicle, GpsRouteHistory, GpsDevice, GpsProviderStatus, GpsFleetSummary } from './gpsTypes';

export interface WheelsEyeConfig {
  apiBaseUrl?: string;
  apiKey?: string;
  accountId?: string;
}

export class WheelsEyeProvider implements GpsProvider {
  readonly name = 'wheelseye' as const;

  constructor(private config: WheelsEyeConfig) {}

  private get isConfigured(): boolean {
    // Deliberately checks presence only, not validity - there is no
    // official endpoint to validate a key against yet. A key that's
    // present-but-wrong will surface as a request failure once real calls
    // exist, not here.
    return !!(this.config.apiBaseUrl && this.config.apiKey);
  }

  async getStatus(): Promise<GpsProviderStatus> {
    if (!this.isConfigured) {
      return {
        provider: 'wheelseye',
        configured: false,
        message: 'WheelsEye is selected as the GPS provider, but WHEELSEYE_API_BASE_URL/WHEELSEYE_API_KEY are not set, and the official API integration itself is not implemented yet - official API credentials and documentation are pending.'
      };
    }
    // Credentials are present, but there is still no official endpoint to
    // call - never claim "configured: true" for a provider that can't
    // actually serve real data yet.
    return {
      provider: 'wheelseye',
      configured: false,
      message: 'WheelsEye credentials are set, but the real API integration has not been implemented yet (waiting on official API documentation). No live requests are made.'
    };
  }

  async getVehicles(): Promise<GpsVehicle[]> {
    this.assertNotImplemented('getVehicles');
    return [];
  }

  async getVehicle(): Promise<GpsVehicle | undefined> {
    this.assertNotImplemented('getVehicle');
    return undefined;
  }

  async getVehicleHistory(): Promise<GpsRouteHistory | undefined> {
    this.assertNotImplemented('getVehicleHistory');
    return undefined;
  }

  async getDevices(): Promise<GpsDevice[]> {
    this.assertNotImplemented('getDevices');
    return [];
  }

  async getFleetSummary(): Promise<GpsFleetSummary> {
    return { total: 0, running: 0, stopped: 0, noSignal: 0, unknown: 0 };
  }

  // Logs (server-side only - never thrown up to the client as an error
  // that could look like a real outage) rather than throwing, so a route
  // that calls this doesn't need special-case error handling beyond what
  // NoneGpsProvider already requires - both simply return empty/undefined.
  private assertNotImplemented(method: string): void {
    console.warn(`[WheelsEyeProvider] ${method}() called, but the real WheelsEye API integration is not implemented yet (waiting on official API documentation). Returning empty/undefined.`);
  }
}
