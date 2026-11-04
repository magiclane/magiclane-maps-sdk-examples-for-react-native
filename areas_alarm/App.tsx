// SPDX-FileCopyrightText: 2025-2026 Magic Lane International B.V. <info@magiclane.com>
// SPDX-License-Identifier: Apache-2.0
//
// Contact Magic Lane at <info@magiclane.com> for SDK licensing options.

// A circular area is drawn on the map; a route is calculated through it; during
// a simulated navigation the AlarmService reports when the vehicle enters and
// exits the area.
//
// The SDK logic (AlarmService / AlarmListener + CircleGeographicArea +
// NavigationService.startSimulation) is identical to the web demo; only the host
// and chrome differ: the web demo appends a DOM view and HTML buttons, while
// here the map is the <GLView> component and the controls are a React Native
// overlay.

import React, {useEffect, useRef, useState} from 'react';
import {View, Text, StyleSheet, StatusBar, TouchableOpacity} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {
  Coordinates,
  Landmark,
  RoutePreferences,
  RoutingService,
  SdkSettings,
  NavigationService,
  GemError,
  Marker,
  MarkerCollection,
  MarkerType,
  MarkerCollectionRenderSettings,
  AlarmService,
  AlarmListener,
  CircleGeographicArea,
  TaskHandler,
  Route,
  Color,
} from '@magiclane/maps-sdk';
import {GLView} from '@magiclane/maps-sdk-react-native';

// Optional: a token from https://developer.magiclane.com removes the watermark
// and unlocks full functionality. The map renders without one.
const GEMKIT_TOKEN = '';

const AREA_CENTER = {latitude: 50.92396, longitude: 9.54976};
const AREA_RADIUS_M = 200;

// Generate coordinates describing a circle (used to draw the monitored area).
function generateCircleCoordinates(
  center: Coordinates,
  radiusMeters: number,
  numberOfPoints = 36,
): Coordinates[] {
  const earthRadius = 6371000; // meters
  const centerLatRad = (center.latitude * Math.PI) / 180;
  const centerLonRad = (center.longitude * Math.PI) / 180;

  const coordinates: Coordinates[] = [];
  for (let i = 0; i < numberOfPoints; i++) {
    const angle = (2 * Math.PI * i) / numberOfPoints;
    const deltaLat = (radiusMeters / earthRadius) * Math.cos(angle);
    const deltaLon = (radiusMeters / (earthRadius * Math.cos(centerLatRad))) * Math.sin(angle);
    const pointLat = ((centerLatRad + deltaLat) * 180) / Math.PI;
    const pointLon = ((centerLonRad + deltaLon) * 180) / Math.PI;
    coordinates.push(new Coordinates({latitude: pointLat, longitude: pointLon}));
  }
  return coordinates;
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
  // True while a route is calculating: Build Route is disabled meanwhile, so a
  // second press cannot start a second calculation that adds its routes again.
  const [isCalculating, setIsCalculating] = useState(false);
  // The same flag for the press handler: a second tap can land before the
  // re-render that disables the button.
  const calculatingRef = useRef(false);
  const [isSimulationActive, setIsSimulationActive] = useState(false);
  const [areaNotification, setAreaNotification] = useState<string | null>(null);

  const routingHandler = useRef<TaskHandler | null>(null);
  const navigationHandler = useRef<TaskHandler | null>(null);
  const alarmService = useRef<AlarmService | null>(null);
  const alarmListener = useRef<AlarmListener | null>(null);

  // Stop the simulation and release the alarm service when the screen goes away.
  useEffect(
    () => () => {
      if (navigationHandler.current) {
        NavigationService.cancelNavigation(navigationHandler.current);
        navigationHandler.current = null;
      }
      alarmService.current?.dispose();
      alarmService.current = null;
    },
    [],
  );

  const showMessage = (message: string) => setStatus(message);

  const onMapReady = (map: any) => {
    setGemMap(map);
    setStatus('Map Ready');

    // Draw the monitored area on the map.
    const marker = new Marker();
    const circleAreaCoords = generateCircleCoordinates(
      new Coordinates(AREA_CENTER),
      AREA_RADIUS_M,
    );
    circleAreaCoords.forEach(coord => marker.add(coord));

    const markerCollection = MarkerCollection.create(MarkerType.Polygon, 'Circle');
    markerCollection.add(marker);

    map.preferences.markers.add(markerCollection, {
      settings: new MarkerCollectionRenderSettings({
        polygonFillColor: new Color(210, 104, 102, 111),
      }),
    });
  };

  const onBuildRouteButtonPressed = () => {
    if (calculatingRef.current) {
      return;
    }
    const departureLandmark = Landmark.withLatLng({
      latitude: 50.92899490001731,
      longitude: 9.544136681645025,
    });
    const destinationLandmark = Landmark.withLatLng({
      latitude: 50.919902402432946,
      longitude: 9.55855522546262,
    });

    const routePreferences = new RoutePreferences();
    calculatingRef.current = true;
    showMessage('The route is calculating.');
    setIsCalculating(true);

    routingHandler.current = RoutingService.calculateRoute(
      [departureLandmark, destinationLandmark],
      routePreferences,
      (err: GemError, routes: Route[]) => {
        calculatingRef.current = false;
        setIsCalculating(false);
        if (err === GemError.cancel) {
          return; // Cancelled; cancelRoute already updated the UI.
        }
        routingHandler.current = null;

        if (err === GemError.success) {
          const routesMap = gemMap?.preferences.routes;
          routes.forEach((route, index) => {
            routesMap?.add(route, index === 0); // first route is main
          });
          gemMap?.centerOnRoutes({routes});
          showMessage('Route calculated successfully!');
          // Only a calculated route can be simulated.
          setAreRoutesBuilt(true);
        } else {
          showMessage('Route calculation failed.');
        }
      },
    );
  };

  const cancelRoute = () => {
    gemMap?.preferences.routes.clear();
    if (routingHandler.current) {
      RoutingService.cancelRoute(routingHandler.current);
      routingHandler.current = null;
    }
    setAreRoutesBuilt(false);
  };

  // Ends the simulation and clears the route; the status says why, since the
  // route it reported is gone.
  const stopSimulation = (message = 'Simulation stopped.') => {
    if (navigationHandler.current) {
      NavigationService.cancelNavigation(navigationHandler.current);
      navigationHandler.current = null;
    }
    // Stop watching the area; the service itself is reused by the next start.
    alarmService.current?.unmonitorAllAreas();
    setAreaNotification(null);
    cancelRoute();
    setIsSimulationActive(false);
    showMessage(message);
  };

  const startSimulation = () => {
    const routes = gemMap?.preferences.routes;
    gemMap?.preferences.routes.clearAllButMainRoute();

    if (!routes?.mainRoute) {
      showMessage('No main route available');
      return;
    }

    // Create the alarm service and its area-crossing listener once and reuse
    // them for every simulation, instead of leaking a new pair per start.
    if (!alarmService.current) {
      alarmListener.current = AlarmListener.create({
        onBoundaryCrossed: (enteredAreas: string[], exitedAreas: string[]) => {
          if (enteredAreas.length > 0) {
            setAreaNotification(`Entered area: ${enteredAreas[0]}`);
          } else if (exitedAreas.length > 0) {
            setAreaNotification(`Exited area: ${exitedAreas[0]}`);
          }
        },
      });
      alarmService.current = AlarmService.create(alarmListener.current);
    }
    alarmService.current.monitorArea(
      new CircleGeographicArea({
        radius: AREA_RADIUS_M,
        centerCoordinates: new Coordinates(AREA_CENTER),
      }),
      'Test area',
    );

    navigationHandler.current = NavigationService.startSimulation(routes.mainRoute, undefined, {
      onNavigationInstruction: () => {
        setIsSimulationActive(true);
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
    // Show Stop Simulation right away: until the first instruction arrives,
    // Start Simulation would otherwise start a second simulation.
    setIsSimulationActive(true);

    // Follow the simulated position.
    gemMap?.startFollowingPosition({zoomLevel: 70, viewAngle: 0});
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
          <Text style={styles.header}>Areas Alarm</Text>
          {!areRoutesBuilt ? (
            <TouchableOpacity
              style={[
                styles.btn,
                styles.btnPurple,
                (!mapDataReady || isCalculating) && styles.btnDisabled,
              ]}
              onPress={onBuildRouteButtonPressed}
              disabled={!mapDataReady || isCalculating}>
              <Text style={styles.btnText}>{isCalculating ? 'Calculating…' : 'Build Route'}</Text>
            </TouchableOpacity>
          ) : !isSimulationActive ? (
            <TouchableOpacity style={[styles.btn, styles.btnGreen]} onPress={startSimulation}>
              <Text style={styles.btnText}>Start Simulation</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity style={[styles.btn, styles.btnRed]} onPress={() => stopSimulation()}>
              <Text style={styles.btnText}>Stop Simulation</Text>
            </TouchableOpacity>
          )}
          {status ? <Text style={styles.status}>{status}</Text> : null}
        </View>
        {areaNotification ? (
          <View style={styles.alarmPanel} pointerEvents="none">
            <Text style={styles.alarmText}>{areaNotification}</Text>
          </View>
        ) : null}
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {flex: 1, backgroundColor: '#000'},
  safeOverlay: {position: 'absolute', top: 0, left: 0, right: 0, alignItems: 'center'},
  card: {
    margin: 12,
    alignSelf: 'stretch',
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
  status: {marginTop: 10, color: '#333', textAlign: 'center'},
  alarmPanel: {
    marginTop: 4,
    backgroundColor: 'rgba(210, 104, 102, 0.95)',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 50,
  },
  alarmText: {color: '#fff', fontWeight: '600'},
});
