// SPDX-FileCopyrightText: 2025-2026 Magic Lane International B.V. <info@magiclane.com>
// SPDX-License-Identifier: Apache-2.0
//
// Contact Magic Lane at <info@magiclane.com> for SDK licensing options.

// This app builds a route, simulates navigation, and uses AlarmService /
// AlarmListener's `onSpeedLimit` callback to detect each new posted speed
// limit, announcing it.
//
// The web demo speaks the warning with the browser's window.speechSynthesis API.
// Here the SDK speaks it itself: SoundPlayingService.playText plays the text
// through the SDK's native text-to-speech player, so no extra library is needed.

import React, {useCallback, useEffect, useRef, useState} from 'react';
import {
  View,
  Text,
  StyleSheet,
  StatusBar,
  TouchableOpacity,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {
  Landmark,
  RoutePreferences,
  RoutingService,
  SdkSettings,
  GemError,
  Route,
  NavigationService,
  NavigationInstruction,
  AlarmService,
  AlarmListener,
  Coordinates,
  SoundPlayingService,
} from '@magiclane/maps-sdk';
import {GLView} from '@magiclane/maps-sdk-react-native';

// A token from https://developer.magiclane.com removes the watermark and unlocks
// full functionality. The map renders without one.
const GEMKIT_TOKEN = '';

function convertDistance(meters: number): string {
  return meters >= 1000 ? `${(meters / 1000).toFixed(1)} km` : `${Math.round(meters)} m`;
}

function convertDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return (h > 0 ? `${h} h ` : '') + `${m} min`;
}

function routeLabel(route: Route): string {
  const td = route.getTimeDistance();
  const dist = td.unrestrictedDistanceM + td.restrictedDistanceM;
  const time = td.unrestrictedTimeS + td.restrictedTimeS;
  return `${convertDistance(dist)}\n${convertDuration(time)}`;
}

// Speak the warning with the SDK's text-to-speech player.
function speakText(text: string) {
  try {
    SoundPlayingService.playText(text);
  } catch (e) {
    console.error('Text-to-speech failed:', e);
  }
}

export default function SpeedTtsWarningDemo() {
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
  const [speedLimit, setSpeedLimit] = useState<number | null>(null);
  const navHandler = useRef<any>(null);
  const alarmService = useRef<AlarmService | null>(null);
  const alarmListener = useRef<AlarmListener | null>(null);
  const currentLimit = useRef<number | null>(null);
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

  const onBuildRoute = useCallback(() => {
    if (!gemMap) {
      setStatus('Map not ready yet');
      return;
    }
    if (calculating.current) {
      return; // Ignore repeated taps while a calculation is running.
    }
    calculating.current = true;
    // Kassel, Germany.
    const departure = Landmark.withCoordinates(
      Coordinates.fromLatLong(51.35416637819253, 9.378580176120199),
    );
    const destination = Landmark.withCoordinates(
      Coordinates.fromLatLong(51.36704970265849, 9.404698019844462),
    );
    setStatus('Calculating route…');
    RoutingService.calculateRoute(
      [departure, destination],
      new RoutePreferences({}),
      (err: GemError, routes: Route[]) => {
        calculating.current = false;
        if (err === GemError.success && routes.length > 0) {
          const routesMap = gemMap.preferences.routes;
          routes.forEach((route, idx) => routesMap.add(route, idx === 0, {label: routeLabel(route)}));
          gemMap.centerOnRoutes({routes});
          setAreRoutesBuilt(true);
          setStatus('Route built successfully.');
        } else {
          setStatus(`Route calculation failed (${err})`);
        }
      },
    );
  }, [gemMap]);

  const stopSimulation = useCallback(() => {
    if (navHandler.current) {
      NavigationService.cancelNavigation(navHandler.current);
      navHandler.current = null;
    }
    disposeAlarms();
    currentLimit.current = null;
    gemMap?.preferences.routes.clear();
    setAreRoutesBuilt(false);
    setIsSimulationActive(false);
    setSpeedLimit(null);
  }, [gemMap, disposeAlarms]);

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

    // Keep references alive - if either is GC'd the callbacks stop firing.
    alarmListener.current = AlarmListener.create({
      onSpeedLimit: (_speed: number, limit: number, _insideCityArea: boolean) => {
        // The API reports the limit in m/s; convert to km/h.
        const kmh = Math.round(limit * 3.6);
        if (currentLimit.current !== kmh) {
          currentLimit.current = kmh;
          setSpeedLimit(kmh);
          const warning = `Speed limit is ${kmh} kilometers per hour`;
          speakText(warning);
          setStatus(`Alert: ${kmh} km/h limit`);
        }
      },
    });
    alarmService.current = AlarmService.create(alarmListener.current);

    const handler = NavigationService.startSimulation(routes.mainRoute, undefined, {
      onNavigationInstruction: (_instruction: NavigationInstruction) => {
        setIsSimulationActive(true);
      },
      onDestinationReached: () => {
        stopSimulation();
        setStatus('Destination reached!');
      },
      onError: (error: GemError) => {
        setIsSimulationActive(false);
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

    gemMap.startFollowingPosition?.();
    setIsSimulationActive(true);
    setStatus('Simulation started');
  }, [gemMap, stopSimulation, disposeAlarms]);

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
          <Text style={styles.header}>Speed TTS Warning</Text>
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

      {isSimulationActive && speedLimit !== null && (
        <SafeAreaView style={styles.bottomOverlay} pointerEvents="box-none">
          <View style={styles.limitPanel}>
            <View style={styles.limitSign}>
              <Text style={styles.limitText}>{speedLimit}</Text>
            </View>
            <View>
              <Text style={styles.limitLabel}>Speed Limit</Text>
              <Text style={styles.limitDetected}>Detected</Text>
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
  limitPanel: {
    marginBottom: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    backgroundColor: '#fff',
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 20,
    elevation: 4,
  },
  limitSign: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#fff',
    borderWidth: 5,
    borderColor: '#d32f2f',
    alignItems: 'center',
    justifyContent: 'center',
  },
  limitText: {fontWeight: '800', fontSize: 20, color: '#333'},
  limitLabel: {fontSize: 11, color: '#888', textTransform: 'uppercase', fontWeight: '700'},
  limitDetected: {fontSize: 18, fontWeight: '600', color: '#d32f2f'},
  recenter: {marginBottom: 24, backgroundColor: '#fff', borderRadius: 50, paddingHorizontal: 20, paddingVertical: 10, elevation: 3},
  recenterText: {fontWeight: '600', color: '#333'},
  btnDisabled: {opacity: 0.5},
});
