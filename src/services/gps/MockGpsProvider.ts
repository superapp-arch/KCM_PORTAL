// GPS / Live Tracking - development-only mock provider (2026-09-19,
// WheelsEye integration prep - see docs/wheelseye-integration.md).
//
// FOR LOCAL DEVELOPMENT/UI WORK ONLY. Generates clearly-labeled demo data so
// the Live Tracking screen can be built/tested before real WheelsEye
// credentials exist - never real vehicle positions, never used as a
// fallback for a misconfigured real provider.
//
// Safety: getGpsProvider() (index.ts) - the ONLY place this class is ever
// instantiated - refuses to select 'mock' whenever NODE_ENV==='production',
// regardless of what GPS_PROVIDER is set to, so this can never end up
// running in front of real users no matter how the env var is configured.
// Every vehicle/address/remark this generates is also prefixed/labeled
// "DEMO"/"MOCK" so it's unmistakable even if seen on screen.
import { GpsProvider } from './GpsProvider';
import {
  GpsVehicle, GpsRouteHistory, GpsDevice, GpsProviderStatus, GpsFleetSummary,
  GpsVehicleMapping, GpsMovementStatus
} from './gpsTypes';

const DEMO_ADDRESSES = ['Kolar, Karnataka (DEMO)', 'Hoskote, Karnataka (DEMO)', 'Whitefield, Bangalore (DEMO)', 'Electronic City, Bangalore (DEMO)'];
const DEMO_STATUSES: GpsMovementStatus[] = ['RUNNING', 'STOPPED', 'NO_SIGNAL'];

// Deterministic (not Math.random()) so a given vehicle number always
// renders the same demo snapshot within a session - avoids the demo data
// visibly flickering between different fake states on every refetch, which
// would make it harder to tell apart from a real intermittent GPS issue
// while testing the UI.
function pseudoRandomIndex(seed: string, mod: number): number {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  return hash % mod;
}

export class MockGpsProvider implements GpsProvider {
  readonly name = 'mock' as const;

  constructor(private kcmVehicleNumbers: string[]) {}

  async getStatus(): Promise<GpsProviderStatus> {
    return {
      provider: 'mock',
      configured: true,
      message: 'DEMO / MOCK DATA - development only. This is not a real GPS feed.',
      lastCheckedAt: new Date().toISOString()
    };
  }

  private buildVehicle(kcmVehicleNumber: string): GpsVehicle {
    const status = DEMO_STATUSES[pseudoRandomIndex(kcmVehicleNumber, DEMO_STATUSES.length)];
    const isRunning = status === 'RUNNING';
    const isNoSignal = status === 'NO_SIGNAL';
    return {
      kcmVehicleNumber,
      providerVehicleId: `DEMO-${kcmVehicleNumber}`,
      providerDeviceId: `DEMO-DEVICE-${kcmVehicleNumber}`,
      currentAddress: isNoSignal ? undefined : DEMO_ADDRESSES[pseudoRandomIndex(kcmVehicleNumber + 'addr', DEMO_ADDRESSES.length)],
      speedKmh: isRunning ? 10 + pseudoRandomIndex(kcmVehicleNumber + 'speed', 60) : 0,
      ignition: isNoSignal ? 'UNKNOWN' : (isRunning ? 'ON' : 'OFF'),
      movementStatus: status,
      connectionStatus: isNoSignal ? 'DISCONNECTED' : 'CONNECTED',
      gpsTimestamp: isNoSignal ? undefined : new Date().toISOString(),
      lastUpdatedAt: new Date().toISOString(),
      todayDistanceKm: isNoSignal ? undefined : pseudoRandomIndex(kcmVehicleNumber + 'dist', 120),
      runningDurationMinutes: isRunning ? pseudoRandomIndex(kcmVehicleNumber + 'run', 240) : undefined,
      stoppedDurationMinutes: !isRunning && !isNoSignal ? pseudoRandomIndex(kcmVehicleNumber + 'stop', 90) : undefined,
      driverName: undefined
    };
  }

  async getVehicles(): Promise<GpsVehicle[]> {
    return this.kcmVehicleNumbers.map(v => this.buildVehicle(v));
  }

  async getVehicle(kcmVehicleNumber: string): Promise<GpsVehicle | undefined> {
    if (!this.kcmVehicleNumbers.includes(kcmVehicleNumber)) return undefined;
    return this.buildVehicle(kcmVehicleNumber);
  }

  async getVehicleHistory(kcmVehicleNumber: string, date: string): Promise<GpsRouteHistory | undefined> {
    if (!this.kcmVehicleNumbers.includes(kcmVehicleNumber)) return undefined;
    return {
      kcmVehicleNumber,
      date,
      segments: [
        { type: 'RUNNING', startTime: `${date}T09:20:00Z`, endTime: `${date}T10:15:00Z`, durationMinutes: 55, distanceKm: 30.02, startAddress: 'DEMO start', endAddress: 'DEMO stop point' },
        { type: 'STOPPED', startTime: `${date}T10:15:00Z`, endTime: `${date}T10:40:00Z`, durationMinutes: 25, startAddress: 'DEMO stop point' },
        { type: 'RUNNING', startTime: `${date}T10:40:00Z`, endTime: `${date}T12:10:00Z`, durationMinutes: 90, distanceKm: 45.2, startAddress: 'DEMO stop point', endAddress: 'DEMO end point' }
      ],
      totalDistanceKm: 75.22,
      totalRunningMinutes: 145,
      totalStoppedMinutes: 25
    };
  }

  async getDevices(): Promise<GpsDevice[]> {
    return this.kcmVehicleNumbers.map(v => ({
      kcmVehicleNumber: v,
      providerDeviceId: `DEMO-DEVICE-${v}`,
      deviceModel: 'DEMO Tracker Model',
      simNumber: 'DEMO-SIM',
      installationDate: '2026-01-01',
      connectionStatus: 'CONNECTED',
      gsmSignalPercent: 80,
      batteryPercent: 90,
      lastLocation: DEMO_ADDRESSES[pseudoRandomIndex(v + 'addr', DEMO_ADDRESSES.length)],
      remarks: 'DEMO / MOCK DATA'
    }));
  }

  async getFleetSummary(mappings: GpsVehicleMapping[]): Promise<GpsFleetSummary> {
    const vehicles = await this.getVehicles();
    void mappings; // mock ignores mappings entirely - every KCM vehicle passed in gets a demo snapshot regardless
    return {
      total: vehicles.length,
      running: vehicles.filter(v => v.movementStatus === 'RUNNING').length,
      stopped: vehicles.filter(v => v.movementStatus === 'STOPPED').length,
      noSignal: vehicles.filter(v => v.movementStatus === 'NO_SIGNAL').length,
      unknown: vehicles.filter(v => v.movementStatus === 'UNKNOWN').length
    };
  }
}
