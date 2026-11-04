// SPDX-FileCopyrightText: 2025-2026 Magic Lane International B.V. <info@magiclane.com>
// SPDX-License-Identifier: Apache-2.0
//
// Contact Magic Lane at <info@magiclane.com> for SDK licensing options.

// Renders two independent maps (top: San Francisco area, bottom: London area),
// each with its own "Build route" button, plus a "Clear all" control.
//
// The SDK calls (RoutingService.calculateRoute, per-map
// map.preferences.routes / map.centerOnRoutes) are identical to the web demo;
// only the host differs: two <GLView> components instead of two DOM containers.

import React, {useEffect, useRef, useState} from 'react';
import {View, Text, StyleSheet, StatusBar, TouchableOpacity} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {
  Landmark,
  RoutePreferences,
  RoutingService,
  GemError,
  Route,
  SdkSettings,
  TaskHandler,
} from '@magiclane/maps-sdk';
import {GLView} from '@magiclane/maps-sdk-react-native';

// Optional: a token from https://developer.magiclane.com removes the watermark
// and unlocks full functionality. The map renders without one.
const GEMKIT_TOKEN = '';

const WAYPOINTS_1 = [
  {latitude: 37.77903, longitude: -122.41991}, // San Francisco
  {latitude: 37.33619, longitude: -121.89058}, // San Jose
];
const WAYPOINTS_2 = [
  {latitude: 51.50732, longitude: -0.12765}, // London
  {latitude: 51.27483, longitude: 0.52316}, // Maidstone
];

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

function getRouteLabel(route: Route): string {
  const td = route.getTimeDistance();
  const dist = td.unrestrictedDistanceM + td.restrictedDistanceM;
  const time = td.unrestrictedTimeS + td.restrictedTimeS;
  return `${convertDistance(dist)}\n${convertDuration(time)}`;
}

export default function App() {
  const map1 = useRef<any>(null);
  const map2 = useRef<any>(null);
  const handler1 = useRef<TaskHandler | null>(null);
  const handler2 = useRef<TaskHandler | null>(null);
  const [status, setStatus] = useState('Loading maps…');
  const [mapShown, setMapShown] = useState(false);
  // Routing needs current map data, which the SDK updates right after
  // start-up. Set once a map is shown and that data is ready.
  const [mapDataReady, setMapDataReady] = useState(false);
  useEffect(() => {
    if (!mapShown) {
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
  }, [mapShown]);

  const buildRoute = (isFirst: boolean) => {
    const map = isFirst ? map1.current : map2.current;
    if (!map) {
      setStatus('Map not ready yet');
      return;
    }
    const waypoints = (isFirst ? WAYPOINTS_1 : WAYPOINTS_2).map(w =>
      Landmark.withLatLng(w),
    );
    const prefs = new RoutePreferences({});
    const handlerRef = isFirst ? handler1 : handler2;
    // A new calculation for this map replaces the one still running, so that
    // "Clear all" can stop every calculation.
    if (handlerRef.current) {
      RoutingService.cancelRoute(handlerRef.current);
      handlerRef.current = null;
    }
    setStatus(isFirst ? 'First route calculating…' : 'Second route calculating…');

    let handler: TaskHandler | null = null;
    const cb = (err: GemError, routes: Route[] | null) => {
      if (handlerRef.current === handler) {
        handlerRef.current = null;
      }
      if (err === GemError.cancel) {
        return; // Replaced, or stopped by "Clear all".
      }
      if (err === GemError.success && routes && routes.length > 0) {
        const routesMap = map.preferences.routes;
        routes.forEach((route, idx) =>
          routesMap.add(route, idx === 0, {label: getRouteLabel(route)}),
        );
        map.centerOnRoutes({routes});
        setStatus(isFirst ? 'First route built.' : 'Second route built.');
      } else {
        setStatus('Route calculation failed.');
      }
    };

    handler = RoutingService.calculateRoute(waypoints, prefs, cb);
    handlerRef.current = handler;
  };

  // Stops the calculations still running and removes all routes.
  const clearAll = () => {
    if (handler1.current) {
      RoutingService.cancelRoute(handler1.current);
      handler1.current = null;
    }
    if (handler2.current) {
      RoutingService.cancelRoute(handler2.current);
      handler2.current = null;
    }
    map1.current?.preferences.routes.clear();
    map2.current?.preferences.routes.clear();
    setStatus('All routes cleared.');
  };

  return (
    <View style={styles.root}>
      <StatusBar barStyle="dark-content" />
      <GLView
        style={styles.half}
        apiToken={GEMKIT_TOKEN || undefined}
        onMapReady={event => {
          if (event.gemMap) {
            map1.current = event.gemMap;
            setMapShown(true);
            setStatus('Maps Ready');
          }
        }}
      />
      <View style={styles.divider} />
      <GLView
        style={styles.half}
        apiToken={GEMKIT_TOKEN || undefined}
        onMapReady={event => {
          if (event.gemMap) {
            map2.current = event.gemMap;
            setMapShown(true);
            setStatus('Maps Ready');
          }
        }}
      />

      <SafeAreaView style={styles.safeOverlay} pointerEvents="box-none">
        <View style={styles.card}>
          <Text style={styles.header}>Multi Map Routing</Text>
          <View style={styles.row}>
            <TouchableOpacity
              style={[styles.btnPurple, !mapDataReady && styles.btnDisabled]}
              disabled={!mapDataReady}
              onPress={() => buildRoute(true)}>
              <Text style={styles.btnText}>Route 1</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.btnPurple, !mapDataReady && styles.btnDisabled]}
              disabled={!mapDataReady}
              onPress={() => buildRoute(false)}>
              <Text style={styles.btnText}>Route 2</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.btnRed} onPress={clearAll}>
              <Text style={styles.btnText}>Clear all</Text>
            </TouchableOpacity>
          </View>
          <Text style={styles.status}>{status}</Text>
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {flex: 1, backgroundColor: '#000'},
  half: {flex: 1},
  divider: {height: 4, backgroundColor: '#000'},
  safeOverlay: {position: 'absolute', top: 0, left: 0, right: 0},
  card: {
    margin: 12,
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    elevation: 5,
    alignItems: 'center',
  },
  header: {fontSize: 18, fontWeight: '700', marginBottom: 12, color: '#333'},
  row: {flexDirection: 'row', gap: 8},
  status: {marginTop: 10, color: '#333', textAlign: 'center'},
  btnText: {color: '#fff', fontWeight: '600'},
  btnPurple: {backgroundColor: '#673ab7', paddingHorizontal: 14, paddingVertical: 10, borderRadius: 8},
  btnRed: {backgroundColor: '#f44336', paddingHorizontal: 14, paddingVertical: 10, borderRadius: 8},
  btnDisabled: {opacity: 0.5},
});
