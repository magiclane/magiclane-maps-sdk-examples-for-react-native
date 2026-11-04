// SPDX-FileCopyrightText: 2025-2026 Magic Lane International B.V. <info@magiclane.com>
// SPDX-License-Identifier: Apache-2.0
//
// Contact Magic Lane at <info@magiclane.com> for SDK licensing options.

// This app searches for a map report, builds a route that passes through it,
// simulates navigation, and uses AlarmService / AlarmListener to surface the
// closest overlay-item alarm (e.g. a hazard or safety camera) in a bottom panel
// with its icon and distance.

import React, {useCallback, useEffect, useRef, useState} from 'react';
import {
  View,
  Text,
  StyleSheet,
  StatusBar,
  Image,
  TouchableOpacity,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {
  Landmark,
  RoutePreferences,
  RoutingService,
  NavigationService,
  NavigationInstruction,
  SearchService,
  SearchPreferences,
  AlarmService,
  AlarmListener,
  CommonOverlayId,
  GemError,
  Route,
  Coordinates,
  RectangleGeographicArea,
  RouteRenderSettings,
  RouteRenderOptions,
  SdkSettings,
} from '@magiclane/maps-sdk';
import {GLView} from '@magiclane/maps-sdk-react-native';

// A token from https://developer.magiclane.com removes the watermark and unlocks
// full functionality. The map renders without one.
const GEMKIT_TOKEN = '';

// Convert an SDK image byte buffer (Uint8Array) into a data URI for <Image>.
function bytesToDataUri(data: Uint8Array | null | undefined): string | null {
  if (!data || data.byteLength === 0) {
    return null;
  }
  const bytes = new Uint8Array(data);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  const g: any = globalThis;
  let base64 = '';
  if (g.btoa) {
    base64 = g.btoa(binary);
  } else if (g.Buffer) {
    base64 = g.Buffer.from(bytes).toString('base64');
  } else {
    return null;
  }
  return `data:image/png;base64,${base64}`;
}

type Alarm = {distance: number; uri: string | null};

function calculateRoute(waypoints: Landmark[]): Promise<Route | null> {
  return new Promise(resolve => {
    try {
      RoutingService.calculateRoute(
        waypoints,
        new RoutePreferences({}),
        (err: GemError, routes: Route[]) => {
          resolve(err === GemError.success && routes.length > 0 ? routes[0] : null);
        },
      );
    } catch {
      resolve(null);
    }
  });
}

function getReportFromMap(): Promise<Landmark | null> {
  return new Promise(resolve => {
    const area = new RectangleGeographicArea({
      topLeft: Coordinates.fromLatLong(52.59310690528571, 7.524257524882292),
      bottomRight: Coordinates.fromLatLong(48.544623829072655, 12.815748995947535),
    });
    const preferences = SearchPreferences.create({searchAddresses: false, searchMapPOIs: false});
    try {
      // Search only the social reports overlay.
      preferences.overlays.add(CommonOverlayId.SocialReports);
      SearchService.searchInArea({
        area,
        referenceCoordinates: Coordinates.fromLatLong(51.02858483954893, 10.29982567727901),
        onCompleteCallback: (err: GemError, results: Landmark[]) => {
          const found = err === GemError.success || err === GemError.reducedResult;
          resolve(found && results && results.length > 0 ? results[0] : null);
        },
        preferences,
      });
    } catch {
      resolve(null);
    }
  });
}

async function getRouteWithReport(): Promise<Route | null> {
  const initialStart = Landmark.withCoordinates(
    Coordinates.fromLatLong(51.48345483353617, 6.851883736746337),
  );
  const initialEnd = Landmark.withCoordinates(
    Coordinates.fromLatLong(49.01867442442069, 12.061988113314802),
  );
  const report = await getReportFromMap();
  if (!report) {
    const start = Landmark.withCoordinates(
      Coordinates.fromLatLong(51.48345483353617, 6.851883736746337),
    );
    const end = Landmark.withCoordinates(Coordinates.fromLatLong(50.1109221, 8.6821267));
    return calculateRoute([start, end]);
  }
  const initialRoute = await calculateRoute([initialStart, report, initialEnd]);
  if (!initialRoute) {
    return null;
  }
  const reportDistance = initialRoute.getDistanceOnRoute(report.coordinates, true);
  const newStart = Landmark.withCoordinates(initialRoute.getCoordinateOnRoute(reportDistance - 600));
  const newEnd = Landmark.withCoordinates(initialRoute.getCoordinateOnRoute(reportDistance + 200));
  return calculateRoute([newStart, report, newEnd, report, newStart]);
}

export default function RouteAlarmsDemo() {
  const [gemMap, setGemMap] = useState<any>(null);
  // Routing needs current map data, which the SDK updates right after
  // start-up. Set once the map is shown and that data is ready.
  const [mapDataReady, setMapDataReady] = useState(false);
  useEffect(() => {
    if (!gemMap) {
      return;
    }
    let active = true;
    SdkSettings.whenMapDataReady().then(ready => {
      if (active && ready) {
        setMapDataReady(true);
      }
    });
    return () => {
      active = false;
    };
  }, [gemMap]);
  const [status, setStatus] = useState('Map loading…');
  const [areRoutesBuilt, setAreRoutesBuilt] = useState(false);
  const [isSimulationActive, setIsSimulationActive] = useState(false);
  const [alarm, setAlarm] = useState<Alarm | null>(null);
  const navHandler = useRef<any>(null);
  const alarmService = useRef<AlarmService | null>(null);
  const alarmListener = useRef<AlarmListener | null>(null);
  const calculating = useRef(false);

  // Release the alarm service and its listener (they live for one simulation).
  const disposeAlarms = useCallback(() => {
    alarmService.current?.dispose();
    alarmService.current = null;
    alarmListener.current?.dispose();
    alarmListener.current = null;
  }, []);

  // Stop the simulation and release the alarms when the screen goes away.
  useEffect(() => {
    return () => {
      if (navHandler.current) {
        NavigationService.cancelNavigation(navHandler.current);
        navHandler.current = null;
      }
      disposeAlarms();
    };
  }, [disposeAlarms]);

  const onBuildRoute = useCallback(async () => {
    if (!gemMap) {
      setStatus('Map not ready yet');
      return;
    }
    if (calculating.current) {
      return; // Ignore repeated taps while a calculation is running.
    }
    calculating.current = true;
    setStatus('Calculating route with reports…');
    const route = await getRouteWithReport();
    calculating.current = false;
    if (route) {
      const renderSettings = new RouteRenderSettings({
        options: new Set([RouteRenderOptions.showTraffic, RouteRenderOptions.showHighlights]),
      });
      gemMap.preferences.routes.add(route, true, {routeRenderSettings: renderSettings});
      gemMap.centerOnRoute(route);
      setAreRoutesBuilt(true);
      setStatus('Route calculated!');
    } else {
      setStatus('Route calculation failed.');
    }
  }, [gemMap]);

  const stopSimulation = useCallback(() => {
    if (navHandler.current) {
      NavigationService.cancelNavigation(navHandler.current);
      navHandler.current = null;
    }
    disposeAlarms();
    gemMap?.preferences.routes.clear();
    setAreRoutesBuilt(false);
    setIsSimulationActive(false);
    setAlarm(null);
  }, [gemMap, disposeAlarms]);

  const refreshClosestAlarm = useCallback(() => {
    const service = alarmService.current;
    if (!service) {
      return;
    }
    const items = service.overlayItemAlarms.items;
    if (!items || items.length === 0) {
      setAlarm(null);
      return;
    }
    const closest = items.reduce((a, b) => (b.distance < a.distance ? b : a));
    const img = closest.overlayItem.img;
    const uri = img && img.isValid ? bytesToDataUri(img.getRenderableImageBytes()) : null;
    setAlarm({distance: Math.round(closest.distance), uri});
  }, []);

  const startSimulation = useCallback(async () => {
    if (!gemMap) {
      return;
    }
    const routes = gemMap.preferences.routes;
    try {
      await routes.clearAllButMainRoute();
    } catch (e) {
      console.error('clearAllButMainRoute failed:', e);
    }
    if (navHandler.current) {
      return; // Started by an earlier tap while we were waiting.
    }
    if (!routes.mainRoute) {
      setStatus('No main route available');
      return;
    }

    // Keep both references alive for the lifetime of the simulation.
    alarmListener.current = AlarmListener.create({
      onOverlayItemAlarmsUpdated: () => {
        refreshClosestAlarm();
      },
      onOverlayItemAlarmsPassedOver: () => {
        setAlarm(null);
      },
    });
    alarmService.current = AlarmService.create(alarmListener.current);
    alarmService.current.alarmDistance = 500;
    // Raise alarms for social reports (hazards) and safety cameras.
    alarmService.current.overlays.add(CommonOverlayId.SocialReports);
    alarmService.current.overlays.add(CommonOverlayId.Safety);

    const handler = NavigationService.startSimulation(routes.mainRoute, undefined, {
      onNavigationInstruction: (_instruction: NavigationInstruction) => {
        setIsSimulationActive(true);
      },
      onDestinationReached: () => {
        stopSimulation();
        setStatus('Destination reached');
      },
      onError: (error: GemError) => {
        setIsSimulationActive(false);
        setAlarm(null);
        if (error !== GemError.cancel) {
          stopSimulation();
        }
      },
    });
    // On failure startSimulation has already called onError and returns null.
    if (!handler) {
      disposeAlarms();
      setStatus('Could not start the simulation.');
      return;
    }
    navHandler.current = handler;

    gemMap.startFollowingPosition();
    setIsSimulationActive(true);
    setStatus('Simulation started');
  }, [gemMap, refreshClosestAlarm, stopSimulation, disposeAlarms]);

  const recenter = useCallback(() => {
    gemMap?.startFollowingPosition?.();
  }, [gemMap]);

  return (
    <View style={styles.root}>
      <StatusBar barStyle="dark-content" />
      <GLView
        style={StyleSheet.absoluteFill}
        apiToken={GEMKIT_TOKEN || undefined}
        onMapReady={event => {
          if (event.gemMap) {
            setGemMap(event.gemMap);
            setStatus('Map ready');
          }
        }}
      />
      <SafeAreaView style={styles.safeOverlay} pointerEvents="box-none">
        <View style={styles.card}>
          <Text style={styles.header}>Route Alarms</Text>
          {!isSimulationActive && !areRoutesBuilt && (
            <TouchableOpacity
              style={[styles.btnPurple, !mapDataReady && styles.btnDisabled]}
              disabled={!mapDataReady}
              onPress={onBuildRoute}>
              <Text style={styles.btnText}>Build Route</Text>
            </TouchableOpacity>
          )}
          {!isSimulationActive && areRoutesBuilt && (
            <TouchableOpacity style={styles.btnGreen} onPress={startSimulation}>
              <Text style={styles.btnText}>Start Simulation</Text>
            </TouchableOpacity>
          )}
          {isSimulationActive && (
            <TouchableOpacity style={styles.btnRed} onPress={stopSimulation}>
              <Text style={styles.btnText}>Stop Simulation</Text>
            </TouchableOpacity>
          )}
          <Text style={styles.status}>{status}</Text>
        </View>
      </SafeAreaView>

      {isSimulationActive && alarm && (
        <SafeAreaView style={styles.bottomOverlay} pointerEvents="box-none">
          <View style={styles.alarmPanel}>
            <View style={styles.alarmIcon}>
              {alarm.uri ? (
                <Image source={{uri: alarm.uri}} style={styles.alarmImage} resizeMode="cover" />
              ) : (
                <Text style={styles.alarmFallback}>!</Text>
              )}
            </View>
            <View>
              <Text style={styles.alarmLabel}>Hazard Ahead</Text>
              <Text style={styles.alarmDistance}>{alarm.distance} m</Text>
            </View>
          </View>
          <TouchableOpacity style={styles.recenter} onPress={recenter}>
            <Text style={styles.recenterText}>Recenter</Text>
          </TouchableOpacity>
        </SafeAreaView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {flex: 1, backgroundColor: '#000'},
  safeOverlay: {position: 'absolute', top: 0, left: 0, right: 0},
  bottomOverlay: {position: 'absolute', bottom: 0, left: 0, right: 0, alignItems: 'center'},
  card: {
    margin: 12,
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    elevation: 5,
    alignItems: 'center',
  },
  header: {fontSize: 18, fontWeight: '700', marginBottom: 12, color: '#333'},
  status: {marginTop: 10, color: '#333', textAlign: 'center'},
  btnText: {color: '#fff', fontWeight: '600'},
  btnPurple: {backgroundColor: '#673ab7', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 8},
  btnGreen: {backgroundColor: '#4caf50', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 8},
  btnRed: {backgroundColor: '#f44336', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 8},
  alarmPanel: {
    marginBottom: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    backgroundColor: '#fff',
    borderRadius: 16,
    paddingVertical: 16,
    paddingHorizontal: 24,
    minWidth: 200,
    elevation: 5,
  },
  alarmIcon: {
    width: 48,
    height: 48,
    borderRadius: 8,
    backgroundColor: '#fce4ec',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  alarmImage: {width: 48, height: 48},
  alarmFallback: {fontSize: 24, fontWeight: '800', color: '#f44336'},
  alarmLabel: {fontSize: 12, textTransform: 'uppercase', color: '#888', fontWeight: '700'},
  alarmDistance: {fontSize: 20, fontWeight: '700', color: '#333'},
  recenter: {marginBottom: 24, backgroundColor: '#fff', borderRadius: 50, paddingHorizontal: 20, paddingVertical: 10, elevation: 3},
  recenterText: {fontWeight: '600', color: '#333'},
  btnDisabled: {opacity: 0.5},
});
