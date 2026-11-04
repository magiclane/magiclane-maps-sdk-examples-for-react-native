// SPDX-FileCopyrightText: 2025-2026 Magic Lane International B.V. <info@magiclane.com>
// SPDX-License-Identifier: Apache-2.0
//
// Contact Magic Lane at <info@magiclane.com> for SDK licensing options.

// This app runs the routing + navigation engine HEADLESS (no map view):
// calculate a Düsseldorf -> Cologne route, simulate navigation along it, and
// render the live instruction as text only.
//
// Because there is no map, the app awaits MagicLaneReactNativeSDK.init() itself
// instead of letting <GLView> do it.

import React, {useEffect, useRef, useState} from 'react';
import {
  View,
  Text,
  StyleSheet,
  StatusBar,
  TouchableOpacity,
  ScrollView,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {
  SdkSettings,
  Landmark,
  RoutePreferences,
  RoutingService,
  GemError,
  Route,
  NavigationService,
  NavigationInstruction,
  TaskHandler,
} from '@magiclane/maps-sdk';
import {MagicLaneReactNativeSDK} from '@magiclane/maps-sdk-react-native';

// Optional: a token from https://developer.magiclane.com removes the watermark
// and unlocks full functionality.
const GEMKIT_TOKEN = '';

// Düsseldorf -> Cologne.
const DEPARTURE = {latitude: 51.20830988558932, longitude: 6.6794155000229045};
const DESTINATION = {latitude: 50.93416933110433, longitude: 6.94370301382495};

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

export default function App() {
  const [ready, setReady] = useState(false);
  // Routing needs current map data, which the SDK updates right after
  // start-up. Set once the SDK is initialized and that data is ready.
  const [mapDataReady, setMapDataReady] = useState(false);
  useEffect(() => {
    if (!ready) {
      return;
    }
    let active = true;
    SdkSettings.whenMapDataReady().then(dataReady => {
      if (active && dataReady) {
        setMapDataReady(true);
      }
    });
    return () => {
      active = false;
    };
  }, [ready]);
  const [status, setStatus] = useState('Initializing…');
  const [routesBuilt, setRoutesBuilt] = useState(false);
  const [simActive, setSimActive] = useState(false);
  const [instruction, setInstruction] = useState<NavigationInstruction | null>(
    null,
  );
  const route = useRef<Route | null>(null);
  const routingHandler = useRef<TaskHandler | null>(null);
  const navHandler = useRef<TaskHandler | null>(null);

  // Headless SDK init (no map view hosts it for us): wait for the engine before
  // enabling the UI.
  useEffect(() => {
    let mounted = true;
    MagicLaneReactNativeSDK.init({authorization: GEMKIT_TOKEN || undefined})
      .then(() => {
        if (!mounted) {
          return;
        }
        SdkSettings.setAllowInternetConnection(true);
        setReady(true);
        setStatus('SDK initialized. Build a route to begin.');
      })
      .catch((e: any) => {
        if (mounted) {
          setStatus(`Init failed: ${String(e?.message || e)}`);
        }
      });
    return () => {
      mounted = false;
      // Stop any running calculation or simulation when the screen goes away.
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
    if (routingHandler.current) {
      return; // A calculation is already running.
    }
    const departure = Landmark.withLatLng(DEPARTURE);
    const destination = Landmark.withLatLng(DESTINATION);
    const prefs = new RoutePreferences({});
    setStatus('The route is calculating.');
    routingHandler.current = RoutingService.calculateRoute(
      [departure, destination],
      prefs,
      (err: GemError, routes: Route[]) => {
        routingHandler.current = null;
        if (err === GemError.success && routes.length > 0) {
          route.current = routes[0];
          setRoutesBuilt(true);
          setStatus('Successfully calculated the route.');
        } else {
          setStatus('Route calculation failed.');
        }
      },
    );
  };

  const startSimulation = () => {
    if (!route.current) {
      return;
    }
    const handler = NavigationService.startSimulation(
      route.current,
      undefined,
      {
        onNavigationInstruction: (instr: NavigationInstruction) => {
          setSimActive(true);
          setInstruction(instr);
        },
        // Without this the UI would stay in its simulating state at the end of
        // the route.
        onDestinationReached: () => {
          stopSimulation();
          setStatus('Destination reached.');
        },
        onError: (error: GemError) => {
          setSimActive(false);
          if (error !== GemError.cancel) {
            stopSimulation();
          }
        },
      },
    );
    // On failure startSimulation has already called onError and returns null.
    if (!handler) {
      setStatus('Could not start the simulation.');
      return;
    }
    navHandler.current = handler;
    setSimActive(true);
    setStatus('Simulation running…');
  };

  const stopSimulation = () => {
    if (navHandler.current) {
      NavigationService.cancelNavigation(navHandler.current);
      navHandler.current = null;
    }
    route.current = null;
    setSimActive(false);
    setInstruction(null);
    setRoutesBuilt(false);
    setStatus('Simulation stopped.');
  };

  return (
    <SafeAreaView style={styles.root}>
      <StatusBar barStyle="dark-content" />
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>Simulate Navigation Without Map</Text>
        <Text style={styles.status}>{status}</Text>

        {!simActive && !routesBuilt ? (
          <TouchableOpacity
            style={[styles.btnPurple, !mapDataReady && styles.btnDisabled]}
            disabled={!mapDataReady}
            onPress={onBuildRoute}>
            <Text style={styles.btnText}>Build Route</Text>
          </TouchableOpacity>
        ) : null}

        {!simActive && routesBuilt ? (
          <TouchableOpacity style={styles.btnGreen} onPress={startSimulation}>
            <Text style={styles.btnText}>Start Simulation</Text>
          </TouchableOpacity>
        ) : null}

        {simActive ? (
          <TouchableOpacity style={styles.btnRed} onPress={stopSimulation}>
            <Text style={styles.btnText}>Stop Simulation</Text>
          </TouchableOpacity>
        ) : null}

        {simActive && instruction ? (
          <View style={styles.panel}>
            <Text style={styles.turnDist}>{distanceToNextTurn(instruction)}</Text>
            <Text style={styles.street}>
              {instruction.nextStreetName || 'Follow route'}
            </Text>
            <View style={styles.metrics}>
              <Text style={styles.metricGreen}>
                {remainingDuration(instruction)}
              </Text>
              <Text style={styles.metric}>{eta(instruction)}</Text>
              <Text style={styles.metric}>{remainingDistance(instruction)}</Text>
            </View>
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {flex: 1, backgroundColor: '#fff'},
  content: {padding: 24, gap: 16},
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: '#fff',
    backgroundColor: '#673ab7',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 8,
  },
  status: {color: '#333', fontSize: 15},
  panel: {
    backgroundColor: '#212121',
    borderRadius: 16,
    padding: 20,
    gap: 8,
  },
  turnDist: {fontSize: 28, fontWeight: '700', color: '#fff'},
  street: {fontSize: 18, color: '#ddd'},
  metrics: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 12,
    backgroundColor: '#fff',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  metric: {fontSize: 16, fontWeight: '700', color: '#222'},
  metricGreen: {fontSize: 16, fontWeight: '700', color: '#4caf50'},
  btnText: {color: '#fff', fontWeight: '600', textAlign: 'center'},
  btnPurple: {backgroundColor: '#673ab7', paddingVertical: 12, borderRadius: 8},
  btnRed: {backgroundColor: '#f44336', paddingVertical: 12, borderRadius: 8},
  btnGreen: {backgroundColor: '#4caf50', paddingVertical: 12, borderRadius: 8},
  btnDisabled: {opacity: 0.5},
});
