// SPDX-FileCopyrightText: 2025-2026 Magic Lane International B.V. <info@magiclane.com>
// SPDX-License-Identifier: Apache-2.0
//
// Contact Magic Lane at <info@magiclane.com> for SDK licensing options.

// The user draws on the map with a finger (enableDrawMarkersMode), then a
// pedestrian route is calculated through what was drawn and shown on the map.
//
// The SDK logic (enableDrawMarkersMode / disableDrawMarkersMode +
// RoutingService.calculateRoute) is identical to the web demo; only the host and
// chrome differ: the web demo appends a DOM view and HTML buttons, while here
// the map is the <GLView> component and the controls are a React Native overlay.

import React, {useEffect, useRef, useState} from 'react';
import {View, Text, StyleSheet, StatusBar, TouchableOpacity} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {
  Coordinates,
  RoutingService,
  RoutePreferences,
  GemError,
  Route,
  RouteTransportMode,
  SdkSettings,
  TaskHandler,
} from '@magiclane/maps-sdk';
import {GLView} from '@magiclane/maps-sdk-react-native';

// Optional: a token from https://developer.magiclane.com removes the watermark
// and unlocks full functionality. The map renders without one.
const GEMKIT_TOKEN = '';

function convertDistance(meters: number): string {
  return meters >= 1000 ? `${(meters / 1000).toFixed(1)} km` : `${Math.round(meters)} m`;
}

function convertDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return (h > 0 ? `${h} h ` : '') + `${m} min`;
}

// Map label for a route (replaces the Dart extension in the original).
function getRouteMapLabel(route: Route): string {
  const timeDistance = route.getTimeDistance();
  const totalDistance = timeDistance.unrestrictedDistanceM + timeDistance.restrictedDistanceM;
  const totalDuration = timeDistance.unrestrictedTimeS + timeDistance.restrictedTimeS;
  return `${convertDistance(totalDistance)} \n${convertDuration(totalDuration)}`;
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
  const [areRoutesBuilt, setAreRoutesBuilt] = useState(false);
  const [isInDrawingMode, setIsInDrawingMode] = useState(false);
  const [calculating, setCalculating] = useState(false);
  const routingHandler = useRef<TaskHandler | null>(null);

  const showMessage = (message: string) => setStatus(message);

  const onMapReady = (map: any) => {
    setGemMap(map);
    map.centerOnCoordinates(Coordinates.fromLatLong(44.4268, 26.1025), {zoomLevel: 70});
    setStatus('Tap "Draw Route" to begin.');
  };

  const onDrawPressed = () => {
    if (!gemMap) return;
    gemMap.enableDrawMarkersMode();
    setIsInDrawingMode(true);
    showMessage('Drag a finger across the map to draw the route.');
  };

  const onBuildRouteButtonPressed = () => {
    if (!gemMap) return;
    const waypoints = gemMap.disableDrawMarkersMode();

    const routePreferences = new RoutePreferences({
      accurateTrackMatch: false,
      transportMode: RouteTransportMode.pedestrian,
      ignoreRestrictionsOverTrack: true,
    });

    showMessage('The route is being calculated.');
    setCalculating(true);

    routingHandler.current = RoutingService.calculateRoute(
      waypoints,
      routePreferences,
      (err: GemError, routes: Route[]) => {
        if (err === GemError.cancel) {
          return; // Cancelled by the user; onCancelRouteButtonPressed already updated the UI.
        }
        routingHandler.current = null;
        setCalculating(false);
        setIsInDrawingMode(false);

        if (err === GemError.success && routes.length > 0) {
          const routesMap = gemMap.preferences.routes;
          routes.forEach((route, idx) => {
            routesMap.add(route, idx === 0, {label: getRouteMapLabel(route)});
          });
          gemMap.centerOnRoutes({routes});
          setAreRoutesBuilt(true);
          showMessage('Route built successfully!');
        } else {
          showMessage('Route calculation failed.');
        }
      },
    );
  };

  const onClearRoutesButtonPressed = () => {
    if (!gemMap) return;
    gemMap.preferences.routes.clear();
    setAreRoutesBuilt(false);
    showMessage('Routes cleared.');
  };

  const onCancelRouteButtonPressed = () => {
    if (routingHandler.current) {
      RoutingService.cancelRoute(routingHandler.current);
      routingHandler.current = null;
      setCalculating(false);
      setIsInDrawingMode(false);
      showMessage('Route calculation cancelled.');
    }
  };

  // Mirror the web example's four-state button (draw → build → cancel → clear).
  const renderButton = () => {
    if (calculating) {
      return (
        <TouchableOpacity style={[styles.btn, styles.btnRed]} onPress={onCancelRouteButtonPressed}>
          <Text style={styles.btnText}>Cancel</Text>
        </TouchableOpacity>
      );
    }
    if (areRoutesBuilt) {
      return (
        <TouchableOpacity style={[styles.btn, styles.btnOrange]} onPress={onClearRoutesButtonPressed}>
          <Text style={styles.btnText}>Clear Routes</Text>
        </TouchableOpacity>
      );
    }
    if (isInDrawingMode) {
      return (
        <TouchableOpacity
          style={[styles.btn, styles.btnGreen, !mapDataReady && styles.btnDisabled]}
          disabled={!mapDataReady}
          onPress={onBuildRouteButtonPressed}>
          <Text style={styles.btnText}>Build Route</Text>
        </TouchableOpacity>
      );
    }
    return (
      <TouchableOpacity
        style={[styles.btn, styles.btnPurple, !gemMap && styles.btnDisabled]}
        onPress={onDrawPressed}
        disabled={!gemMap}>
        <Text style={styles.btnText}>Draw Route</Text>
      </TouchableOpacity>
    );
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
          <Text style={styles.header}>Finger Route</Text>
          {renderButton()}
          {status ? <Text style={styles.status}>{status}</Text> : null}
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
  btn: {paddingHorizontal: 16, paddingVertical: 10, borderRadius: 8},
  btnDisabled: {opacity: 0.5},
  btnText: {color: '#fff', fontWeight: '600'},
  btnPurple: {backgroundColor: '#673ab7'},
  btnGreen: {backgroundColor: '#4caf50'},
  btnRed: {backgroundColor: '#f44336'},
  btnOrange: {backgroundColor: '#ff9800'},
  status: {marginTop: 10, color: '#333', textAlign: 'center'},
});
