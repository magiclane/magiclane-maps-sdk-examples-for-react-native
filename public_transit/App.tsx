// SPDX-FileCopyrightText: 2025-2026 Magic Lane International B.V. <info@magiclane.com>
// SPDX-License-Identifier: Apache-2.0
//
// Contact Magic Lane at <info@magiclane.com> for SDK licensing options.

// This app calculates a public-transport route (RouteTransportMode.public),
// converts it to a PTRoute, and shows the leg-by-leg segments (walk / bus /
// tram …) in a bottom strip. Tap a route on the map to pick an alternative.

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
  Landmark,
  RoutePreferences,
  RoutingService,
  GemError,
  Route,
  PTRoute,
  PTRouteSegment,
  TransitType,
  RouteTransportMode,
  SdkSettings,
  TaskHandler,
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

function formatClock(date: Date): string {
  return `${date.getHours()}:${date.getMinutes().toString().padStart(2, '0')}`;
}

// Build a multi-line label for the main public-transit route.
function getRouteLabel(route: Route): string {
  const td = route.getTimeDistance();
  const totalDistance = td.unrestrictedDistanceM + td.restrictedDistanceM;
  const totalDuration = td.unrestrictedTimeS + td.restrictedTimeS;

  const ptRoute: PTRoute | null = route.toPTRoute ? route.toPTRoute() : null;
  if (!ptRoute) {
    return '';
  }

  const first = ptRoute.segments[0]?.toPTRouteSegment();
  const last =
    ptRoute.segments[ptRoute.segments.length - 1]?.toPTRouteSegment();
  if (!first || !last) {
    return '';
  }

  const departureTime = first.departureTime;
  const arrivalTime = last.arrivalTime;
  const totalWalking =
    first.timeDistance.totalDistanceM + last.timeDistance.totalDistanceM;

  let dep = '';
  let arr = '';
  if (departureTime && arrivalTime) {
    dep = formatClock(departureTime);
    arr = formatClock(arrivalTime);
  }

  return (
    `${convertDuration(totalDuration)}\n` +
    `${dep} - ${arr}\n` +
    `${convertDistance(totalDistance)} (${convertDistance(totalWalking)} walking)\n` +
    `${ptRoute.publicTransportFare || ''}`
  );
}

// The icon and fallback name of a leg, by its transit type.
const TRANSIT_ICONS: Partial<Record<TransitType, string>> = {
  [TransitType.walk]: '🚶',
  [TransitType.bus]: '🚌',
  [TransitType.underground]: '🚇',
  [TransitType.railway]: '🚆',
  [TransitType.tram]: '🚊',
  [TransitType.waterTransport]: '⛴️',
  [TransitType.sharedBike]: '🚲',
  [TransitType.sharedScooter]: '🛴',
  [TransitType.sharedCar]: '🚗',
};
const TRANSIT_NAMES: Partial<Record<TransitType, string>> = {
  [TransitType.bus]: 'Bus',
  [TransitType.underground]: 'Underground',
  [TransitType.railway]: 'Train',
  [TransitType.tram]: 'Tram',
  [TransitType.waterTransport]: 'Boat',
  [TransitType.sharedBike]: 'Bike',
  [TransitType.sharedScooter]: 'Scooter',
  [TransitType.sharedCar]: 'Car',
};

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
  const [routesBuilt, setRoutesBuilt] = useState(false);
  const [segments, setSegments] = useState<PTRouteSegment[]>([]);
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

  // Shows the legs of the main route in the bottom strip.
  const showRouteDetails = (route: Route) => {
    const ptRoute: PTRoute | null = route.toPTRoute();
    if (ptRoute) {
      const segs = ptRoute.segments
        .map(seg => seg.toPTRouteSegment())
        .filter((seg): seg is PTRouteSegment => !!seg);
      setSegments(segs);
      setStatus(`${segs.length} ${segs.length === 1 ? 'leg' : 'legs'}`);
    } else {
      setSegments([]);
      setStatus('Route calculated, but it has no public transit details.');
    }
  };

  const onMapReady = (map: any) => {
    setGemMap(map);
    setStatus('Map Ready');
    // Tap a route on the map to make it the main route; its label and its legs
    // follow it.
    map.registerTouchCallback(async (pos: {x: number; y: number}) => {
      await map.setCursorScreenPosition(pos);
      const selectedRoutes = map.cursorSelectionRoutes();
      if (selectedRoutes.length > 0) {
        const routesMap = map.preferences.routes;
        const selected: Route = selectedRoutes[0];
        if (routesMap.mainRoute) {
          routesMap.hideLabel(routesMap.mainRoute);
        }
        routesMap.mainRoute = selected;
        routesMap.setLabel(selected, getRouteLabel(selected));
        showRouteDetails(selected);
      }
    });
  };

  const onBuildRoute = () => {
    if (!gemMap) {
      return;
    }
    const departure = Landmark.withLatLng({latitude: 51.505929, longitude: -0.097579});
    const destination = Landmark.withLatLng({latitude: 51.507616, longitude: -0.105036});
    const prefs = new RoutePreferences({transportMode: RouteTransportMode.public});

    setCalculating(true);
    setStatus('The route is being calculated.');
    routingHandler.current = RoutingService.calculateRoute(
      [departure, destination],
      prefs,
      (err: GemError, routes: Route[]) => {
        if (err === GemError.cancel) {
          return; // Cancelled by the user; onCancelRoute already updated the UI.
        }
        routingHandler.current = null;
        setCalculating(false);
        if (err === GemError.success && routes.length > 0) {
          const routesMap = gemMap.preferences.routes;
          routes.forEach((route, idx) =>
            routesMap.add(route, idx === 0, {
              label: idx === 0 ? getRouteLabel(route) : undefined,
            }),
          );
          gemMap.centerOnRoutes({routes});
          setRoutesBuilt(true);
          showRouteDetails(routes[0]);
        } else {
          setSegments([]);
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
    setRoutesBuilt(false);
    setSegments([]);
    setStatus('Routes cleared');
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
          <Text style={styles.header}>Public Transit</Text>
          {calculating ? (
            <TouchableOpacity style={styles.btnRed} onPress={onCancelRoute}>
              <Text style={styles.btnText}>Cancel</Text>
            </TouchableOpacity>
          ) : routesBuilt ? (
            <TouchableOpacity style={styles.btnGreen} onPress={onClearRoutes}>
              <Text style={styles.btnText}>Clear Routes</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={[styles.btnPurple, !mapDataReady && styles.btnDisabled]}
              onPress={onBuildRoute}
              disabled={!mapDataReady}>
              <Text style={styles.btnText}>Build Route</Text>
            </TouchableOpacity>
          )}
          <Text style={styles.status}>{status}</Text>
        </View>
      </SafeAreaView>

      {segments.length > 0 ? (
        <SafeAreaView style={styles.bottomOverlay} pointerEvents="box-none">
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.segStrip}
            contentContainerStyle={styles.segContent}>
            {segments.map((seg, i) => {
              const isWalk = seg.transitType === TransitType.walk;
              return (
                <View key={i} style={styles.seg}>
                  {isWalk ? (
                    <>
                      <Text style={styles.segIcon}>🚶</Text>
                      <Text style={styles.segWalk}>
                        {convertDuration(seg.timeDistance.totalTimeS)}
                      </Text>
                    </>
                  ) : (
                    <>
                      <Text style={styles.segIcon}>{TRANSIT_ICONS[seg.transitType] ?? '🚍'}</Text>
                      <View style={styles.segBadge}>
                        <Text style={styles.segBadgeText}>
                          {seg.shortName || TRANSIT_NAMES[seg.transitType] || 'Transit'}
                          {seg.hasWheelchairSupport ? ' ♿' : ''}
                        </Text>
                      </View>
                    </>
                  )}
                </View>
              );
            })}
          </ScrollView>
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
  segStrip: {
    margin: 12,
    backgroundColor: 'rgba(255,255,255,0.95)',
    borderRadius: 20,
    maxHeight: 76,
  },
  segContent: {paddingHorizontal: 20, paddingVertical: 12, gap: 16, alignItems: 'center'},
  seg: {alignItems: 'center', justifyContent: 'center', minWidth: 56, gap: 4},
  segIcon: {fontSize: 22},
  segWalk: {fontSize: 12, fontWeight: '600', color: '#666'},
  segBadge: {
    backgroundColor: '#4caf50',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  segBadgeText: {color: '#fff', fontSize: 11, fontWeight: '700'},
  btnText: {color: '#fff', fontWeight: '600'},
  btnPurple: {backgroundColor: '#673ab7', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 8},
  btnGreen: {backgroundColor: '#4caf50', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 8},
  btnRed: {backgroundColor: '#f44336', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 8},
  btnDisabled: {opacity: 0.5},
});
