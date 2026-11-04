// SPDX-FileCopyrightText: 2025-2026 Magic Lane International B.V. <info@magiclane.com>
// SPDX-License-Identifier: Apache-2.0
//
// Contact Magic Lane at <info@magiclane.com> for SDK licensing options.

// Calculates a truck route (Paris -> London) using an adjustable TruckProfile
// (height, length, width, axle load, max speed, total weight), drawn on the
// map. Tapping an alternative route makes it the main route.
//
// The SDK calls (new RoutePreferences({ transportMode: lorry, truckProfile }),
// RoutingService.calculateRoute) match the web demo; only the host differs: a
// <GLView> component instead of a DOM container, and the web settings-sidebar
// sliders become numeric steppers. Unlike the web demo, this app selects the
// lorry transport mode (otherwise the truck profile is ignored and the route is
// a car route) and converts the max speed from km/h to the m/s the SDK expects.

import React, {useEffect, useRef, useState} from 'react';
import {View, Text, StyleSheet, StatusBar, TouchableOpacity, ScrollView} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {
  Landmark,
  TruckProfile,
  RoutePreferences,
  RoutingService,
  SdkSettings,
  GemError,
  Route,
  Coordinates,
  RouteTransportMode,
  TaskHandler,
} from '@magiclane/maps-sdk';
import {GLView} from '@magiclane/maps-sdk-react-native';

// Optional: a token from https://developer.magiclane.com removes the watermark
// and unlocks full functionality. The map renders without one.
const GEMKIT_TOKEN = '';

// Paris -> London.
const DEPARTURE = {latitude: 48.87126, longitude: 2.33787};
const DESTINATION = {latitude: 51.4739, longitude: -0.0302};

interface Dimension {
  key: 'height' | 'length' | 'width' | 'axleLoad' | 'maxSpeed' | 'mass';
  label: string;
  min: number;
  max: number;
  step: number;
  unit: string;
}

const DIMENSIONS: Dimension[] = [
  {key: 'height', label: 'Height', min: 180, max: 400, step: 10, unit: 'cm'},
  {key: 'length', label: 'Length', min: 500, max: 2000, step: 50, unit: 'cm'},
  {key: 'width', label: 'Width', min: 200, max: 400, step: 10, unit: 'cm'},
  {key: 'axleLoad', label: 'Axle Load', min: 1500, max: 10000, step: 250, unit: 'kg'},
  {key: 'maxSpeed', label: 'Max Speed', min: 60, max: 250, step: 5, unit: 'km/h'},
  {key: 'mass', label: 'Total Weight', min: 3000, max: 50000, step: 500, unit: 'kg'},
];

type Dims = {[K in Dimension['key']]: number};

const INITIAL_DIMS: Dims = {
  height: 300,
  length: 1000,
  width: 250,
  axleLoad: 4000,
  maxSpeed: 90,
  mass: 15000,
};

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

function getMapLabel(route: Route): string {
  try {
    const td = route.getTimeDistance();
    const dist = td.unrestrictedDistanceM + td.restrictedDistanceM;
    const time = td.unrestrictedTimeS + td.restrictedTimeS;
    return `${convertDistance(dist)} \n${convertDuration(time)}`;
  } catch {
    return 'Route';
  }
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
  const [showSettings, setShowSettings] = useState(false);
  const [dims, setDims] = useState<Dims>(INITIAL_DIMS);
  const routingHandler = useRef<TaskHandler | null>(null);

  // Stop a running calculation when the screen goes away.
  useEffect(() => {
    return () => {
      if (routingHandler.current) {
        RoutingService.cancelRoute(routingHandler.current);
        routingHandler.current = null;
      }
    };
  }, []);

  const adjust = (d: Dimension, delta: number) => {
    setDims(prev => {
      const next = Math.min(d.max, Math.max(d.min, prev[d.key] + delta * d.step));
      return {...prev, [d.key]: next};
    });
  };

  const onBuildRoute = () => {
    if (!gemMap) {
      setStatus('Map not ready yet');
      return;
    }
    const departure = Landmark.withCoordinates(
      Coordinates.fromLatLong(DEPARTURE.latitude, DEPARTURE.longitude),
    );
    const destination = Landmark.withCoordinates(
      Coordinates.fromLatLong(DESTINATION.latitude, DESTINATION.longitude),
    );
    // The steppers show km/h; TruckProfile.maxSpeed is in m/s.
    const truckProfile = new TruckProfile({...dims, maxSpeed: dims.maxSpeed / 3.6});
    // Without the lorry transport mode the truck profile is not used.
    const prefs = new RoutePreferences({
      transportMode: RouteTransportMode.lorry,
      truckProfile,
    });
    setCalculating(true);
    setStatus('Calculating truck route…');

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
            routesMap.add(route, index === 0, {label: getMapLabel(route)}),
          );
          gemMap.centerOnRoutes({routes});
          setRoutesBuilt(true);
          setStatus('Routes calculated successfully!');
        } else {
          setStatus('Failed to calculate route');
        }
      },
    );
  };

  const onCancel = () => {
    if (routingHandler.current) {
      RoutingService.cancelRoute(routingHandler.current);
      routingHandler.current = null;
      setCalculating(false);
      setStatus('Route calculation cancelled');
    }
  };

  const onClear = () => {
    gemMap?.preferences.routes.clear();
    setRoutesBuilt(false);
    setStatus('Routes cleared');
  };

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
          <Text style={styles.header}>Truck Profile</Text>
          <View style={styles.row}>
            {calculating ? (
              <TouchableOpacity style={styles.btnRed} onPress={onCancel}>
                <Text style={styles.btnText}>Cancel</Text>
              </TouchableOpacity>
            ) : routesBuilt ? (
              <TouchableOpacity style={styles.btnOrange} onPress={onClear}>
                <Text style={styles.btnText}>Clear</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                style={[styles.btnPurple, !mapDataReady && styles.btnDisabled]}
                disabled={!mapDataReady}
                onPress={onBuildRoute}>
                <Text style={styles.btnText}>Build Route</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={styles.btnGrey}
              onPress={() => setShowSettings(s => !s)}>
              <Text style={styles.btnText}>
                {showSettings ? 'Hide' : 'Settings'}
              </Text>
            </TouchableOpacity>
          </View>
          <Text style={styles.status}>{status}</Text>
        </View>
      </SafeAreaView>

      {showSettings ? (
        <SafeAreaView style={styles.settingsOverlay} pointerEvents="box-none">
          <ScrollView style={styles.settings} contentContainerStyle={styles.settingsContent}>
            <View style={styles.settingsHeader}>
              <Text style={styles.settingsTitle}>Truck dimensions</Text>
              <TouchableOpacity onPress={() => setShowSettings(false)}>
                <Text style={styles.closeGlyph}>✕</Text>
              </TouchableOpacity>
            </View>
            {DIMENSIONS.map(d => (
              <View key={d.key} style={styles.dimRow}>
                <Text style={styles.dimLabel}>{d.label}</Text>
                <View style={styles.stepper}>
                  <TouchableOpacity
                    style={styles.stepBtn}
                    onPress={() => adjust(d, -1)}>
                    <Text style={styles.stepText}>−</Text>
                  </TouchableOpacity>
                  <Text style={styles.dimValue}>
                    {dims[d.key]} {d.unit}
                  </Text>
                  <TouchableOpacity
                    style={styles.stepBtn}
                    onPress={() => adjust(d, 1)}>
                    <Text style={styles.stepText}>+</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))}
            <Text style={styles.hint}>
              Values apply the next time you build a route.
            </Text>
          </ScrollView>
        </SafeAreaView>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {flex: 1, backgroundColor: '#000'},
  safeOverlay: {position: 'absolute', top: 0, left: 0, right: 0},
  settingsOverlay: {position: 'absolute', top: 0, bottom: 0, left: 0},
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
  settings: {
    width: 300,
    maxHeight: '80%',
    margin: 12,
    backgroundColor: '#fff',
    borderRadius: 12,
    elevation: 8,
  },
  settingsContent: {padding: 16, gap: 12},
  settingsHeader: {flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center'},
  settingsTitle: {fontSize: 16, fontWeight: '700', color: '#333'},
  closeGlyph: {fontSize: 18, color: '#666', paddingHorizontal: 6},
  dimRow: {gap: 6},
  dimLabel: {fontSize: 14, fontWeight: '600', color: '#333'},
  stepper: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between'},
  stepBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#673ab7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepText: {color: '#fff', fontSize: 20, fontWeight: '700'},
  dimValue: {fontSize: 14, fontWeight: '600', color: '#673ab7'},
  hint: {fontSize: 12, color: '#888', marginTop: 8},
  btnText: {color: '#fff', fontWeight: '600'},
  btnPurple: {backgroundColor: '#673ab7', paddingHorizontal: 14, paddingVertical: 10, borderRadius: 8},
  btnRed: {backgroundColor: '#f44336', paddingHorizontal: 14, paddingVertical: 10, borderRadius: 8},
  btnOrange: {backgroundColor: '#ff9800', paddingHorizontal: 14, paddingVertical: 10, borderRadius: 8},
  btnGrey: {backgroundColor: '#607d8b', paddingHorizontal: 14, paddingVertical: 10, borderRadius: 8},
  btnDisabled: {opacity: 0.5},
});
