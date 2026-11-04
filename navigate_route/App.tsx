// SPDX-FileCopyrightText: 2025-2026 Magic Lane International B.V. <info@magiclane.com>
// SPDX-License-Identifier: Apache-2.0
//
// Contact Magic Lane at <info@magiclane.com> for SDK licensing options.

// Builds a route, starts turn-by-turn navigation, and shows the live
// instruction (next turn + street) plus a bottom panel with remaining time /
// ETA / distance, with a Recenter button that re-follows the position.
//
// The web demo departs from the live GPS location; this app uses a fixed
// departure so it runs deterministically in a simulator. The SDK calls
// (RoutingService.calculateRoute, NavigationService.startSimulation,
// map.startFollowingPosition) are otherwise identical.

import React, {useEffect, useRef, useState} from 'react';
import {View, Text, StyleSheet, StatusBar, TouchableOpacity} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {
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

// Berlin area departure / destination.
const DEPARTURE = {latitude: 52.49277, longitude: 13.33333};
const DESTINATION = {latitude: 52.51614, longitude: 13.37748};

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
  const [navigating, setNavigating] = useState(false);
  const [instruction, setInstruction] = useState<NavigationInstruction | null>(
    null,
  );
  const routingHandler = useRef<TaskHandler | null>(null);
  const navHandler = useRef<TaskHandler | null>(null);
  const calculating = useRef(false);

  // Stop a running calculation or navigation when the screen goes away.
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
    const departure = Landmark.withLatLng(DEPARTURE);
    const destination = Landmark.withLatLng(DESTINATION);
    const prefs = new RoutePreferences({});
    setStatus('The route is calculating.');

    routingHandler.current = RoutingService.calculateRoute(
      [departure, destination],
      prefs,
      (err: GemError, routes: Route[]) => {
        routingHandler.current = null;
        calculating.current = false;
        if (err === GemError.routeTooLong) {
          setStatus('The destination is too far from the departure.');
          return;
        }
        if (err === GemError.success && routes.length > 0) {
          const routesMap = gemMap.preferences.routes;
          routes.forEach((route, index) =>
            routesMap.add(route, index === 0, {label: getRouteLabel(route)}),
          );
          gemMap.centerOnRoutes({routes});
          setRoutesBuilt(true);
          setStatus('Route calculated successfully!');
        } else {
          setStatus('Route calculation failed.');
        }
      },
    );
  };

  const onStartNavigation = () => {
    if (!gemMap) {
      return;
    }
    const mainRoute = gemMap.preferences.routes.mainRoute;
    if (!mainRoute) {
      setStatus('No main route available');
      return;
    }
    const handler = NavigationService.startSimulation(mainRoute, undefined, {
      onNavigationInstruction: (instr: NavigationInstruction) => {
        setNavigating(true);
        setInstruction(instr);
      },
      // Without this the UI would stay in its navigating state at the end of
      // the route.
      onDestinationReached: () => {
        stopNavigation();
        setStatus('Destination reached.');
      },
      onError: (error: GemError) => {
        setNavigating(false);
        if (error !== GemError.cancel) {
          stopNavigation();
        }
      },
    });
    // On failure startSimulation has already called onError and returns null.
    if (!handler) {
      setStatus('Could not start navigation.');
      return;
    }
    navHandler.current = handler;
    gemMap.startFollowingPosition();
    setNavigating(true);
    setStatus('Navigation started');
  };

  const stopNavigation = () => {
    if (navHandler.current) {
      NavigationService.cancelNavigation(navHandler.current);
      navHandler.current = null;
    }
    gemMap?.preferences.routes.clear();
    setNavigating(false);
    setInstruction(null);
    setRoutesBuilt(false);
    setStatus('Navigation stopped');
  };

  const onClear = () => {
    gemMap?.preferences.routes.clear();
    setRoutesBuilt(false);
    setStatus('Routes cleared.');
  };

  const onRecenter = () => {
    gemMap?.startFollowingPosition();
  };

  const onMapReady = (map: any) => {
    setGemMap(map);
    setStatus('Map Ready');
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
          <Text style={styles.header}>Navigate Route</Text>

          {navigating && instruction ? (
            <View style={styles.navTop}>
              <Text style={styles.navTurnDist}>
                {distanceToNextTurn(instruction)}
              </Text>
              <Text style={styles.navStreet}>
                {instruction.nextStreetName || 'Continue'}
              </Text>
            </View>
          ) : null}

          {!navigating ? (
            !routesBuilt ? (
              <TouchableOpacity
                style={[styles.btnPurple, !mapDataReady && styles.btnDisabled]}
                disabled={!mapDataReady}
                onPress={onBuildRoute}>
                <Text style={styles.btnText}>Build Route</Text>
              </TouchableOpacity>
            ) : (
              <View style={styles.row}>
                <TouchableOpacity style={styles.btnGreen} onPress={onStartNavigation}>
                  <Text style={styles.btnText}>Start Navigation</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.btnOrange} onPress={onClear}>
                  <Text style={styles.btnText}>Clear</Text>
                </TouchableOpacity>
              </View>
            )
          ) : (
            <TouchableOpacity style={styles.btnRed} onPress={stopNavigation}>
              <Text style={styles.btnText}>Stop Navigation</Text>
            </TouchableOpacity>
          )}

          <Text style={styles.status}>{status}</Text>
        </View>
      </SafeAreaView>

      {navigating && instruction ? (
        <SafeAreaView style={styles.bottomOverlay} pointerEvents="box-none">
          <View style={styles.bottomPanel}>
            <Text style={styles.metricGreen}>{remainingDuration(instruction)}</Text>
            <Text style={styles.metric}>{eta(instruction)}</Text>
            <Text style={styles.metricBlue}>{remainingDistance(instruction)}</Text>
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
  row: {flexDirection: 'row', gap: 12},
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
  metricBlue: {fontSize: 16, fontWeight: '700', color: '#2196f3'},
  recenter: {backgroundColor: '#fff', borderRadius: 24, paddingHorizontal: 20, paddingVertical: 10, marginBottom: 24, elevation: 5},
  recenterText: {color: '#2196f3', fontWeight: '600'},
  btnText: {color: '#fff', fontWeight: '600'},
  btnPurple: {backgroundColor: '#673ab7', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 8},
  btnRed: {backgroundColor: '#f44336', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 8},
  btnGreen: {backgroundColor: '#4caf50', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 8},
  btnOrange: {backgroundColor: '#ff9800', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 8},
  btnDisabled: {opacity: 0.5},
});
