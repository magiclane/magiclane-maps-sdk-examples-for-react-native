// SPDX-FileCopyrightText: 2025-2026 Magic Lane International B.V. <info@magiclane.com>
// SPDX-License-Identifier: Apache-2.0
//
// Contact Magic Lane at <info@magiclane.com> for SDK licensing options.

// This app builds a route, searches for landmarks along the main route with
// SearchService.searchAlongRoute, lists them (tap to highlight/center), and can
// simulate navigation along the route.

import React, {useEffect, useRef, useState} from 'react';
import {
  View,
  Text,
  StyleSheet,
  StatusBar,
  TouchableOpacity,
  FlatList,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {
  Coordinates,
  Landmark,
  RoutePreferences,
  RoutingService,
  SdkSettings,
  GemError,
  Route,
  NavigationService,
  SearchService,
  HighlightRenderSettings,
  HighlightOptions,
  TaskHandler,
  GemIcon,
  AddressField,
} from '@magiclane/maps-sdk';
import {GLView} from '@magiclane/maps-sdk-react-native';

// Optional: a token from https://developer.magiclane.com removes the watermark
// and unlocks full functionality. The map renders without one.
const GEMKIT_TOKEN = '';

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
  const [simulating, setSimulating] = useState(false);
  const [results, setResults] = useState<Landmark[]>([]);
  const routingHandler = useRef<TaskHandler | null>(null);
  const navigationHandler = useRef<TaskHandler | null>(null);

  // Stop a running calculation or simulation when the screen goes away.
  useEffect(() => {
    return () => {
      if (routingHandler.current) {
        RoutingService.cancelRoute(routingHandler.current);
        routingHandler.current = null;
      }
      if (navigationHandler.current) {
        NavigationService.cancelNavigation(navigationHandler.current);
        navigationHandler.current = null;
      }
    };
  }, []);

  const onBuildRoute = () => {
    if (!gemMap) {
      return;
    }
    const departure = Landmark.withCoordinates(
      Coordinates.fromLatLong(37.77903, -122.41991),
    );
    const destination = Landmark.withCoordinates(
      Coordinates.fromLatLong(37.33619, -121.89058),
    );
    const prefs = new RoutePreferences({});

    setCalculating(true);
    setStatus('Calculating route…');
    routingHandler.current = RoutingService.calculateRoute(
      [departure, destination],
      prefs,
      (err: GemError, calculated: Route[]) => {
        if (err === GemError.cancel) {
          return; // Cancelled by the user; onCancelRoute already updated the UI.
        }
        routingHandler.current = null;
        setCalculating(false);
        if (err === GemError.success && calculated.length > 0) {
          const routesMap = gemMap.preferences.routes;
          calculated.forEach((route, i) =>
            routesMap.add(route, i === 0, {label: getRouteLabel(route)}),
          );
          gemMap.centerOnRoutes({routes: calculated});
          setRoutesBuilt(true);
          setStatus('Route calculated successfully!');
        } else {
          setStatus('Route calculation failed.');
        }
      },
    );
  };

  const onCancelRoute = () => {
    if (routingHandler.current) {
      RoutingService.cancelRoute(routingHandler.current);
      routingHandler.current = null;
      setCalculating(false);
      setStatus('Route calculation cancelled.');
    }
  };

  const onClearRoutes = () => {
    gemMap?.preferences.routes.clear();
    gemMap?.deactivateHighlight();
    setResults([]);
    setRoutesBuilt(false);
    setSimulating(false);
  };

  const searchAlongRoute = () => {
    if (!routesBuilt || !gemMap) {
      return;
    }
    const routesMap = gemMap.preferences.routes;
    if (!routesMap.mainRoute) {
      setStatus('No main route available');
      return;
    }
    setStatus('Searching along route…');
    SearchService.searchAlongRoute({
      route: routesMap.mainRoute,
      onCompleteCallback: (err: GemError, found: Landmark[]) => {
        if (err !== GemError.success && err !== GemError.reducedResult) {
          setStatus('No results found.');
          return;
        }
        setResults(found);
        setStatus(`${found.length} results found.`);
      },
    });
  };

  const selectResult = (landmark: Landmark) => {
    if (!gemMap) {
      return;
    }
    gemMap.centerOnCoordinates(landmark.coordinates);
    gemMap.deactivateHighlight();
    const renderSettings = new HighlightRenderSettings({
      options: new Set([HighlightOptions.showLandmark, HighlightOptions.noFading]),
    });
    try {
      landmark.setImageFromIcon(GemIcon.searchResultsPin);
    } catch {}
    gemMap.activateHighlight([landmark], {renderSettings});
  };

  const startSimulation = async () => {
    if (simulating || !routesBuilt || !gemMap) {
      return;
    }
    try {
      await gemMap.preferences.routes.clearAllButMainRoute();
    } catch (e) {
      console.error('clearAllButMainRoute failed:', e);
    }
    if (navigationHandler.current) {
      return; // Started by an earlier tap while we were waiting.
    }
    const routesMap = gemMap.preferences.routes;
    if (!routesMap.mainRoute) {
      setStatus('No main route available');
      return;
    }
    const handler = NavigationService.startSimulation(
      routesMap.mainRoute,
      undefined,
      {
        onNavigationInstruction: () => {
          setSimulating(true);
        },
        onError: (error: GemError) => {
          setSimulating(false);
          onClearRoutes();
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
    navigationHandler.current = handler;
    gemMap.startFollowingPosition?.();
    setSimulating(true);
    setStatus('Simulation started.');
  };

  const stopSimulation = () => {
    if (navigationHandler.current) {
      NavigationService.cancelNavigation(navigationHandler.current);
      navigationHandler.current = null;
    }
    onClearRoutes();
    setSimulating(false);
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
          <Text style={styles.header}>Search Along Route</Text>

          {calculating ? (
            <TouchableOpacity style={styles.btnRed} onPress={onCancelRoute}>
              <Text style={styles.btnText}>Cancel</Text>
            </TouchableOpacity>
          ) : simulating ? (
            <TouchableOpacity style={styles.btnRed} onPress={stopSimulation}>
              <Text style={styles.btnText}>Stop</Text>
            </TouchableOpacity>
          ) : routesBuilt ? (
            <View style={styles.btnRow}>
              <TouchableOpacity style={styles.btnInfo} onPress={searchAlongRoute}>
                <Text style={styles.btnText}>Search</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.btnGreen} onPress={startSimulation}>
                <Text style={styles.btnText}>Simulate</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.btnWarn} onPress={onClearRoutes}>
                <Text style={styles.btnText}>Clear</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity
              style={[styles.btnPurple, !mapDataReady && styles.btnDisabled]}
              onPress={onBuildRoute}
              disabled={!mapDataReady}>
              <Text style={styles.btnText}>Build Route</Text>
            </TouchableOpacity>
          )}

          <Text style={styles.status}>{status}</Text>

          {results.length > 0 ? (
            <FlatList
              style={styles.list}
              data={results}
              keyExtractor={(_, i) => String(i)}
              renderItem={({item}) => (
                <TouchableOpacity
                  style={styles.resultItem}
                  onPress={() => selectResult(item)}>
                  <Text style={styles.resultName} numberOfLines={1}>
                    {item.name || 'Unknown Place'}
                  </Text>
                  <Text style={styles.resultAddr} numberOfLines={1}>
                    {item.address?.getField(AddressField.streetName) ||
                      'No Address'}
                  </Text>
                </TouchableOpacity>
              )}
            />
          ) : null}
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {flex: 1, backgroundColor: '#000'},
  safeOverlay: {position: 'absolute', top: 0, left: 0, right: 0, bottom: 0},
  card: {
    margin: 12,
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    elevation: 5,
    maxHeight: '80%',
  },
  header: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 12,
    color: '#333',
    textAlign: 'center',
  },
  btnRow: {flexDirection: 'row', justifyContent: 'center', gap: 8},
  list: {marginTop: 12},
  resultItem: {
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#eee',
  },
  resultName: {fontSize: 14, fontWeight: '600', color: '#333'},
  resultAddr: {fontSize: 12, color: '#666', marginTop: 2},
  status: {marginTop: 10, color: '#333', textAlign: 'center'},
  btnText: {color: '#fff', fontWeight: '600', textAlign: 'center'},
  btnPurple: {
    backgroundColor: '#673ab7',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
  },
  btnInfo: {
    backgroundColor: '#2196f3',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
  },
  btnGreen: {
    backgroundColor: '#4caf50',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
  },
  btnWarn: {
    backgroundColor: '#ff9800',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
  },
  btnRed: {
    backgroundColor: '#f44336',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
  },
  btnDisabled: {opacity: 0.5},
});
