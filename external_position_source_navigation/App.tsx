// SPDX-FileCopyrightText: 2025-2026 Magic Lane International B.V. <info@magiclane.com>
// SPDX-License-Identifier: Apache-2.0
//
// Contact Magic Lane at <info@magiclane.com> for SDK licensing options.

// This app feeds the engine synthetic GPS fixes through an external data source
// (DataSource.createExternalDataSource + SenseDataFactory.producePosition),
// then runs real navigation while pushing positions sampled along the route.

import React, {useCallback, useEffect, useRef, useState} from 'react';
import {
  View,
  Text,
  StyleSheet,
  StatusBar,
  TouchableOpacity,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {
  Coordinates,
  PositionService,
  DataSource,
  DataType,
  SenseDataFactory,
  Provider,
  PositionQuality,
  GemAnimation,
  AnimationType,
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

const DEPARTURE = {latitude: 34.915646, longitude: -110.147933};
const DESTINATION = {latitude: 34.933105, longitude: -110.131363};

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

function getHeading(from: Coordinates, to: Coordinates): number {
  const dx = to.longitude - from.longitude;
  const dy = to.latitude - from.latitude;
  const val = Math.atan2(dx, dy) * 57.2957795;
  return val < 0 ? val + 360 : val;
}

export default function ExternalPositionSourceNavigationDemo() {
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
  const [isNavigationActive, setIsNavigationActive] = useState(false);
  const [instruction, setInstruction] = useState<NavigationInstruction | null>(null);
  const dataSource = useRef<DataSource | null>(null);
  const navHandler = useRef<any>(null);
  const hasDataSource = useRef(false);
  // Mirrors hasDataSource for the UI: navigation needs the external feed that
  // Follow Position attaches, so Start Navigation waits for it.
  const [isFeeding, setIsFeeding] = useState(false);

  // When the screen goes away, end the position push loop, the feed and the
  // navigation it drives.
  useEffect(
    () => () => {
      if (hasDataSource.current) {
        hasDataSource.current = false;
        PositionService.instance.removeDataSource();
        dataSource.current?.stop();
      }
      if (navHandler.current) {
        NavigationService.cancelNavigation(navHandler.current);
        navHandler.current = null;
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
        if (err === GemError.routeTooLong) {
          setStatus('Destination is too far.');
          return;
        }
        if (err === GemError.success && routes.length > 0) {
          const routesMap = gemMap.preferences.routes;
          routes.forEach((route, idx) => routesMap.add(route, idx === 0, {label: routeLabel(route)}));
          gemMap.centerOnRoutes({routes});
          setAreRoutesBuilt(true);
          setStatus('Route built - start navigation');
        } else {
          setStatus(`Route calculation failed (${err})`);
        }
      },
    );
  }, [gemMap]);

  const cancelRoute = useCallback(() => {
    gemMap?.preferences.routes.clear();
    setAreRoutesBuilt(false);
  }, [gemMap]);

  // Ends the navigation and the feed and clears the route; the status says why,
  // since the route and the feed it reported are gone.
  const stopNavigation = useCallback((message = 'Navigation stopped.') => {
    if (navHandler.current) {
      NavigationService.cancelNavigation(navHandler.current);
      navHandler.current = null;
    }
    // Leave the camera where it is: following a position whose source is about
    // to be removed leaves the map blank.
    gemMap?.stopFollowingPosition();
    PositionService.instance.removeDataSource();
    dataSource.current?.stop();
    cancelRoute();
    setIsNavigationActive(false);
    setInstruction(null);
    hasDataSource.current = false;
    setIsFeeding(false);
    setStatus(message);
  }, [gemMap, cancelRoute]);

  const pushExternalPosition = useCallback(async () => {
    const route = gemMap?.preferences.routes.mainRoute;
    if (!route || !dataSource.current) {
      return;
    }
    const distance = route.getTimeDistance().totalDistanceM;
    let prev = route.getCoordinateOnRoute(0);
    // One position per metre; the distance is rarely a whole number, so the loop
    // ends below it and the navigation is stopped after the last position.
    for (let current = 1; current < distance; current += 1) {
      if (!hasDataSource.current) {
        return;
      }
      const coord = route.getCoordinateOnRoute(current);
      await new Promise<void>(res => setTimeout(() => res(), 25));
      // Navigation may have stopped (or the screen unmounted) meanwhile.
      if (!hasDataSource.current || !dataSource.current) {
        return;
      }
      dataSource.current.pushData(
        SenseDataFactory.producePosition({
          acquisitionTime: new Date(),
          satelliteTime: new Date(),
          latitude: coord.latitude,
          longitude: coord.longitude,
          altitude: 0,
          course: getHeading(prev, coord),
          speed: 0,
          provider: Provider.gps,
          fixQuality: PositionQuality.high,
        }),
      );
      prev = coord;
    }
    // The feed reached the end of the route (onDestinationReached may already
    // have stopped the navigation, which clears hasDataSource).
    if (hasDataSource.current) {
      stopNavigation('Destination reached.');
    }
  }, [gemMap, stopNavigation]);

  const startNavigation = useCallback(async () => {
    if (!gemMap) {
      return;
    }
    const routes = gemMap.preferences.routes;
    if (!routes.mainRoute) {
      setStatus('Route is not available');
      return;
    }
    navHandler.current = NavigationService.startNavigation(routes.mainRoute, undefined, {
      onNavigationInstruction: (instr: NavigationInstruction) => {
        setIsNavigationActive(true);
        setInstruction(instr);
      },
      onError: (error: GemError) => {
        // A cancel comes from stopNavigation, which has already updated the UI.
        if (error !== GemError.cancel) {
          stopNavigation(`The navigation stopped with an error (${error}).`);
        }
      },
      onDestinationReached: () => {
        stopNavigation('Destination reached.');
      },
    });
    // Show Stop Navigation right away: until the first instruction arrives,
    // Start Navigation would otherwise start a second navigation, whose start
    // cancels the first one and clears the route under it.
    setIsNavigationActive(true);
    gemMap.startFollowingPosition();
    await pushExternalPosition();
  }, [gemMap, stopNavigation, pushExternalPosition]);

  const onFollowPosition = useCallback(() => {
    if (!gemMap || !dataSource.current) {
      return;
    }
    if (!hasDataSource.current) {
      PositionService.instance.setExternalDataSource(dataSource.current);
      dataSource.current.start();
      dataSource.current.pushData(
        SenseDataFactory.producePosition({
          acquisitionTime: new Date(),
          satelliteTime: new Date(),
          // The route's departure, so the camera does not fly elsewhere first.
          latitude: DEPARTURE.latitude,
          longitude: DEPARTURE.longitude,
          altitude: 0,
          course: 0,
          speed: 0,
          provider: Provider.gps,
          fixQuality: PositionQuality.high,
        }),
      );
      hasDataSource.current = true;
      setIsFeeding(true);
      setStatus('Simulating GPS position…');
    }
    const animation = new GemAnimation({type: AnimationType.linear});
    gemMap.startFollowingPosition({animation});
  }, [gemMap]);

  const nextTurnDistance = (instr: NavigationInstruction): string => {
    const td = instr.timeDistanceToNextTurn;
    return td ? convertDistance(td.unrestrictedDistanceM + td.restrictedDistanceM) : '';
  };
  const remainingDuration = (instr: NavigationInstruction): string => {
    const td = instr.remainingTravelTimeDistance;
    return td ? convertDuration(td.unrestrictedTimeS + td.restrictedTimeS) : '--';
  };
  const remainingDistance = (instr: NavigationInstruction): string => {
    const td = instr.remainingTravelTimeDistance;
    return td ? convertDistance(td.unrestrictedDistanceM + td.restrictedDistanceM) : '--';
  };
  const eta = (instr: NavigationInstruction): string => {
    const td = instr.remainingTravelTimeDistance;
    if (!td) {
      return '--';
    }
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
            dataSource.current = DataSource.createExternalDataSource([DataType.position]);
            setStatus('Map ready');
          }
        }}
      />
      <SafeAreaView style={styles.safeOverlay} pointerEvents="box-none">
        <View style={styles.card}>
          <Text style={styles.header}>External Position Source</Text>
          {!areRoutesBuilt && (
            <TouchableOpacity
              style={[styles.btnPurple, (!mapDataReady || isCalculating) && styles.btnDisabled]}
              disabled={!mapDataReady || isCalculating}
              onPress={onBuildRoute}>
              <Text style={styles.btnText}>{isCalculating ? 'Calculating…' : 'Build Route'}</Text>
            </TouchableOpacity>
          )}
          {areRoutesBuilt && !isNavigationActive && (
            <TouchableOpacity
              style={[styles.btnGreen, !isFeeding && styles.btnDisabled]}
              onPress={startNavigation}
              disabled={!isFeeding}>
              <Text style={styles.btnText}>Start Navigation</Text>
            </TouchableOpacity>
          )}
          {areRoutesBuilt && !isNavigationActive && !isFeeding && (
            <Text style={styles.status}>
              Tap Follow Position first to start the position feed.
            </Text>
          )}
          {isNavigationActive && (
            <TouchableOpacity style={styles.btnRed} onPress={() => stopNavigation()}>
              <Text style={styles.btnText}>Stop Navigation</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity style={styles.btnLight} onPress={onFollowPosition}>
            <Text style={styles.btnLightText}>Follow Position</Text>
          </TouchableOpacity>
          <Text style={styles.status}>{status}</Text>
        </View>

        {isNavigationActive && instruction && (
          <View style={styles.instructionPanel}>
            <Text style={styles.instructionDistance}>{nextTurnDistance(instruction)}</Text>
            <Text style={styles.instructionStreet}>
              {instruction.nextStreetName || 'Continue'}
            </Text>
          </View>
        )}
      </SafeAreaView>

      {isNavigationActive && instruction && (
        <SafeAreaView style={styles.bottomOverlay} pointerEvents="box-none">
          <View style={styles.bottomPanel}>
            <View style={styles.stat}>
              <Text style={styles.statValue}>{remainingDuration(instruction)}</Text>
              <Text style={styles.statLabel}>Time</Text>
            </View>
            <View style={styles.stat}>
              <Text style={styles.statValue}>{eta(instruction)}</Text>
              <Text style={styles.statLabel}>ETA</Text>
            </View>
            <View style={styles.stat}>
              <Text style={styles.statValue}>{remainingDistance(instruction)}</Text>
              <Text style={styles.statLabel}>Dist</Text>
            </View>
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
    gap: 8,
  },
  header: {fontSize: 18, fontWeight: '700', marginBottom: 4, color: '#333'},
  status: {marginTop: 6, color: '#333', textAlign: 'center'},
  btnText: {color: '#fff', fontWeight: '600'},
  btnLightText: {color: '#333', fontWeight: '600'},
  btnPurple: {backgroundColor: '#673ab7', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 8},
  btnGreen: {backgroundColor: '#4caf50', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 8},
  btnDisabled: {opacity: 0.5},
  btnRed: {backgroundColor: '#f44336', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 8},
  btnLight: {backgroundColor: '#fff', borderWidth: 1, borderColor: '#ddd', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 8},
  instructionPanel: {
    marginHorizontal: 12,
    marginTop: 4,
    backgroundColor: 'rgba(34,34,34,0.95)',
    borderRadius: 20,
    padding: 20,
  },
  instructionDistance: {fontSize: 28, fontWeight: '700', color: '#fff', marginBottom: 4},
  instructionStreet: {fontSize: 16, fontWeight: '500', color: '#eee'},
  bottomPanel: {
    marginBottom: 24,
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(255,255,255,0.95)',
    borderRadius: 50,
    paddingHorizontal: 30,
    paddingVertical: 12,
    width: '90%',
  },
  stat: {alignItems: 'center'},
  statValue: {fontSize: 18, fontWeight: '700', color: '#333'},
  statLabel: {fontSize: 11, color: '#666', textTransform: 'uppercase', fontWeight: '600'},
});
