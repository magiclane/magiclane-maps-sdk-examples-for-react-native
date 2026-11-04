// SPDX-FileCopyrightText: 2025-2026 Magic Lane International B.V. <info@magiclane.com>
// SPDX-License-Identifier: Apache-2.0
//
// Contact Magic Lane at <info@magiclane.com> for SDK licensing options.

// Tap a point on the map to pick a landmark, choose a time budget, transport
// mode and avoidance options, then compute an isochrone "range" with
// RoutingService.calculateRoute using RoutePreferences.routeRanges, and render
// it on the map.

import React, {useCallback, useEffect, useRef, useState} from 'react';
import {
  View,
  Text,
  StyleSheet,
  StatusBar,
  Modal,
  TouchableOpacity,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {
  Landmark,
  RoutePreferences,
  RoutingService,
  GemError,
  Route,
  RouteRenderSettings,
  RouteRenderOptions,
  RouteTransportMode,
  Coordinates,
  SdkSettings,
} from '@magiclane/maps-sdk';
import {GLView} from '@magiclane/maps-sdk-react-native';

// A token from https://developer.magiclane.com removes the watermark and unlocks
// full functionality. The map renders without one.
const GEMKIT_TOKEN = '';

function convertDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return (h > 0 ? `${h} h ` : '') + `${m} min`;
}

const TIME_PRESETS = [1800, 3600, 7200, 10800]; // 30 min .. 3 h

const TRANSPORT_MODES = [
  {label: 'Car', value: RouteTransportMode.car},
  {label: 'Lorry', value: RouteTransportMode.lorry},
  {label: 'Pedestrian', value: RouteTransportMode.pedestrian},
  {label: 'Bicycle', value: RouteTransportMode.bicycle},
  {label: 'Transit', value: RouteTransportMode.public},
];

type Avoids = {
  avoidMotorways: boolean;
  avoidTollRoads: boolean;
  avoidFerries: boolean;
  avoidUnpavedRoads: boolean;
};

export default function RangeFinderDemo() {
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
  const [panelVisible, setPanelVisible] = useState(false);
  const [timeLimit, setTimeLimit] = useState(3600);
  const [transportMode, setTransportMode] = useState<number>(RouteTransportMode.car);
  const [avoids, setAvoids] = useState<Avoids>({
    avoidMotorways: false,
    avoidTollRoads: false,
    avoidFerries: false,
    avoidUnpavedRoads: false,
  });
  const focusedLandmark = useRef<Landmark | null>(null);
  const calculating = useRef(false);

  // Register the tap-to-select-landmark callback once the map is ready.
  useEffect(() => {
    if (!gemMap) {
      return;
    }
    gemMap.registerTouchCallback(async (pos: any) => {
      await gemMap.setCursorScreenPosition(pos);
      const landmarks = gemMap.cursorSelectionLandmarks();
      await gemMap.resetMapSelection();
      if (!landmarks.length) {
        return;
      }
      gemMap.activateHighlight(landmarks);
      focusedLandmark.current = landmarks[0];
      setPanelVisible(true);
    });
    // Center on Berlin so landmarks are visible.
    gemMap.centerOnCoordinates(new Coordinates({latitude: 52.52, longitude: 13.405}), {
      zoomLevel: 70,
    });
    setStatus('Tap a landmark to start');
    return () => {
      gemMap.registerTouchCallback(undefined);
    };
  }, [gemMap]);

  const closePanel = useCallback(() => {
    gemMap?.deactivateAllHighlights?.();
    focusedLandmark.current = null;
    setPanelVisible(false);
  }, [gemMap]);

  const calculateRange = useCallback(() => {
    if (!gemMap || !focusedLandmark.current || calculating.current) {
      return;
    }
    calculating.current = true;
    const prefs = new RoutePreferences({
      ...avoids,
      transportMode,
      routeRanges: [timeLimit],
    });
    setStatus('Calculating range…');
    setPanelVisible(false);
    RoutingService.calculateRoute(
      [focusedLandmark.current],
      prefs,
      (err: GemError, routes: Route[]) => {
        calculating.current = false;
        if (err === GemError.success && routes.length > 0) {
          const renderSettings = new RouteRenderSettings({
            options: new Set([RouteRenderOptions.main]),
          });
          // Show only this range: earlier ones would otherwise stay on the map
          // under it.
          gemMap.preferences.routes.clear();
          gemMap.preferences.routes.add(routes[0], true, {routeRenderSettings: renderSettings});
          gemMap.centerOnRoute(routes[0]);
          gemMap.deactivateAllHighlights?.();
          focusedLandmark.current = null;
          setStatus('Range calculated successfully!');
        } else {
          setStatus('Range calculation failed.');
        }
      },
    );
  }, [gemMap, avoids, transportMode, timeLimit]);

  const toggle = (key: keyof Avoids) => setAvoids(a => ({...a, [key]: !a[key]}));

  return (
    <View style={styles.root}>
      <StatusBar barStyle="dark-content" />
      <GLView
        style={StyleSheet.absoluteFill}
        apiToken={GEMKIT_TOKEN || undefined}
        onMapReady={event => {
          if (event.gemMap) {
            setGemMap(event.gemMap);
          }
        }}
      />
      <SafeAreaView style={styles.safeOverlay} pointerEvents="box-none">
        <View style={styles.card}>
          <Text style={styles.header}>Range Finder</Text>
          <Text style={styles.status}>{status}</Text>
        </View>
      </SafeAreaView>

      <Modal visible={panelVisible} transparent animationType="fade" onRequestClose={closePanel}>
        <View style={styles.modalBackdrop}>
          <View style={styles.panel}>
            <View style={styles.panelHeader}>
              <Text style={styles.panelTitle}>Range Finder</Text>
              <TouchableOpacity onPress={closePanel}>
                <Text style={styles.closeText}>✕</Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.sectionLabel}>Time Limit: {convertDuration(timeLimit)}</Text>
            <View style={styles.chipRow}>
              {TIME_PRESETS.map(t => (
                <TouchableOpacity
                  key={t}
                  style={[styles.chip, timeLimit === t && styles.chipActive]}
                  onPress={() => setTimeLimit(t)}>
                  <Text style={[styles.chipText, timeLimit === t && styles.chipTextActive]}>
                    {convertDuration(t)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.sectionLabel}>Transport Mode</Text>
            <View style={styles.chipRow}>
              {TRANSPORT_MODES.map(m => (
                <TouchableOpacity
                  key={m.value}
                  style={[styles.chip, transportMode === m.value && styles.chipActive]}
                  onPress={() => setTransportMode(m.value)}>
                  <Text
                    style={[styles.chipText, transportMode === m.value && styles.chipTextActive]}>
                    {m.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.sectionLabel}>Avoid</Text>
            <View style={styles.chipRow}>
              {(
                [
                  ['avoidMotorways', 'Motorways'],
                  ['avoidTollRoads', 'Tolls'],
                  ['avoidFerries', 'Ferries'],
                  ['avoidUnpavedRoads', 'Unpaved'],
                ] as [keyof Avoids, string][]
              ).map(([key, label]) => (
                <TouchableOpacity
                  key={key}
                  style={[styles.chip, avoids[key] && styles.chipActive]}
                  onPress={() => toggle(key)}>
                  <Text style={[styles.chipText, avoids[key] && styles.chipTextActive]}>
                    {label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <TouchableOpacity
              style={[styles.calcBtn, !mapDataReady && styles.btnDisabled]}
              disabled={!mapDataReady}
              onPress={calculateRange}>
              <Text style={styles.btnText}>Calculate Range</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
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
  header: {fontSize: 18, fontWeight: '700', color: '#333'},
  status: {marginTop: 8, color: '#333', textAlign: 'center'},
  btnText: {color: '#fff', fontWeight: '600'},
  modalBackdrop: {flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', padding: 16},
  panel: {backgroundColor: '#fff', borderRadius: 24, padding: 24},
  panelHeader: {flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12},
  panelTitle: {fontSize: 20, fontWeight: '700', color: '#111'},
  closeText: {fontSize: 20, color: '#666'},
  sectionLabel: {fontWeight: '600', color: '#444', fontSize: 14, marginTop: 12, marginBottom: 8},
  chipRow: {flexDirection: 'row', flexWrap: 'wrap', gap: 8},
  chip: {paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, backgroundColor: '#f0f0f0'},
  chipActive: {backgroundColor: '#2196f3'},
  chipText: {color: '#333', fontSize: 13},
  chipTextActive: {color: '#fff', fontWeight: '600'},
  calcBtn: {
    marginTop: 20,
    backgroundColor: '#1976d2',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  btnDisabled: {opacity: 0.5},
});
