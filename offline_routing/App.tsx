// SPDX-FileCopyrightText: 2025-2026 Magic Lane International B.V. <info@magiclane.com>
// SPDX-License-Identifier: Apache-2.0
//
// Contact Magic Lane at <info@magiclane.com> for SDK licensing options.

// Flow:
//   1. Download the Andorra road map to the device.
//   2. Deny the internet connection (`setAllowInternetConnection(false)`).
//   3. Calculate and display a route entirely from the on-device map data.
//
// The map logic (ContentStore download + RoutingService.calculateRoute) is the
// same SDK you use on web; only the host differs: a <GLView> component instead
// of a DOM container.

import React, {useEffect, useRef, useState} from 'react';
import {
  View,
  Text,
  StyleSheet,
  StatusBar,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {
  SdkSettings,
  ServiceGroupType,
  ContentStore,
  ContentType,
  ContentStoreItem,
  EventDrivenProgressListener,
  GemError,
  Landmark,
  RoutePreferences,
  RoutingService,
  Route,
  TaskHandler,
} from '@magiclane/maps-sdk';
import {
  GLView,
  MagicLaneReactNativeSDK,
} from '@magiclane/maps-sdk-react-native';

// A token from https://developer.magiclane.com is required to DOWNLOAD content
// (the offline map). The map renders without one, but the download step needs a
// valid token and an initial internet connection.
const GEMKIT_TOKEN = '';

// The offline region this demo uses. Small enough to download quickly.
const OFFLINE_MAP_NAME = 'Andorra';

// Andorra la Vella -> Encamp, entirely inside the downloaded region.
const DEPARTURE = {latitude: 42.4972, longitude: 1.50498};
const DESTINATION = {latitude: 42.51003, longitude: 1.534};

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

export default function OfflineRoutingDemo() {
  const [gemMap, setGemMap] = useState<any>(null);
  // The store lists the maps only once the SDK is online and its map data
  // is current, right after start-up. Set once the map is shown and that
  // data is ready.
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
  const [status, setStatus] = useState('Initializing…');
  const [isDownloaded, setIsDownloaded] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState<number | null>(null);
  // True while the store is searched for the map, before its download starts:
  // the button is disabled meanwhile, so a second tap cannot start a second
  // lookup and a second download of the same map.
  const [isLookingUp, setIsLookingUp] = useState(false);
  const [routesBuilt, setRoutesBuilt] = useState(false);
  const routingHandler = useRef<TaskHandler | null>(null);
  const [calculating, setCalculating] = useState(false);

  // Pending store-list request and the item being downloaded, so both can be
  // cancelled if the screen goes away mid-download.
  const listListener = useRef<EventDrivenProgressListener | null>(null);
  const downloadingItem = useRef<ContentStoreItem | null>(null);
  const mounted = useRef(true);

  // Initialize the SDK (the same promise <GLView apiToken> uses) and allow
  // content downloads on metered networks.
  useEffect(() => {
    mounted.current = true;
    MagicLaneReactNativeSDK.init({authorization: GEMKIT_TOKEN || undefined})
      .then(() => {
        if (!mounted.current) return;
        SdkSettings.setAllowOffboardServiceOnExtraChargedNetwork(
          ServiceGroupType.ContentService,
          true,
        );
        SdkSettings.setAllowInternetConnection(true);
        // If the region is already on the device, go straight to offline mode.
        const local = ContentStore.getLocalContentList(ContentType.roadMap);
        if (local.some(m => m.name === OFFLINE_MAP_NAME && m.isCompleted)) {
          SdkSettings.setAllowInternetConnection(false);
          setIsDownloaded(true);
          setStatus(`${OFFLINE_MAP_NAME} already offline - connection denied`);
        } else {
          setStatus('SDK initialized');
        }
      })
      .catch((e: any) => {
        if (mounted.current) {
          setStatus(`Init failed: ${String(e?.message || e)}`);
        }
      });
    return () => {
      mounted.current = false;
      if (listListener.current) {
        ContentStore.cancel(listListener.current);
        listListener.current = null;
      }
      if (downloadingItem.current) {
        downloadingItem.current.cancelDownload();
        downloadingItem.current = null;
      }
      if (routingHandler.current) {
        RoutingService.cancelRoute(routingHandler.current);
        routingHandler.current = null;
      }
    };
  }, []);

  const downloadOfflineMap = () => {
    // A tap that lands before the re-render that disables the button.
    if (listListener.current || downloadingItem.current) return;
    setStatus(`Looking up ${OFFLINE_MAP_NAME}…`);
    setIsLookingUp(true);
    listListener.current = ContentStore.asyncGetStoreContentList(
      ContentType.roadMap,
      (err: GemError, items: ContentStoreItem[] | null) => {
        listListener.current = null;
        if (!mounted.current) return;
        setIsLookingUp(false);
        if (err !== GemError.success || !items) {
          setStatus(`Could not load map list (${err}). Check token/connection.`);
          return;
        }
        const map = items.find(m => m.name === OFFLINE_MAP_NAME);
        if (!map) {
          setStatus(`${OFFLINE_MAP_NAME} not found in the store.`);
          return;
        }
        setDownloadProgress(0);
        setStatus(`Downloading ${OFFLINE_MAP_NAME}…`);
        downloadingItem.current = map;
        map.asyncDownload(
          (dErr: GemError) => {
            downloadingItem.current = null;
            if (!mounted.current) return;
            if (dErr === GemError.success) {
              // Go fully offline: subsequent routing uses on-device data only.
              SdkSettings.setAllowInternetConnection(false);
              setDownloadProgress(null);
              setIsDownloaded(true);
              setStatus(`${OFFLINE_MAP_NAME} downloaded - connection denied`);
            } else {
              setDownloadProgress(null);
              setStatus(`Download failed (${dErr})`);
            }
          },
          {
            onProgressCallback: (p: number) => {
              if (mounted.current) setDownloadProgress(p);
            },
            allowChargedNetworks: true,
          },
        );
      },
    );
  };

  const buildRoute = () => {
    if (!gemMap) {
      setStatus('Map not ready yet');
      return;
    }
    const departure = Landmark.withLatLng(DEPARTURE);
    const destination = Landmark.withLatLng(DESTINATION);
    const prefs = new RoutePreferences({});
    setCalculating(true);
    setStatus('Calculating route (offline)…');
    routingHandler.current = RoutingService.calculateRoute(
      [departure, destination],
      prefs,
      (err: GemError, routes: Route[]) => {
        if (err === GemError.cancel) {
          return; // Cancelled by the user; cancelRoute already updated the UI.
        }
        routingHandler.current = null;
        if (!mounted.current) return;
        setCalculating(false);
        if (err === GemError.success && routes.length > 0) {
          const routesMap = gemMap.preferences.routes;
          routes.forEach((route, i) =>
            routesMap.add(route, i === 0, {label: routeLabel(route)}),
          );
          gemMap.centerOnRoutes({routes});
          setRoutesBuilt(true);
          setStatus('Route calculated from offline data');
        } else {
          setStatus(`Route calculation failed (${err})`);
        }
      },
    );
  };

  const cancelRoute = () => {
    if (routingHandler.current) {
      RoutingService.cancelRoute(routingHandler.current);
      routingHandler.current = null;
      setCalculating(false);
      setStatus('Route calculation cancelled');
    }
  };

  const clearRoutes = () => {
    gemMap?.preferences.routes.clear();
    setRoutesBuilt(false);
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
            setGemMap(event.gemMap);
          }
        }}
      />
      <SafeAreaView style={styles.safeOverlay} pointerEvents="box-none">
        <View style={styles.card}>
          <Text style={styles.header}>Offline Routing</Text>

          {!isDownloaded ? (
            downloadProgress !== null ? (
              <View style={styles.row}>
                <ActivityIndicator color="#673ab7" />
                <Text style={styles.progress}> {Math.round(downloadProgress)}%</Text>
              </View>
            ) : (
              <TouchableOpacity
                style={[styles.btnPurple, (!mapDataReady || isLookingUp) && styles.btnDisabled]}
                disabled={!mapDataReady || isLookingUp}
                onPress={downloadOfflineMap}>
                <Text style={styles.btnText}>
                  {isLookingUp ? 'Looking up…' : `Download ${OFFLINE_MAP_NAME} map`}
                </Text>
              </TouchableOpacity>
            )
          ) : calculating ? (
            <TouchableOpacity style={styles.btnRed} onPress={cancelRoute}>
              <Text style={styles.btnText}>Cancel</Text>
            </TouchableOpacity>
          ) : routesBuilt ? (
            <TouchableOpacity style={styles.btnGreen} onPress={clearRoutes}>
              <Text style={styles.btnText}>Clear route</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity style={styles.btnPurple} onPress={buildRoute}>
              <Text style={styles.btnText}>Build route (offline)</Text>
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
  row: {flexDirection: 'row', alignItems: 'center'},
  progress: {fontSize: 16, color: '#673ab7', fontWeight: '600'},
  status: {marginTop: 10, color: '#333', textAlign: 'center'},
  btnText: {color: '#fff', fontWeight: '600'},
  btnPurple: {backgroundColor: '#673ab7', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 8},
  btnRed: {backgroundColor: '#f44336', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 8},
  btnGreen: {backgroundColor: '#4caf50', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 8},
  btnDisabled: {opacity: 0.5},
});
