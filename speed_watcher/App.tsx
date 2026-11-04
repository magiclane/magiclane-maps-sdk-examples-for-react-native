// SPDX-FileCopyrightText: 2025-2026 Magic Lane International B.V. <info@magiclane.com>
// SPDX-License-Identifier: Apache-2.0
//
// Contact Magic Lane at <info@magiclane.com> for SDK licensing options.

// This app builds a route, simulates navigation on it, and subscribes to
// improved-position updates (PositionService.addImprovedPositionListener) to
// show a live speed indicator with the current speed and the posted speed
// limit, highlighting when speeding.

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
  PositionService,
  GemImprovedPosition,
  GemPositionListener,
  Coordinates,
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

function mpsToKmph(mps: number): number {
  return Math.round(mps * 3.6);
}

function routeLabel(route: Route): string {
  const td = route.getTimeDistance();
  const dist = td.unrestrictedDistanceM + td.restrictedDistanceM;
  const time = td.unrestrictedTimeS + td.restrictedTimeS;
  return `${convertDistance(dist)}\n${convertDuration(time)}`;
}

export default function SpeedWatcherDemo() {
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
  // null while the position carries no speed information.
  const [speed, setSpeed] = useState<number | null>(null);
  const [speedLimit, setSpeedLimit] = useState(0);
  const navHandler = useRef<any>(null);
  const positionListener = useRef<GemPositionListener | null>(null);
  const calculating = useRef(false);

  // Stop the simulation and the position updates when the screen goes away.
  useEffect(() => {
    return () => {
      if (navHandler.current) {
        NavigationService.cancelNavigation(navHandler.current);
        navHandler.current = null;
      }
      if (positionListener.current) {
        PositionService.instance.removeListener(positionListener.current);
        positionListener.current = null;
      }
    };
  }, []);

  const onBuildRoute = useCallback(() => {
    if (!gemMap) {
      setStatus('Map not ready yet');
      return;
    }
    if (calculating.current) {
      return; // Ignore repeated taps while a calculation is running.
    }
    calculating.current = true;
    // Rome, Italy.
    const departure = Landmark.withCoordinates(Coordinates.fromLatLong(41.898499, 12.526655));
    const destination = Landmark.withCoordinates(Coordinates.fromLatLong(41.891037, 12.492692));
    setStatus('Calculating route…');
    RoutingService.calculateRoute(
      [departure, destination],
      new RoutePreferences({}),
      (err: GemError, routes: Route[]) => {
        calculating.current = false;
        if (err === GemError.success && routes.length > 0) {
          const routesMap = gemMap.preferences.routes;
          routes.forEach((route, idx) =>
            routesMap.add(route, idx === 0, {label: routeLabel(route)}),
          );
          gemMap.centerOnRoutes({routes});
          setAreRoutesBuilt(true);
          setStatus('Route built successfully!');
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
    if (positionListener.current) {
      PositionService.instance.removeListener(positionListener.current);
      positionListener.current = null;
    }
    gemMap?.preferences.routes.clear();
    setAreRoutesBuilt(false);
    setIsSimulationActive(false);
    setSpeed(null);
    setSpeedLimit(0);
  }, [gemMap]);

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
    // On failure startSimulation has already called onError (which ran
    // stopSimulation) and returns null: don't add a listener nothing removes.
    if (!handler) {
      setStatus('Could not start the simulation.');
      return;
    }
    navHandler.current = handler;
    positionListener.current = PositionService.instance.addImprovedPositionListener(
      (position: GemImprovedPosition) => {
        // speed is -1 m/s when the position has no speed information.
        setSpeed(position.speed < 0 ? null : mpsToKmph(position.speed));
        setSpeedLimit(mpsToKmph(position.speedLimit));
      },
    );
    gemMap.startFollowingPosition?.();
    setIsSimulationActive(true);
    setStatus('Simulation started');
  }, [gemMap, stopSimulation]);

  const recenter = useCallback(() => {
    gemMap?.startFollowingPosition?.();
  }, [gemMap]);

  const isSpeeding = speed !== null && speedLimit > 0 && speed > speedLimit;

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
          <Text style={styles.header}>Speed Watcher</Text>
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

      {isSimulationActive && (
        <SafeAreaView style={styles.bottomOverlay} pointerEvents="box-none">
          <View style={styles.speedPanel}>
            <Text style={[styles.speedValue, isSpeeding && styles.speeding]}>{speed ?? '--'}</Text>
            <Text style={styles.speedUnit}>km/h</Text>
            <View style={styles.limitSign}>
              <Text style={styles.limitText}>{speedLimit > 0 ? speedLimit : '--'}</Text>
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
  speedPanel: {
    marginBottom: 16,
    backgroundColor: '#222',
    borderRadius: 16,
    paddingVertical: 16,
    paddingHorizontal: 24,
    alignItems: 'center',
  },
  speedValue: {fontSize: 36, fontWeight: '700', color: '#fff', lineHeight: 38},
  speeding: {color: '#ff5252'},
  speedUnit: {fontSize: 12, color: '#aaa', textTransform: 'uppercase', marginBottom: 8},
  limitSign: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#fff',
    borderWidth: 5,
    borderColor: '#d32f2f',
    alignItems: 'center',
    justifyContent: 'center',
  },
  limitText: {fontWeight: '800', fontSize: 18, color: '#333'},
  recenter: {marginBottom: 24, backgroundColor: '#fff', borderRadius: 50, paddingHorizontal: 20, paddingVertical: 10, elevation: 3},
  recenterText: {fontWeight: '600', color: '#333'},
  btnDisabled: {opacity: 0.5},
});
