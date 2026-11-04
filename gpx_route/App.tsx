// SPDX-FileCopyrightText: 2025-2026 Magic Lane International B.V. <info@magiclane.com>
// SPDX-License-Identifier: Apache-2.0
//
// Contact Magic Lane at <info@magiclane.com> for SDK licensing options.

// Parses a GPX track with the SDK (Path.create -> toLandmarkList), calculates a
// bicycle route through the track points, displays it, and simulates navigation
// along it.
//
// The web demo fetches a large recorded_route.gpx from disk. Reading a bundled
// asset's raw bytes is not available in a plain RN project, so this app embeds a
// compact GPX track (Seceda, Dolomites) inline and feeds its bytes to the exact
// same SDK call: Path.create({ data, format: PathFileFormat.gpx }).

import React, {useEffect, useRef, useState} from 'react';
import {View, Text, StyleSheet, StatusBar, TouchableOpacity} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {
  RoutingService,
  RoutePreferences,
  GemError,
  Route,
  Landmark,
  Path,
  PathFileFormat,
  NavigationService,
  RouteTransportMode,
  SdkSettings,
  TaskHandler,
} from '@magiclane/maps-sdk';
import {GLView} from '@magiclane/maps-sdk-react-native';

// Optional: a token from https://developer.magiclane.com removes the watermark
// and unlocks full functionality. The map renders without one.
const GEMKIT_TOKEN = '';

// Compact GPX track (a subset of a real Seceda hike in the Dolomites). The web
// example loads a much larger recorded_route.gpx from the public/ folder.
const GPX_TRACK = `<?xml version="1.0"?>
<gpx xmlns="http://www.topografix.com/GPX/1/1" version="1.1" creator="MagicLane">
  <trk>
    <name>Seceda</name>
    <trkseg>
      <trkpt lat="46.59791" lon="11.72468"><ele>2449.93</ele></trkpt>
      <trkpt lat="46.60065" lon="11.73090"><ele>2401.00</ele></trkpt>
      <trkpt lat="46.59977" lon="11.73785"><ele>2360.00</ele></trkpt>
      <trkpt lat="46.59774" lon="11.74826"><ele>2300.00</ele></trkpt>
      <trkpt lat="46.59864" lon="11.75678"><ele>2250.00</ele></trkpt>
      <trkpt lat="46.59098" lon="11.75779"><ele>2180.00</ele></trkpt>
      <trkpt lat="46.58425" lon="11.75823"><ele>2050.00</ele></trkpt>
      <trkpt lat="46.57783" lon="11.75065"><ele>1900.00</ele></trkpt>
      <trkpt lat="46.57443" lon="11.74175"><ele>1780.00</ele></trkpt>
      <trkpt lat="46.56656" lon="11.73613"><ele>1600.00</ele></trkpt>
      <trkpt lat="46.55911" lon="11.72849"><ele>1430.00</ele></trkpt>
    </trkseg>
  </trk>
</gpx>`;

// The GPX text is ASCII, so encode it byte-for-byte without TextEncoder.
function toBytes(text: string): Uint8Array {
  const bytes = new Uint8Array(text.length);
  for (let i = 0; i < text.length; i++) {
    bytes[i] = text.charCodeAt(i) & 0xff;
  }
  return bytes;
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

function getRouteLabel(route: Route): string {
  const td = route.getTimeDistance();
  const dist = td.unrestrictedDistanceM + td.restrictedDistanceM;
  const time = td.unrestrictedTimeS + td.restrictedTimeS;
  return `${convertDistance(dist)} \n${convertDuration(time)}`;
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
  const gpxLoaded = useRef(false);
  const navHandler = useRef<TaskHandler | null>(null);
  const calculating = useRef(false);

  // Stop a running simulation when the screen goes away.
  useEffect(
    () => () => {
      if (navHandler.current) {
        NavigationService.cancelNavigation(navHandler.current);
        navHandler.current = null;
      }
    },
    [],
  );

  const importGPX = () => {
    if (!gemMap) {
      setStatus('Map not ready yet');
      return;
    }
    // Ignore repeated presses while the route is calculating.
    if (calculating.current) {
      return;
    }
    calculating.current = true;
    setStatus('Parsing GPX and calculating route…');

    // Parse the GPX track with the SDK, then route through its points.
    const gemPath = Path.create({data: toBytes(GPX_TRACK), format: PathFileFormat.gpx});
    const landmarkList: Landmark[] = gemPath.toLandmarkList();

    const prefs = new RoutePreferences({transportMode: RouteTransportMode.bicycle});

    RoutingService.calculateRoute(
      landmarkList,
      prefs,
      (err: GemError, routes: Route[]) => {
        calculating.current = false;
        if (err === GemError.success && routes.length > 0) {
          const routesMap = gemMap.preferences.routes;
          routes.forEach((route, idx) =>
            routesMap.add(route, idx === 0, {label: getRouteLabel(route)}),
          );
          gemMap.centerOnRoutes({routes});
          gpxLoaded.current = true;
          setRoutesBuilt(true);
          setStatus('Route loaded successfully.');
        } else {
          setStatus('Route calculation failed.');
        }
      },
    );
  };

  const startSimulation = () => {
    if (simActive || !gpxLoaded.current) {
      return;
    }
    const mainRoute = gemMap.preferences.routes.mainRoute;
    if (!mainRoute) {
      setStatus('No route available');
      return;
    }
    // The simulation ends by itself at the destination (or on an error); go
    // back to "Start Simulation" then, keeping the route on the map.
    const endSimulation = (message: string) => {
      navHandler.current = null;
      setSimActive(false);
      setStatus(message);
    };
    navHandler.current = NavigationService.startSimulation(
      mainRoute,
      undefined,
      {
        speedMultiplier: 2,
        onDestinationReached: () => endSimulation('Destination reached.'),
        onError: (error: GemError) => {
          // cancel comes from Stop Simulation, which resets the UI itself.
          if (error !== GemError.cancel) {
            endSimulation(`Simulation ended (error ${error}).`);
          }
        },
      },
    );
    gemMap.startFollowingPosition();
    setSimActive(true);
    setStatus('Simulation started.');
  };

  const stopSimulation = () => {
    gemMap?.preferences.routes.clear();
    if (navHandler.current) {
      NavigationService.cancelNavigation(navHandler.current);
      navHandler.current = null;
    }
    gpxLoaded.current = false;
    setSimActive(false);
    setRoutesBuilt(false);
    setStatus('Simulation stopped.');
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
        <View style={styles.card}>
          <Text style={styles.header}>GPX Route</Text>
          {!routesBuilt ? (
            <TouchableOpacity
              style={[styles.btnPurple, !mapDataReady && styles.btnDisabled]}
              disabled={!mapDataReady}
              onPress={importGPX}>
              <Text style={styles.btnText}>Import GPX</Text>
            </TouchableOpacity>
          ) : !simActive ? (
            <TouchableOpacity style={styles.btnGreen} onPress={startSimulation}>
              <Text style={styles.btnText}>Start Simulation</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity style={styles.btnRed} onPress={stopSimulation}>
              <Text style={styles.btnText}>Stop Simulation</Text>
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
