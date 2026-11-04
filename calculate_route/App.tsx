// SPDX-FileCopyrightText: 2025-2026 Magic Lane International B.V. <info@magiclane.com>
// SPDX-License-Identifier: Apache-2.0
//
// Contact Magic Lane at <info@magiclane.com> for SDK licensing options.

// Calculates a Paris -> Brussels route, draws the alternatives on the map with
// distance / duration labels, and lets you tap an alternative to make it the
// main route.
//
// The SDK calls (RoutingService.calculateRoute, map.preferences.routes,
// map.centerOnRoutes) are identical to the web demo; only the host differs: a
// <GLView> component instead of a DOM container.

import React, {useEffect, useRef, useState} from 'react';
import {View, Text, StyleSheet, StatusBar, TouchableOpacity} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {
  Landmark,
  RoutePreferences,
  RoutingService,
  SdkSettings,
  GemError,
  Route,
  TaskHandler,
} from '@magiclane/maps-sdk';
import {GLView} from '@magiclane/maps-sdk-react-native';

// Optional: a token from https://developer.magiclane.com removes the watermark
// and unlocks full functionality. The map renders without one.
const GEMKIT_TOKEN = '';

// Departure: Paris. Destination: Brussels.
const DEPARTURE = {latitude: 48.85682, longitude: 2.34375};
const DESTINATION = {latitude: 50.84644, longitude: 4.34587};

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
  const [calculating, setCalculating] = useState(false);
  const routingHandler = useRef<TaskHandler | null>(null);

  const onBuildRoute = () => {
    if (!gemMap) {
      setStatus('Map not ready yet');
      return;
    }
    const departure = Landmark.withLatLng(DEPARTURE);
    const destination = Landmark.withLatLng(DESTINATION);
    const prefs = new RoutePreferences({});
    setCalculating(true);
    setStatus('The route is calculating.');

    routingHandler.current = RoutingService.calculateRoute(
      [departure, destination],
      prefs,
      (err: GemError, routes: Route[]) => {
        if (err === GemError.cancel) {
          return; // Cancelled by the user; onCancel already updated the UI.
        }
        routingHandler.current = null;
        setCalculating(false);
        if (err === GemError.success && routes.length > 0) {
          const routesMap = gemMap.preferences.routes;
          routes.forEach((route, index) =>
            routesMap.add(route, index === 0, {label: getRouteLabel(route)}),
          );
          gemMap.centerOnRoutes({routes});
          setRoutesBuilt(true);
          setStatus('Route calculated successfully! Tap a route to select it.');
        } else {
          setStatus('Route calculation failed.');
        }
      },
    );
  };

  const onCancel = () => {
    if (routingHandler.current) {
      RoutingService.cancelRoute(routingHandler.current);
      routingHandler.current = null;
      setCalculating(false);
      setStatus('Route calculation cancelled.');
    }
  };

  const onClear = () => {
    gemMap?.preferences.routes.clear();
    setRoutesBuilt(false);
    setStatus('Routes cleared.');
  };

  // Tap an alternative route to promote it to the main route.
  const onMapReady = (map: any) => {
    setGemMap(map);
    setStatus('Map Ready');
    map.registerTouchCallback(async (pos: {x: number; y: number}) => {
      await map.setCursorScreenPosition(pos);
      const selected = map.cursorSelectionRoutes();
      if (selected.length > 0) {
        map.preferences.routes.mainRoute = selected[0];
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
          <Text style={styles.header}>Calculate Route</Text>
          {calculating ? (
            <TouchableOpacity style={styles.btnRed} onPress={onCancel}>
              <Text style={styles.btnText}>Cancel</Text>
            </TouchableOpacity>
          ) : routesBuilt ? (
            <TouchableOpacity style={styles.btnGreen} onPress={onClear}>
              <Text style={styles.btnText}>Clear Routes</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={[styles.btnPurple, !mapDataReady && styles.btnDisabled]}
              disabled={!mapDataReady}
              onPress={onBuildRoute}>
              <Text style={styles.btnText}>Build Route</Text>
            </TouchableOpacity>
          )}
          <Text style={styles.status}>{status}</Text>
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {flex: 1, backgroundColor: '#000'},
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
  status: {marginTop: 10, color: '#333', textAlign: 'center'},
  btnText: {color: '#fff', fontWeight: '600'},
  btnPurple: {backgroundColor: '#673ab7', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 8},
  btnRed: {backgroundColor: '#f44336', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 8},
  btnGreen: {backgroundColor: '#4caf50', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 8},
  btnDisabled: {opacity: 0.5},
});
