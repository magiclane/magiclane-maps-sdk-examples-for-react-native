// SPDX-FileCopyrightText: 2025-2026 Magic Lane International B.V. <info@magiclane.com>
// SPDX-License-Identifier: Apache-2.0
//
// Contact Magic Lane at <info@magiclane.com> for SDK licensing options.

// Builds a Paris-area route (tap to select an alternative), simulates
// navigation along the main route, and shows the live instruction plus a time /
// ETA / distance bottom panel with a Recenter button.
//
// The SDK calls (RoutingService.calculateRoute,
// NavigationService.startSimulation) are identical to the web demo; only the
// host differs: a <GLView> component instead of a DOM container.

import React, {useEffect, useRef, useState} from 'react';
import {View, Text, StyleSheet, StatusBar, TouchableOpacity} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {
  Coordinates,
  Landmark,
  RoutePreferences,
  RoutingService,
  GemError,
  Route,
  NavigationService,
  NavigationInstruction,
  SdkSettings,
  TaskHandler,
} from '@magiclane/maps-sdk';
import {GLView} from '@magiclane/maps-sdk-react-native';

// Optional: a token from https://developer.magiclane.com removes the watermark
// and unlocks full functionality. The map renders without one.
const GEMKIT_TOKEN = '';

function convertDistance(meters: number): string {
  return meters >= 1000
    ? `${(meters / 1000).toFixed(1)} km`
    : `${Math.round(meters)} m`;
}

function convertDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return (h > 0 ? `${h} h ` : '') + `${m} min`;
}

function getCurrentTime(additionalSeconds = 0): string {
  const updated = new Date(Date.now() + additionalSeconds * 1000);
  return updated.toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'});
}

function distanceToNextTurn(instr: NavigationInstruction): string {
  const td = instr.timeDistanceToNextTurn;
  return convertDistance(td.unrestrictedDistanceM + td.restrictedDistanceM);
}
function remainingDistance(instr: NavigationInstruction): string {
  const td = instr.remainingTravelTimeDistance;
  return convertDistance(td.unrestrictedDistanceM + td.restrictedDistanceM);
}
function remainingDuration(instr: NavigationInstruction): string {
  const td = instr.remainingTravelTimeDistance;
  return convertDuration(td.unrestrictedTimeS + td.restrictedTimeS);
}
function eta(instr: NavigationInstruction): string {
  const td = instr.remainingTravelTimeDistance;
  return getCurrentTime(td.unrestrictedTimeS + td.restrictedTimeS);
}

function getRouteLabel(route: Route): string {
  const td = route.getTimeDistance();
  const dist = td.unrestrictedDistanceM + td.restrictedDistanceM;
  const time = td.unrestrictedTimeS + td.restrictedTimeS;
  return `${convertDistance(dist)}\n${convertDuration(time)}`;
}

export default function App() {
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
  const [status, setStatus] = useState('Loading map…');
  const [routesBuilt, setRoutesBuilt] = useState(false);
  const [simActive, setSimActive] = useState(false);
  const [instruction, setInstruction] = useState<NavigationInstruction | null>(
    null,
  );
  const routingHandler = useRef<TaskHandler | null>(null);
  const navHandler = useRef<TaskHandler | null>(null);
  const simActiveRef = useRef(false);
  const calculating = useRef(false);

  // Stop a running calculation or simulation when the screen goes away.
  useEffect(() => {
    return () => {
      if (routingHandler.current) {
        RoutingService.cancelRoute(routingHandler.current);
        routingHandler.current = null;
      }
      if (navHandler.current) {
        NavigationService.cancelNavigation(navHandler.current);
        navHandler.current = null;
      }
    };
  }, []);

  const onBuildRoute = () => {
    if (!gemMap) {
      setStatus('Map not ready yet');
      return;
    }
    if (calculating.current) {
      return; // Ignore repeated taps while a calculation is running.
    }
    calculating.current = true;
    const departure = Landmark.withCoordinates(
      Coordinates.fromLatLong(48.802081763044654, 2.12978950646124),
    );
    const destination = Landmark.withCoordinates(
      Coordinates.fromLatLong(48.945095985397906, 2.687421307353545),
    );
    setStatus('Calculating route...');
    const prefs = new RoutePreferences({});

    routingHandler.current = RoutingService.calculateRoute(
      [departure, destination],
      prefs,
      (err: GemError, routes: Route[]) => {
        routingHandler.current = null;
        calculating.current = false;
        if (err === GemError.success && routes.length > 0) {
          const routesMap = gemMap.preferences.routes;
          routes.forEach((route, index) =>
            routesMap.add(route, index === 0, {label: getRouteLabel(route)}),
          );
          gemMap.centerOnRoutes({routes});
          setRoutesBuilt(true);
          setStatus('Routes calculated! Tap to select.');
        } else {
          setStatus('Route calculation failed.');
        }
      },
    );
  };

  const startSimulation = () => {
    if (!gemMap) {
      return;
    }
    const mainRoute = gemMap.preferences.routes.mainRoute;
    if (!mainRoute) {
      setStatus('No main route available');
      return;
    }
    const handler = NavigationService.startSimulation(
      mainRoute,
      undefined,
      {
        onNavigationInstruction: (instr: NavigationInstruction) => {
          setSimActive(true);
          setInstruction(instr);
        },
        // Without this the UI would stay in its simulating state at the end of
        // the route.
        onDestinationReached: () => {
          stopSimulation();
          setStatus('Destination reached.');
        },
        onError: (error: GemError) => {
          setSimActive(false);
          if (error !== GemError.cancel) {
            stopSimulation();
          }
        },
      },
    );
    // On failure startSimulation has already called onError and returns null.
    if (!handler) {
      setStatus('Could not start the simulation.');
      return;
    }
    navHandler.current = handler;
    gemMap.startFollowingPosition();
    simActiveRef.current = true;
    setSimActive(true);
    setStatus('Simulation started');
  };

  const stopSimulation = () => {
    if (navHandler.current) {
      NavigationService.cancelNavigation(navHandler.current);
      navHandler.current = null;
    }
    gemMap?.preferences.routes.clear();
    simActiveRef.current = false;
    setSimActive(false);
    setInstruction(null);
    setRoutesBuilt(false);
    setStatus('Simulation stopped');
  };

  const onRecenter = () => {
    gemMap?.startFollowingPosition();
  };

  // Tap to select an alternative route (ignored while the simulation runs).
  const onMapReady = (map: any) => {
    setGemMap(map);
    setStatus('Map Ready');
    map.registerTouchCallback(async (pos: {x: number; y: number}) => {
      if (simActiveRef.current) {
        return;
      }
      await map.setCursorScreenPosition(pos);
      const selected = map.cursorSelectionRoutes();
      if (selected.length > 0) {
        map.preferences.routes.mainRoute = selected[0];
        setStatus('Route selected');
      }
    });
  };

  return (
    <View style={styles.root}>
      <StatusBar barStyle="dark-content" />
      <GLView
        style={StyleSheet.absoluteFill}
        apiToken={GEMKIT_TOKEN || undefined}
        onMapReady={event => {
          if (event.gemMap) {
            onMapReady(event.gemMap);
          }
        }}
      />
      <SafeAreaView style={styles.safeOverlay} pointerEvents="box-none">
        <View style={styles.card}>
          <Text style={styles.header}>Simulate Navigation</Text>

          {simActive && instruction ? (
            <View style={styles.navTop}>
              <Text style={styles.navTurnDist}>
                {distanceToNextTurn(instruction)}
              </Text>
              <Text style={styles.navStreet}>
                {instruction.nextStreetName || 'Follow route'}
              </Text>
            </View>
          ) : null}

          {!simActive ? (
            !routesBuilt ? (
              <TouchableOpacity
                style={[styles.btnPurple, !mapDataReady && styles.btnDisabled]}
                disabled={!mapDataReady}
                onPress={onBuildRoute}>
                <Text style={styles.btnText}>Build Route</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity style={styles.btnGreen} onPress={startSimulation}>
                <Text style={styles.btnText}>Start Simulation</Text>
              </TouchableOpacity>
            )
          ) : (
            <TouchableOpacity style={styles.btnRed} onPress={stopSimulation}>
              <Text style={styles.btnText}>Stop Simulation</Text>
            </TouchableOpacity>
          )}

          <Text style={styles.status}>{status}</Text>
        </View>
      </SafeAreaView>

      {simActive && instruction ? (
        <SafeAreaView style={styles.bottomOverlay} pointerEvents="box-none">
          <View style={styles.bottomPanel}>
            <Text style={styles.metricGreen}>{remainingDuration(instruction)}</Text>
            <Text style={styles.metric}>{eta(instruction)}</Text>
            <Text style={styles.metric}>{remainingDistance(instruction)}</Text>
          </View>
          <TouchableOpacity style={styles.recenter} onPress={onRecenter}>
            <Text style={styles.recenterText}>Recenter</Text>
          </TouchableOpacity>
        </SafeAreaView>
      ) : null}
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
  navTop: {alignItems: 'center', marginBottom: 12},
  navTurnDist: {fontSize: 26, fontWeight: '700', color: '#111'},
  navStreet: {fontSize: 16, color: '#444'},
  bottomPanel: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: '#fff',
    borderRadius: 24,
    paddingHorizontal: 24,
    paddingVertical: 12,
    marginBottom: 12,
    minWidth: 280,
    elevation: 5,
  },
  metric: {fontSize: 16, fontWeight: '700', color: '#222'},
  metricGreen: {fontSize: 16, fontWeight: '700', color: '#4caf50'},
  recenter: {backgroundColor: '#fff', borderRadius: 24, paddingHorizontal: 20, paddingVertical: 10, marginBottom: 24, elevation: 5},
  recenterText: {color: '#333', fontWeight: '600'},
  btnText: {color: '#fff', fontWeight: '600'},
  btnPurple: {backgroundColor: '#673ab7', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 8},
  btnRed: {backgroundColor: '#f44336', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 8},
  btnGreen: {backgroundColor: '#4caf50', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 8},
  btnDisabled: {opacity: 0.5},
});
