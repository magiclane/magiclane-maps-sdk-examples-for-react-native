// SPDX-FileCopyrightText: 2025-2026 Magic Lane International B.V. <info@magiclane.com>
// SPDX-License-Identifier: Apache-2.0
//
// Contact Magic Lane at <info@magiclane.com> for SDK licensing options.

// Calculates a pedestrian route in the Swiss Alps WITH a terrain profile, draws
// it, and shows a bottom panel with distance / duration and an elevation
// profile. Tapping a key location (Start / Low / High / End) highlights that
// point on the map.
//
// The SDK calls (RoutePreferences with BuildTerrainProfile,
// route.terrainProfile.getElevationSamples, route.getCoordinateOnRoute,
// map.activateHighlight) are identical to the web demo; only the host differs: a
// <GLView> component instead of a DOM container, and the DOM chart becomes a row
// of scaled <View> bars.

import React, {useEffect, useRef, useState} from 'react';
import {View, Text, StyleSheet, StatusBar, TouchableOpacity, ScrollView} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {
  Landmark,
  RoutePreferences,
  RoutingService,
  GemError,
  Route,
  RouteTransportMode,
  Coordinates,
  RouteRenderOptions,
  RouteRenderSettings,
  BuildTerrainProfile,
  GemIcon,
  HighlightRenderSettings,
  HighlightOptions,
  SdkSettings,
  TaskHandler,
} from '@magiclane/maps-sdk';
import {GLView} from '@magiclane/maps-sdk-react-native';

// Optional: a token from https://developer.magiclane.com removes the watermark
// and unlocks full functionality. The map renders without one.
const GEMKIT_TOKEN = '';

// Swiss Alps start / end (short, steep pedestrian route).
const DEPARTURE = {latitude: 46.59344, longitude: 7.91069};
const DESTINATION = {latitude: 46.55945, longitude: 7.89293};

interface Sample {
  distance: number;
  elevation: number;
}

interface KeyPoint {
  name: string;
  dist: number;
  elevation: number;
  color: string;
}

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

function routeTotalDistance(route: Route): number {
  const td = route.getTimeDistance();
  return td.unrestrictedDistanceM + td.restrictedDistanceM;
}

function getElevationSamples(route: Route): Sample[] {
  const total = routeTotalDistance(route);
  let count = Math.min(Math.ceil(total / 50), 60);
  count = Math.max(count, 2);
  const profile = route.terrainProfile;
  if (!profile) {
    return [];
  }
  try {
    const raw = profile.getElevationSamples(count, 0, total);
    const result: Sample[] = [];
    let d = 0;
    for (let i = 0; i < raw.first.length; i++) {
      result.push({distance: d, elevation: raw.first[i]});
      d += raw.second;
    }
    return result;
  } catch (e) {
    return [];
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
  const [calculating, setCalculating] = useState(false);
  const [samples, setSamples] = useState<Sample[]>([]);
  const [keyPoints, setKeyPoints] = useState<KeyPoint[]>([]);
  const [summary, setSummary] = useState<{dist: string; dur: string; mode: string} | null>(
    null,
  );
  const focusedRoute = useRef<Route | null>(null);
  const routingHandler = useRef<TaskHandler | null>(null);

  const buildKeyPoints = (route: Route, s: Sample[]): KeyPoint[] => {
    if (s.length === 0) {
      return [];
    }
    let minE = s[0].elevation;
    let maxE = s[0].elevation;
    let minD = 0;
    let maxD = 0;
    s.forEach(x => {
      if (x.elevation < minE) {
        minE = x.elevation;
        minD = x.distance;
      }
      if (x.elevation > maxE) {
        maxE = x.elevation;
        maxD = x.distance;
      }
    });
    return [
      {name: 'Start', dist: 0, elevation: s[0].elevation, color: '#4CAF50'},
      {name: 'Low', dist: minD, elevation: minE, color: '#2196F3'},
      {name: 'High', dist: maxD, elevation: maxE, color: '#FF9800'},
      {
        name: 'End',
        dist: routeTotalDistance(route),
        elevation: s[s.length - 1].elevation,
        color: '#F44336',
      },
    ];
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
    const prefs = new RoutePreferences({
      buildTerrainProfile: new BuildTerrainProfile({enable: true}),
      transportMode: RouteTransportMode.pedestrian,
    });
    setCalculating(true);
    setStatus('Calculating terrain route…');

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
          routes.forEach((route, idx) => {
            const settings = new RouteRenderSettings({
              options: new Set([
                RouteRenderOptions.showTraffic,
                RouteRenderOptions.showHighlights,
              ]),
            });
            routesMap.add(route, idx === 0, {routeRenderSettings: settings});
          });
          routesMap.mainRoute = routes[0];
          const route = routes[0];
          focusedRoute.current = route;
          gemMap.centerOnRoutes({routes: [route]});

          const s = getElevationSamples(route);
          setSamples(s);
          setKeyPoints(buildKeyPoints(route, s));
          setSummary({
            dist: convertDistance(routeTotalDistance(route)),
            dur: convertDuration(
              route.getTimeDistance().unrestrictedTimeS +
                route.getTimeDistance().restrictedTimeS,
            ),
            mode: RouteTransportMode[route.preferences.transportMode] || 'Walking',
          });
          setStatus('Route calculated successfully!');
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
    gemMap?.deactivateHighlight();
    focusedRoute.current = null;
    setSamples([]);
    setKeyPoints([]);
    setSummary(null);
    setStatus('Routes cleared.');
  };

  // Highlight a key location on the map (uses getCoordinateOnRoute + highlight).
  const highlightPoint = (kp: KeyPoint) => {
    const route = focusedRoute.current;
    if (!route || !gemMap) {
      return;
    }
    try {
      const coords = route.getCoordinateOnRoute(Math.floor(kp.dist));
      gemMap.deactivateHighlight();
      const landmark = Landmark.create();
      landmark.coordinates = coords;
      try {
        landmark.setImageFromIcon(GemIcon.searchResultsPin);
      } catch (e) {}
      const settings = new HighlightRenderSettings({
        options: new Set([HighlightOptions.showLandmark, HighlightOptions.noFading]),
      });
      gemMap.activateHighlight([landmark], {renderSettings: settings});
      setStatus(`${kp.name}: ${Math.round(kp.elevation)} m at ${convertDistance(kp.dist)}`);
    } catch (e) {
      // ignore
    }
  };

  const onMapReady = (map: any) => {
    setGemMap(map);
    setStatus('Map Ready');
  };

  // Scale the elevation samples into bar heights for a lightweight sparkline.
  let minE = 0;
  let maxE = 1;
  if (samples.length > 0) {
    minE = samples[0].elevation;
    maxE = samples[0].elevation;
    samples.forEach(s => {
      minE = Math.min(minE, s.elevation);
      maxE = Math.max(maxE, s.elevation);
    });
  }
  const range = maxE - minE || 1;

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
          <Text style={styles.header}>Route Profile</Text>
          {calculating ? (
            <TouchableOpacity style={styles.btnRed} onPress={onCancel}>
              <Text style={styles.btnText}>Cancel</Text>
            </TouchableOpacity>
          ) : summary ? (
            <TouchableOpacity style={styles.btnOrange} onPress={onClear}>
              <Text style={styles.btnText}>Clear Route</Text>
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

      {summary ? (
        <SafeAreaView style={styles.bottomOverlay} pointerEvents="box-none">
          <View style={styles.panel}>
            <View style={styles.panelHeader}>
              <Text style={styles.panelTitle}>Route Profile</Text>
              <Text style={styles.badge}>{summary.mode}</Text>
            </View>
            <View style={styles.statsRow}>
              <View>
                <Text style={styles.statLabel}>Distance</Text>
                <Text style={styles.statValue}>{summary.dist}</Text>
              </View>
              <View>
                <Text style={styles.statLabel}>Duration</Text>
                <Text style={styles.statValue}>{summary.dur}</Text>
              </View>
              {samples.length > 0 ? (
                <View>
                  <Text style={styles.statLabel}>Elevation</Text>
                  <Text style={styles.statValue}>
                    {Math.round(minE)}–{Math.round(maxE)} m
                  </Text>
                </View>
              ) : null}
            </View>

            {samples.length > 0 ? (
              <View style={styles.chart}>
                {samples.map((s, i) => (
                  <View
                    key={i}
                    style={[
                      styles.bar,
                      {height: 8 + ((s.elevation - minE) / range) * 72},
                    ]}
                  />
                ))}
              </View>
            ) : (
              <Text style={styles.noData}>Terrain profile data not available.</Text>
            )}

            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={styles.keyRow}>
                {keyPoints.map(kp => (
                  <TouchableOpacity
                    key={kp.name}
                    style={styles.keyBtn}
                    onPress={() => highlightPoint(kp)}>
                    <Text style={[styles.keyName, {color: kp.color}]}>{kp.name}</Text>
                    <Text style={styles.keyEle}>{Math.round(kp.elevation)} m</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>
          </View>
        </SafeAreaView>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {flex: 1, backgroundColor: '#000'},
  safeOverlay: {position: 'absolute', top: 0, left: 0, right: 0},
  bottomOverlay: {position: 'absolute', bottom: 0, left: 0, right: 0},
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
  panel: {
    margin: 12,
    backgroundColor: '#fdfdfd',
    borderRadius: 16,
    padding: 16,
    elevation: 8,
  },
  panelHeader: {flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center'},
  panelTitle: {fontSize: 16, fontWeight: '700', color: '#333'},
  badge: {fontSize: 12, color: '#666', backgroundColor: '#eee', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12},
  statsRow: {flexDirection: 'row', gap: 24, marginTop: 12},
  statLabel: {fontSize: 12, color: '#888'},
  statValue: {fontSize: 16, fontWeight: '600', color: '#333'},
  chart: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    height: 84,
    marginTop: 16,
    backgroundColor: '#fafafa',
    borderRadius: 8,
    paddingHorizontal: 4,
    gap: 1,
  },
  bar: {flex: 1, backgroundColor: '#673AB7', borderRadius: 1},
  noData: {marginTop: 16, color: '#888', textAlign: 'center'},
  keyRow: {flexDirection: 'row', gap: 10, marginTop: 16},
  keyBtn: {
    backgroundColor: '#f9f9f9',
    borderWidth: 1,
    borderColor: '#eee',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    alignItems: 'center',
  },
  keyName: {fontSize: 12, fontWeight: '600'},
  keyEle: {fontSize: 11, color: '#666'},
  btnText: {color: '#fff', fontWeight: '600'},
  btnPurple: {backgroundColor: '#673ab7', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 8},
  btnRed: {backgroundColor: '#f44336', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 8},
  btnOrange: {backgroundColor: '#ff9800', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 8},
  btnDisabled: {opacity: 0.5},
});
