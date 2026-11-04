// SPDX-FileCopyrightText: 2025-2026 Magic Lane International B.V. <info@magiclane.com>
// SPDX-License-Identifier: Apache-2.0
//
// Contact Magic Lane at <info@magiclane.com> for SDK licensing options.

// This app builds a route, simulates navigation, and listens for the
// `onBetterRouteDetected` navigation callback - when the engine finds a faster
// alternative it pops a modal with the travel time, delay and time saved.

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
  SdkSettings,
  GemError,
  Route,
  NavigationService,
  NavigationInstruction,
} from '@magiclane/maps-sdk';
import {GLView} from '@magiclane/maps-sdk-react-native';

// A token from https://developer.magiclane.com removes the watermark and unlocks
// full functionality. The map renders without one.
const GEMKIT_TOKEN = '';

const DEPARTURE = {latitude: 48.79743778098061, longitude: 2.4029037044571875};
const DESTINATION = {latitude: 48.904767018940184, longitude: 2.3223936076132086};

function convertDistance(meters: number): string {
  return meters >= 1000 ? `${(meters / 1000).toFixed(1)} km` : `${Math.round(meters)} m`;
}

function convertDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return (h > 0 ? `${h} h ` : '') + `${m} min`;
}

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function routeLabel(route: Route): string {
  const td = route.getTimeDistance();
  const dist = td.unrestrictedDistanceM + td.restrictedDistanceM;
  const time = td.unrestrictedTimeS + td.restrictedTimeS;
  return `${convertDistance(dist)}\n${convertDuration(time)}`;
}

type BetterRoute = {travelTime: number; delay: number; timeGain: number};

export default function BetterRouteNotificationDemo() {
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
  const [betterRoute, setBetterRoute] = useState<BetterRoute | null>(null);
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
          setStatus('Route built successfully!');
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
    setBetterRoute(null);
    setStatus(message);
  }, [gemMap]);

  const startSimulation = useCallback(() => {
    if (!gemMap) {
      return;
    }
    const routes = gemMap.preferences.routes;
    // Follow the first alternative when available (matches the web demo).
    // at() throws a RangeError for an index past the end, so check the length.
    const routeAt1 = routes.length > 1 ? routes.at(1) : null;
    if (routeAt1) {
      routes.mainRoute = routeAt1;
    }
    if (!routes.mainRoute) {
      setStatus('No main route available');
      return;
    }
    const handler = NavigationService.startSimulation(routes.mainRoute, undefined, {
      onNavigationInstruction: (instr: NavigationInstruction) => {
        setIsSimulationActive(true);
        setInstruction(instr);
      },
      onBetterRouteDetected: (
        _route: Route,
        travelTime: number,
        delay: number,
        timeGain: number,
      ) => {
        setBetterRoute({travelTime, delay, timeGain});
      },
      onBetterRouteInvalidated: () => {
        setBetterRoute(null);
      },
      onBetterRouteRejected: (reason: GemError) => {
        console.log('Better route check failed:', reason);
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
    routes.clearAllButMainRoute();
    gemMap.startFollowingPosition();
  }, [gemMap, stopSimulation]);

  const recenter = useCallback(() => {
    gemMap?.startFollowingPosition?.();
  }, [gemMap]);

  const nextTurnDistance = (instr: NavigationInstruction): string => {
    const td = instr.timeDistanceToNextTurn;
    return convertDistance(td.unrestrictedDistanceM + td.restrictedDistanceM);
  };
  const remainingDistance = (instr: NavigationInstruction): string => {
    const td = instr.remainingTravelTimeDistance;
    return convertDistance(td.unrestrictedDistanceM + td.restrictedDistanceM);
  };
  const remainingDuration = (instr: NavigationInstruction): string => {
    const td = instr.remainingTravelTimeDistance;
    return convertDuration(td.unrestrictedTimeS + td.restrictedTimeS);
  };
  const eta = (instr: NavigationInstruction): string => {
    const td = instr.remainingTravelTimeDistance;
    const secs = td.unrestrictedTimeS + td.restrictedTimeS;
    return new Date(Date.now() + secs * 1000).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
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
            setGemMap(event.gemMap);
            setStatus('Map ready');
          }
        }}
      />
      <SafeAreaView style={styles.safeOverlay} pointerEvents="box-none">
        <View style={styles.card}>
          <Text style={styles.header}>Better Route Notification</Text>
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

        {isSimulationActive && instruction && (
          <View style={styles.instructionPanel}>
            <Text style={styles.instructionText}>
              {instruction.nextTurnInstruction || 'Continue straight'}
            </Text>
            <Text style={styles.instructionDistance}>{nextTurnDistance(instruction)}</Text>
            <TouchableOpacity style={styles.recenter} onPress={recenter}>
              <Text style={styles.recenterText}>Recenter</Text>
            </TouchableOpacity>
          </View>
        )}
      </SafeAreaView>

      {isSimulationActive && instruction && (
        <SafeAreaView style={styles.bottomOverlay} pointerEvents="box-none">
          <View style={styles.bottomPanel}>
            <View style={styles.stat}>
              <Text style={styles.statValue}>{remainingDistance(instruction)}</Text>
              <Text style={styles.statLabel}>Distance</Text>
            </View>
            <View style={styles.stat}>
              <Text style={styles.statValue}>{eta(instruction)}</Text>
              <Text style={styles.statLabel}>ETA</Text>
            </View>
            <View style={styles.stat}>
              <Text style={styles.statValue}>{remainingDuration(instruction)}</Text>
              <Text style={styles.statLabel}>Duration</Text>
            </View>
          </View>
        </SafeAreaView>
      )}

      <Modal
        visible={betterRoute !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setBetterRoute(null)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalPanel}>
            <Text style={styles.modalTitle}>Better Route Found!</Text>
            {betterRoute && (
              <>
                <Text style={styles.modalLine}>
                  Travel Time: {formatDuration(betterRoute.travelTime)}
                </Text>
                <Text style={styles.modalLine}>Delay: {formatDuration(betterRoute.delay)}</Text>
                <Text style={styles.modalGain}>
                  Time Saved: {formatDuration(betterRoute.timeGain)}
                </Text>
              </>
            )}
            <TouchableOpacity style={styles.dismissBtn} onPress={() => setBetterRoute(null)}>
              <Text style={styles.btnText}>Dismiss</Text>
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
  instructionPanel: {
    marginHorizontal: 12,
    backgroundColor: 'rgba(255,255,255,0.95)',
    borderRadius: 16,
    padding: 16,
  },
  instructionText: {fontWeight: '700', fontSize: 16, color: '#333'},
  instructionDistance: {color: '#666', fontWeight: '500', marginTop: 4},
  recenter: {alignSelf: 'flex-start', marginTop: 10, backgroundColor: '#fff', borderRadius: 50, paddingHorizontal: 16, paddingVertical: 8, elevation: 2},
  recenterText: {fontWeight: '600', color: '#333'},
  bottomPanel: {
    marginBottom: 24,
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(255,255,255,0.95)',
    borderRadius: 24,
    paddingHorizontal: 24,
    paddingVertical: 16,
    width: '90%',
  },
  stat: {alignItems: 'center'},
  statValue: {fontSize: 18, fontWeight: '700', color: '#333'},
  statLabel: {fontSize: 11, color: '#888', textTransform: 'uppercase', marginTop: 2},
  modalBackdrop: {flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center'},
  modalPanel: {backgroundColor: '#fff', borderRadius: 20, padding: 30, width: '85%', alignItems: 'center'},
  modalTitle: {fontSize: 20, fontWeight: '700', color: '#333', marginBottom: 16},
  modalLine: {color: '#666', fontSize: 15, marginBottom: 6},
  modalGain: {color: '#4CAF50', fontWeight: '700', marginTop: 8, marginBottom: 16},
  dismissBtn: {backgroundColor: '#673ab7', borderRadius: 50, paddingHorizontal: 40, paddingVertical: 12, marginTop: 8},
  btnDisabled: {opacity: 0.5},
});
