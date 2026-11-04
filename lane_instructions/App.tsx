// SPDX-FileCopyrightText: 2025-2026 Magic Lane International B.V. <info@magiclane.com>
// SPDX-License-Identifier: Apache-2.0
//
// Contact Magic Lane at <info@magiclane.com> for SDK licensing options.

// This app builds a route, simulates navigation on it, and displays the
// lane-guidance image (NavigationInstruction.getLaneImage) at the bottom of the
// screen. Where there is no lane image, the next-turn text is shown instead.

import React, {useCallback, useEffect, useRef, useState} from 'react';
import {
  View,
  Text,
  StyleSheet,
  StatusBar,
  Image,
  TouchableOpacity,
} from 'react-native';
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
} from '@magiclane/maps-sdk';
import {GLView} from '@magiclane/maps-sdk-react-native';

// A token from https://developer.magiclane.com removes the watermark and unlocks
// full functionality. The map renders without one.
const GEMKIT_TOKEN = '';

const DEPARTURE = {latitude: 48.15021176018896, longitude: 11.558610476998183};
const DESTINATION = {latitude: 48.13993582693814, longitude: 11.604079110086362};

function convertDistance(meters: number): string {
  return meters >= 1000 ? `${(meters / 1000).toFixed(1)} km` : `${Math.round(meters)} m`;
}

function convertDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return (h > 0 ? `${h} h ` : '') + `${m} min`;
}

function routeLabel(route: Route): string {
  const td = route.getTimeDistance();
  const dist = td.unrestrictedDistanceM + td.restrictedDistanceM;
  const time = td.unrestrictedTimeS + td.restrictedTimeS;
  return `${convertDistance(dist)}\n${convertDuration(time)}`;
}

// Convert an SDK image byte buffer (Uint8Array) into a data URI for <Image>.
function bytesToDataUri(data: Uint8Array | null | undefined): string | null {
  if (!data || data.byteLength === 0) {
    return null;
  }
  const bytes = new Uint8Array(data);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  const g: any = globalThis;
  let base64 = '';
  if (g.btoa) {
    base64 = g.btoa(binary);
  } else if (g.Buffer) {
    base64 = g.Buffer.from(bytes).toString('base64');
  } else {
    return null;
  }
  return `data:image/png;base64,${base64}`;
}

export default function LaneInstructionsDemo() {
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
  const [areRoutesBuilt, setAreRoutesBuilt] = useState(false);
  // True while a route is calculating: Build Route is disabled meanwhile, so a
  // second press cannot start a second calculation that adds its routes again.
  const [isCalculating, setIsCalculating] = useState(false);
  // The same flag for the press handler: a second tap can land before the
  // re-render that disables the button.
  const calculatingRef = useRef(false);
  const [isSimulationActive, setIsSimulationActive] = useState(false);
  const [instruction, setInstruction] = useState<NavigationInstruction | null>(null);
  const [laneUri, setLaneUri] = useState<string | null>(null);
  // A ref, not state: onError is created once per start and must see the
  // current handler when it fires.
  const navHandlerRef = useRef<any>(null);

  // Stop a running simulation when the screen goes away.
  useEffect(
    () => () => {
      if (navHandlerRef.current) {
        NavigationService.cancelNavigation(navHandlerRef.current);
        navHandlerRef.current = null;
      }
    },
    [],
  );

  const onBuildRoute = useCallback(() => {
    if (!gemMap) {
      setStatus('Map not ready yet');
      return;
    }
    const departure = Landmark.withLatLng(DEPARTURE);
    const destination = Landmark.withLatLng(DESTINATION);
    if (calculatingRef.current) {
      return;
    }
    calculatingRef.current = true;
    setStatus('The route is calculating…');
    setIsCalculating(true);
    RoutingService.calculateRoute(
      [departure, destination],
      new RoutePreferences({}),
      (err: GemError, routes: Route[]) => {
        calculatingRef.current = false;
        setIsCalculating(false);
        if (err === GemError.success && routes.length > 0) {
          const routesMap = gemMap.preferences.routes;
          routes.forEach((route, idx) =>
            routesMap.add(route, idx === 0, {label: routeLabel(route)}),
          );
          gemMap.centerOnRoutes({routes});
          setAreRoutesBuilt(true);
          setStatus('Route built - start simulation');
        } else {
          setStatus(`Route calculation failed (${err})`);
        }
      },
    );
  }, [gemMap]);

  // Ends the simulation and clears the route; the status says why, since the
  // route it reported is gone.
  const stopSimulation = useCallback((message = 'Simulation stopped.') => {
    if (navHandlerRef.current) {
      NavigationService.cancelNavigation(navHandlerRef.current);
      navHandlerRef.current = null;
    }
    gemMap?.preferences.routes.clear();
    setAreRoutesBuilt(false);
    setIsSimulationActive(false);
    setInstruction(null);
    setLaneUri(null);
    setStatus(message);
  }, [gemMap]);

  const startSimulation = useCallback(() => {
    if (!gemMap) {
      return;
    }
    const routes = gemMap.preferences.routes;
    routes.clearAllButMainRoute();
    if (!routes.mainRoute) {
      setStatus('No main route available');
      return;
    }
    const handler = NavigationService.startSimulation(routes.mainRoute, undefined, {
      onNavigationInstruction: (instr: NavigationInstruction) => {
        setIsSimulationActive(true);
        setInstruction(instr);
        setLaneUri(bytesToDataUri(instr.getLaneImage({size: {width: 100, height: 50}})));
      },
      onDestinationReached: () => {
        stopSimulation('Destination reached.');
      },
      onError: (error: GemError) => {
        // A cancel comes from stopSimulation, which has already updated the UI.
        if (error !== GemError.cancel) {
          stopSimulation(`The simulation stopped with an error (${error}).`);
        }
      },
    });
    navHandlerRef.current = handler;
    setIsSimulationActive(true);
    gemMap.startFollowingPosition();
  }, [gemMap, stopSimulation]);

  return (
    <View style={styles.root}>
      <StatusBar barStyle="dark-content" />
      <GLView
        style={StyleSheet.absoluteFill}
        apiToken={GEMKIT_TOKEN || undefined}
        onMapReady={event => {
          if (event.gemMap) {
            setGemMap(event.gemMap);
            setStatus('Map ready');
          }
        }}
      />
      <SafeAreaView style={styles.safeOverlay} pointerEvents="box-none">
        <View style={styles.card}>
          <Text style={styles.header}>Lane Instructions</Text>
          {!isSimulationActive && !areRoutesBuilt && (
            <TouchableOpacity
              style={[styles.btnPurple, (!mapDataReady || isCalculating) && styles.btnDisabled]}
              disabled={!mapDataReady || isCalculating}
              onPress={onBuildRoute}>
              <Text style={styles.btnText}>{isCalculating ? 'Calculating…' : 'Build Route'}</Text>
            </TouchableOpacity>
          )}
          {!isSimulationActive && areRoutesBuilt && (
            <TouchableOpacity style={styles.btnGreen} onPress={startSimulation}>
              <Text style={styles.btnText}>Start Simulation</Text>
            </TouchableOpacity>
          )}
          {isSimulationActive && (
            <TouchableOpacity style={styles.btnRed} onPress={() => stopSimulation()}>
              <Text style={styles.btnText}>Stop Simulation</Text>
            </TouchableOpacity>
          )}
          <Text style={styles.status}>{status}</Text>
        </View>
      </SafeAreaView>

      {isSimulationActive && instruction && (
        <SafeAreaView style={styles.bottomOverlay} pointerEvents="box-none">
          <View style={styles.lanePanel}>
            {laneUri ? (
              <Image source={{uri: laneUri}} style={styles.laneImage} resizeMode="contain" />
            ) : (
              <Text style={styles.laneFallback}>
                {instruction.nextTurnInstruction || 'Continue straight'}
              </Text>
            )}
          </View>
        </SafeAreaView>
      )}
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
  btnText: {color: '#fff', fontWeight: '600'},
  btnPurple: {backgroundColor: '#673ab7', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 8},
  btnGreen: {backgroundColor: '#4caf50', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 8},
  btnRed: {backgroundColor: '#f44336', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 8},
  lanePanel: {
    marginBottom: 24,
    backgroundColor: '#4B0082',
    borderRadius: 12,
    padding: 12,
    minWidth: 120,
    alignItems: 'center',
  },
  laneImage: {width: 100, height: 50},
  laneFallback: {color: '#fff', fontWeight: '600'},
  btnDisabled: {opacity: 0.5},
});
