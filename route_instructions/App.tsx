// SPDX-FileCopyrightText: 2025-2026 Magic Lane International B.V. <info@magiclane.com>
// SPDX-License-Identifier: Apache-2.0
//
// Contact Magic Lane at <info@magiclane.com> for SDK licensing options.

// This app calculates a multi-waypoint route, renders it, then extracts every
// turn-by-turn RouteInstruction from the main route's segments and lists them
// (turn image + turn text + distance) in a modal.

import React, {useEffect, useMemo, useRef, useState} from 'react';
import {
  View,
  Text,
  StyleSheet,
  StatusBar,
  Modal,
  Image,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {
  Landmark,
  RoutePreferences,
  RoutingService,
  GemError,
  Route,
  RouteSegment,
  RouteInstruction,
  Coordinates,
  RouteRenderSettings,
  RouteRenderOptions,
  SdkSettings,
  TaskHandler,
} from '@magiclane/maps-sdk';
import {GLView} from '@magiclane/maps-sdk-react-native';

// A token from https://developer.magiclane.com removes the watermark and unlocks
// full functionality. The map renders without one.
const GEMKIT_TOKEN = '';

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

function getInstructionsFromSegments(segments: RouteSegment[]): RouteInstruction[] {
  const list: RouteInstruction[] = [];
  for (const segment of segments) {
    list.push(...segment.instructions);
  }
  return list;
}

function distanceUntil(instruction: RouteInstruction): string {
  const td = instruction.traveledTimeDistance;
  return convertDistance(td.restrictedDistanceM + td.unrestrictedDistanceM);
}

export default function RouteInstructionsDemo() {
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
  const [instructions, setInstructions] = useState<RouteInstruction[]>([]);
  const [modalVisible, setModalVisible] = useState(false);
  const [calculating, setCalculating] = useState(false);
  const routingHandler = useRef<TaskHandler | null>(null);

  // RouteInstruction exposes turn glyphs as PNG byte buffers; convert them once
  // per route instead of on every render.
  const turnImages = useMemo(
    () =>
      instructions.map(instruction =>
        bytesToDataUri(instruction.getTurnImage({size: {width: 56, height: 56}})),
      ),
    [instructions],
  );

  // Stop a running calculation when the screen goes away.
  useEffect(() => {
    return () => {
      if (routingHandler.current) {
        RoutingService.cancelRoute(routingHandler.current);
        routingHandler.current = null;
      }
    };
  }, []);

  const showMessage = (msg: string) => {
    setStatus(msg);
  };

  const onBuildRoute = () => {
    if (!gemMap) {
      showMessage('Map not ready yet');
      return;
    }
    if (routingHandler.current) {
      return; // A calculation is already running.
    }
    // Frankfurt -> Karlsruhe -> Munich.
    const departure = Landmark.withCoordinates(Coordinates.fromLatLong(50.11428, 8.68133));
    const intermediary = Landmark.withCoordinates(Coordinates.fromLatLong(49.0069, 8.4037));
    const destination = Landmark.withCoordinates(Coordinates.fromLatLong(48.1351, 11.582));
    const prefs = new RoutePreferences({});
    showMessage('The route is calculating…');
    setCalculating(true);

    routingHandler.current = RoutingService.calculateRoute(
      [departure, intermediary, destination],
      prefs,
      (err: GemError, routes: Route[]) => {
        routingHandler.current = null;
        setCalculating(false);
        if (err === GemError.cancel) {
          return; // Cancelled by the user; onCancel already updated the UI.
        }
        if (err === GemError.success && routes.length > 0) {
          const routesMap = gemMap.preferences.routes;
          routes.forEach((route, i) => {
            const renderSettings = new RouteRenderSettings({
              options: new Set([
                RouteRenderOptions.showTraffic,
                RouteRenderOptions.showHighlights,
              ]),
            });
            routesMap.add(route, i === 0, {
              routeRenderSettings: renderSettings,
              label: routeLabel(route),
            });
          });
          gemMap.centerOnRoutes({routes});
          setInstructions(getInstructionsFromSegments(routes[0].segments));
          setAreRoutesBuilt(true);
          showMessage('Route calculated successfully!');
        } else {
          showMessage(`Route calculation failed (${err})`);
        }
      },
    );
  };

  const onCancel = () => {
    if (routingHandler.current) {
      // Cancel the calculation of the route.
      RoutingService.cancelRoute(routingHandler.current);
      routingHandler.current = null;
      setCalculating(false);
    }
    gemMap?.preferences.routes.clear();
    setInstructions([]);
    setAreRoutesBuilt(false);
    setModalVisible(false);
    showMessage('Route cleared');
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
          <Text style={styles.header}>Route Instructions</Text>
          {calculating ? (
            <TouchableOpacity style={styles.btnRed} onPress={onCancel}>
              <Text style={styles.btnText}>Cancel</Text>
            </TouchableOpacity>
          ) : !areRoutesBuilt ? (
            <TouchableOpacity
              style={[styles.btnGreen, !mapDataReady && styles.btnDisabled]}
              disabled={!mapDataReady}
              onPress={onBuildRoute}>
              <Text style={styles.btnText}>Build Route</Text>
            </TouchableOpacity>
          ) : (
            <View style={styles.row}>
              <TouchableOpacity style={styles.btnBlue} onPress={() => setModalVisible(true)}>
                <Text style={styles.btnText}>Instructions ({instructions.length})</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.btnRed} onPress={onCancel}>
                <Text style={styles.btnText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          )}
          <Text style={styles.status}>{status}</Text>
        </View>
      </SafeAreaView>

      <Modal
        visible={modalVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setModalVisible(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Route Instructions</Text>
              <TouchableOpacity onPress={() => setModalVisible(false)}>
                <Text style={styles.closeText}>✕</Text>
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.list}>
              {instructions.length === 0 ? (
                <Text style={styles.empty}>No instructions available.</Text>
              ) : (
                instructions.map((instruction, index) => {
                  const uri = turnImages[index];
                  return (
                    <View style={styles.item} key={index}>
                      <View style={styles.iconBox}>
                        {uri ? (
                          <Image source={{uri}} style={styles.turnIcon} resizeMode="contain" />
                        ) : (
                          <Text style={styles.iconFallback}>→</Text>
                        )}
                      </View>
                      <View style={styles.itemText}>
                        <Text style={styles.turnText}>
                          {instruction.turnInstruction || 'Continue'}
                        </Text>
                        {instruction.followRoadInstruction ? (
                          <Text style={styles.followText}>
                            {instruction.followRoadInstruction}
                          </Text>
                        ) : null}
                      </View>
                      <Text style={styles.distance}>{distanceUntil(instruction)}</Text>
                    </View>
                  );
                })
              )}
            </ScrollView>
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
  header: {fontSize: 18, fontWeight: '700', marginBottom: 12, color: '#333'},
  row: {flexDirection: 'row', gap: 10},
  status: {marginTop: 10, color: '#333', textAlign: 'center'},
  btnText: {color: '#fff', fontWeight: '600'},
  btnGreen: {backgroundColor: '#4caf50', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 8},
  btnBlue: {backgroundColor: '#2196f3', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 8},
  btnRed: {backgroundColor: '#f44336', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 8},
  modalBackdrop: {flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', padding: 16},
  modalContent: {backgroundColor: '#fff', borderRadius: 20, maxHeight: '80%', overflow: 'hidden'},
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.05)',
  },
  modalTitle: {fontSize: 20, fontWeight: '600', color: '#1a1a1a'},
  closeText: {fontSize: 20, color: '#666'},
  list: {paddingHorizontal: 0},
  empty: {padding: 40, textAlign: 'center', color: '#666'},
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.05)',
  },
  iconBox: {
    width: 48,
    height: 48,
    marginRight: 16,
    borderRadius: 12,
    backgroundColor: '#f5f5f5',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  turnIcon: {width: 40, height: 40},
  iconFallback: {fontSize: 22, color: '#666'},
  itemText: {flex: 1},
  turnText: {fontSize: 15, fontWeight: '500', color: '#1a1a1a'},
  followText: {fontSize: 13, color: '#666', marginTop: 2},
  distance: {
    fontSize: 14,
    color: '#2196f3',
    fontWeight: '600',
    marginLeft: 12,
    minWidth: 60,
    textAlign: 'right',
  },
  btnDisabled: {opacity: 0.5},
});
