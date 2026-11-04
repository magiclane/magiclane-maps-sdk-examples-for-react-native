// SPDX-FileCopyrightText: 2025-2026 Magic Lane International B.V. <info@magiclane.com>
// SPDX-License-Identifier: Apache-2.0
//
// Contact Magic Lane at <info@magiclane.com> for SDK licensing options.

// A GPX track is imported, a pedestrian route is computed through it, the
// camera frames the route, and the map is captured to a PNG thumbnail shown in
// a modal.
//
// The SDK logic (Path.create from GPX bytes + RoutingService.calculateRoute +
// map.captureImage) is identical to the web demo. The one difference is the GPX
// source: the web demo fetches ./recorded_route.gpx (388 KB) from the Vite public
// folder, which has no RN equivalent (no dev web server). To keep the example
// self-contained, a short inline GPX track (sampled from that same recording near
// Seceda, Italy) is embedded and encoded to bytes at runtime. Drop a bundled GPX
// asset in via react-native-fs / a native module to use a full recording.

import React, {useEffect, useRef, useState} from 'react';
import {
  View,
  Text,
  Image,
  StyleSheet,
  StatusBar,
  TouchableOpacity,
  Modal,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {
  RoutingService,
  RoutePreferences,
  GemError,
  Route,
  Path,
  PathFileFormat,
  RouteRenderSettings,
  RouteRenderOptions,
  RouteTransportMode,
  SdkSettings,
  MapViewRenderInfo,
  ViewDataTransitionStatus,
  ViewCameraTransitionStatus,
} from '@magiclane/maps-sdk';
import {GLView} from '@magiclane/maps-sdk-react-native';

// Optional: a token from https://developer.magiclane.com removes the watermark
// and unlocks full functionality. The map renders without one.
const GEMKIT_TOKEN = '';

// Short inline GPX track (sampled from the web example's recorded_route.gpx).
const INLINE_GPX = `<?xml version="1.0"?>
<gpx xmlns="http://www.topografix.com/GPX/1/1" version="1.1" creator="MagicLane">
  <trk>
    <name>Seceda sample</name>
    <trkseg>
      <trkpt lat="46.59791" lon="11.72468"></trkpt>
      <trkpt lat="46.60128" lon="11.73506"></trkpt>
      <trkpt lat="46.59809" lon="11.74538"></trkpt>
      <trkpt lat="46.59864" lon="11.75678"></trkpt>
      <trkpt lat="46.5887" lon="11.75851"></trkpt>
      <trkpt lat="46.57975" lon="11.75356"></trkpt>
      <trkpt lat="46.57443" lon="11.74175"></trkpt>
      <trkpt lat="46.56406" lon="11.73433"></trkpt>
    </trkseg>
  </trk>
</gpx>`;

// Encode an ASCII string to a byte array (GPX is ASCII; no TextEncoder in RN).
function asciiToBytes(text: string): Uint8Array {
  const out = new Uint8Array(text.length);
  for (let i = 0; i < text.length; i++) out[i] = text.charCodeAt(i) & 0xff;
  return out;
}

// Encode a byte array to base64 (no Buffer/btoa dependency in RN/Hermes).
const B64_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
function bytesToBase64(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i];
    const b1 = i + 1 < bytes.length ? bytes[i + 1] : 0;
    const b2 = i + 2 < bytes.length ? bytes[i + 2] : 0;
    out += B64_CHARS[b0 >> 2];
    out += B64_CHARS[((b0 & 0x03) << 4) | (b1 >> 4)];
    out += i + 1 < bytes.length ? B64_CHARS[((b1 & 0x0f) << 2) | (b2 >> 6)] : '=';
    out += i + 2 < bytes.length ? B64_CHARS[b2 & 0x3f] : '=';
  }
  return out;
}

// Resolves once the map has drawn its view with all data loaded and the camera
// at rest, and nothing else has been drawn for `settleMs`: the first render after
// a camera move can report complete before the tiles have even been requested.
// Gives up waiting after `timeoutMs` (offline, say).
function waitForCompleteRender(
  map: any,
  settleMs = 1500,
  timeoutMs = 20000,
): Promise<void> {
  return new Promise(resolve => {
    let settle: ReturnType<typeof setTimeout> | undefined;
    const cancelSettle = () => {
      if (settle !== undefined) {
        clearTimeout(settle);
      }
    };
    const done = () => {
      cancelSettle();
      clearTimeout(timeout);
      map.registerViewRenderedCallback(null);
      resolve();
    };
    const timeout = setTimeout(done, timeoutMs);
    map.registerViewRenderedCallback((data: any) => {
      const info = MapViewRenderInfo.fromJson(data);
      cancelSettle();
      if (
        info.dataTransitionStatus === ViewDataTransitionStatus.complete &&
        info.cameraTransitionStatus === ViewCameraTransitionStatus.stationary
      ) {
        settle = setTimeout(done, settleMs);
      }
    });
  });
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
  const [snapshotUri, setSnapshotUri] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const mapRef = useRef<any>(null);

  const showMessage = (message: string) => setStatus(message);

  const presentRouteOnMap = (route: Route) => {
    mapRef.current?.preferences.routes.add(route, true, {
      routeRenderSettings: new RouteRenderSettings({
        options: new Set([RouteRenderOptions.main, RouteRenderOptions.showWaypoints]),
      }),
    });
  };

  const calculateRouteFromPath = (path: Path): Promise<Route> => {
    return new Promise((resolve, reject) => {
      const waypoints = path.toLandmarkList();
      RoutingService.calculateRoute(
        waypoints,
        new RoutePreferences({transportMode: RouteTransportMode.pedestrian}),
        (err: GemError, routes: Route[]) => {
          if (err !== GemError.success || !routes.length) {
            showMessage('Error while computing route.');
            reject(err);
            return;
          }
          resolve(routes[0]);
        },
      );
    });
  };

  const importGPX = async () => {
    const map = mapRef.current;
    if (!map) return;
    setBusy(true);
    showMessage('Importing GPX...');

    try {
      const pathData = asciiToBytes(INLINE_GPX);

      // Process the GPX data with the SDK.
      const gemPath = Path.create({data: pathData, format: PathFileFormat.gpx});

      // Calculate a route from the path.
      const route = await calculateRouteFromPath(gemPath);
      presentRouteOnMap(route);

      // Frame the route's area.
      if (route.geographicArea) {
        map.centerOnArea(route.geographicArea, {zoomLevel: 70});
      }

      // Capture only once the tiles around the route have loaded.
      await waitForCompleteRender(map);

      const screenshot = await map.captureImage();
      if (!screenshot) {
        showMessage('Error while taking screenshot.');
        return;
      }
      setSnapshotUri(`data:image/png;base64,${bytesToBase64(screenshot)}`);
      showMessage('Snapshot captured!');
    } catch (e) {
      console.error(e);
      showMessage('Error processing GPX.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.root}>
      <StatusBar barStyle="dark-content" />
      <GLView
        style={StyleSheet.absoluteFill}
        apiToken={GEMKIT_TOKEN || undefined}
        onMapReady={event => {
          if (event.gemMap) {
            mapRef.current = event.gemMap;
            setGemMap(event.gemMap);
            setStatus('Map Ready');
          }
        }}
      />
      <SafeAreaView style={styles.safeOverlay} pointerEvents="box-none">
        <View style={styles.card}>
          <Text style={styles.header}>GPX Thumbnail Image</Text>
          <TouchableOpacity
            style={[styles.btn, styles.btnPurple, (!mapDataReady || busy) && styles.btnDisabled]}
            onPress={importGPX}
            disabled={!mapDataReady || busy}>
            <Text style={styles.btnText}>{busy ? 'Working…' : 'Import GPX'}</Text>
          </TouchableOpacity>
          {status ? <Text style={styles.status}>{status}</Text> : null}
        </View>
      </SafeAreaView>

      {/* Route snapshot modal (the web demo's image card). */}
      <Modal
        visible={!!snapshotUri}
        transparent
        animationType="fade"
        onRequestClose={() => setSnapshotUri(null)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Route Snapshot</Text>
              <TouchableOpacity onPress={() => setSnapshotUri(null)}>
                <Text style={styles.closeGlyph}>✕</Text>
              </TouchableOpacity>
            </View>
            {snapshotUri ? (
              <Image source={{uri: snapshotUri}} style={styles.snapshot} resizeMode="contain" />
            ) : null}
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
  btn: {paddingHorizontal: 16, paddingVertical: 10, borderRadius: 8},
  btnDisabled: {opacity: 0.5},
  btnText: {color: '#fff', fontWeight: '600'},
  btnPurple: {backgroundColor: '#673ab7'},
  status: {marginTop: 10, color: '#333', textAlign: 'center'},
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
  modalCard: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 16,
    width: '90%',
    maxWidth: 420,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  modalTitle: {fontSize: 18, fontWeight: '700', color: '#333'},
  closeGlyph: {fontSize: 18, color: '#666', paddingHorizontal: 6},
  snapshot: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: 12,
    backgroundColor: '#eee',
  },
});
