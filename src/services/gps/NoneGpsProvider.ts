// GPS / Live Tracking - the default provider (2026-09-19, WheelsEye
// integration prep - see docs/wheelseye-integration.md).
//
// Used whenever GPS_PROVIDER is unset or explicitly 'none' (the only valid
// default until real WheelsEye credentials exist - see index.ts's
// getGpsProvider). Every method returns a clean "not configured" result -
// empty lists, undefined lookups - never an error and never fabricated
// data, so the rest of the app (the GPS screen, the KCM API routes) can
// treat "no provider configured" as an ordinary, always-safe state rather
// than a special case to guard against everywhere.
import { GpsProvider } from './GpsProvider';
import { GpsVehicle, GpsRouteHistory, GpsDevice, GpsProviderStatus, GpsFleetSummary } from './gpsTypes';

export class NoneGpsProvider implements GpsProvider {
  readonly name = 'none' as const;

  async getStatus(): Promise<GpsProviderStatus> {
    return {
      provider: 'none',
      configured: false,
      message: 'GPS integration is not configured yet. Official WheelsEye API credentials and documentation are pending.'
    };
  }

  async getVehicles(): Promise<GpsVehicle[]> {
    return [];
  }

  async getVehicle(): Promise<GpsVehicle | undefined> {
    return undefined;
  }

  async getVehicleHistory(): Promise<GpsRouteHistory | undefined> {
    return undefined;
  }

  async getDevices(): Promise<GpsDevice[]> {
    return [];
  }

  async getFleetSummary(): Promise<GpsFleetSummary> {
    return { total: 0, running: 0, stopped: 0, noSignal: 0, unknown: 0 };
  }
}
