// SPDX-FileCopyrightText: 2025-2026 Magic Lane International B.V. <info@magiclane.com>
// SPDX-License-Identifier: Apache-2.0
//
// Contact Magic Lane at <info@magiclane.com> for SDK licensing options.

// Builds a Paris -> Brussels route and centers the camera on its first traffic
// event.

import React, {useEffect, useRef, useState} from 'react';
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
  TaskHandler,
} from '@magiclane/maps-sdk';
import {GLView} from '@magiclane/maps-sdk-react-native';

// Optional: a token from https://developer.magiclane.com removes the watermark
// and unlocks full functionality. The map renders without one.
const GEMKIT_TOKEN = '';

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
  const [calculating, setCalculating] = useState(false);
  const [hasRoute, setHasRoute] = useState(false);
  const routingHandler = useRef<TaskHandler | null>(null);
  const currentRoute = useRef<Route | null>(null);

  const buildRoute = () => {
    if (!gemMap) return;
    const departure = Landmark.withLatLng({latitude: 48.85682, longitude: 2.34375});
    const destination = Landmark.withLatLng({latitude: 50.84644, longitude: 4.34587});
    const prefs = new RoutePreferences();
    setCalculating(true);
    setStatus('The route is being calculated.');
    routingHandler.current = RoutingService.calculateRoute(
      [departure, destination],
      prefs,
      (err: GemError, routes: Route[]) => {
        if (err === GemError.cancel) {
          return; // Cancelled by the user; cancelRoute already updated the UI.
        }
        routingHandler.current = null;
        setCalculating(false);
        if (err === GemError.success && routes.length > 0) {
          gemMap.preferences.routes.add(routes[0], true);
          gemMap.centerOnRoute(routes[0]);
          currentRoute.current = routes[0];
          setHasRoute(true);
          setStatus('Route calculated successfully!');
        } else {
          setStatus('Route calculation failed.');
        }
      },
    );
  };

  const cancelRoute = () => {
    if (routingHandler.current) {
      RoutingService.cancelRoute(routingHandler.current);
      routingHandler.current = null;
      setCalculating(false);
      setStatus('Route calculation cancelled.');
    }
  };

  const centerOnTraffic = () => {
    const route = currentRoute.current;
    if (!route) return;
    const trafficEvents = route.trafficEvents;
    if (!trafficEvents || trafficEvents.length === 0) {
      setStatus('No traffic events found.');
      return;
    }
    gemMap.centerOnRouteTrafficEvent(trafficEvents[0], {zoomLevel: 70});
    setStatus('Centered on first traffic event.');
  };

  const clearRoutes = () => {
    gemMap?.preferences.routes.clear();
    gemMap?.deactivateAllHighlights();
    currentRoute.current = null;
    setHasRoute(false);
    setStatus('Routes cleared');
  };

  return (
    <View style={styles.root}>
      <StatusBar barStyle="dark-content" />
      <GLView
        style={StyleSheet.absoluteFill}
        apiToken={GEMKIT_TOKEN || undefined}
        onMapReady={event => {
          if (event.gemMap) {
            setGemMap(event.gemMap);
            setStatus('Map Ready');
          }
        }}
      />
      <SafeAreaView style={styles.safeOverlay} pointerEvents="box-none">
        <View style={styles.overlay}>
          <Text style={styles.header}>Center on Traffic</Text>
          {calculating ? (
            <TouchableOpacity style={styles.btnRed} onPress={cancelRoute}>
              <Text style={styles.btnText}>Cancel</Text>
            </TouchableOpacity>
          ) : hasRoute ? (
            <View style={styles.row}>
              <TouchableOpacity style={styles.btnOrange} onPress={centerOnTraffic}>
                <Text style={styles.btnText}>Center on Traffic</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.btnGreen} onPress={clearRoutes}>
                <Text style={styles.btnText}>Clear Routes</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity
              style={[styles.btnPurple, !mapDataReady && styles.btnDisabled]}
              onPress={buildRoute}
              disabled={!mapDataReady}>
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
  overlay: {
    margin: 12,
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    elevation: 5,
    alignItems: 'center',
  },
  header: {fontSize: 18, fontWeight: '700', marginBottom: 12, color: '#333'},
  row: {flexDirection: 'row', gap: 10},
  status: {marginTop: 10, color: '#333', textAlign: 'center'},
  btnText: {color: '#fff', fontWeight: '600'},
  btnPurple: {backgroundColor: '#673ab7', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 8},
  btnDisabled: {backgroundColor: '#b0a4d4'},
  btnRed: {backgroundColor: '#f44336', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 8},
  btnOrange: {backgroundColor: '#ff9800', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 8},
  btnGreen: {backgroundColor: '#4caf50', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 8},
});
