// SPDX-FileCopyrightText: 2025-2026 Magic Lane International B.V. <info@magiclane.com>
// SPDX-License-Identifier: Apache-2.0
//
// Contact Magic Lane at <info@magiclane.com> for SDK licensing options.

// The user pans the map to trace a road-snapped path (the map center is the
// "pen"); each segment is previewed, locked with "Add", and finally committed
// as a persistent user roadblock.
//
// The SDK logic (TrafficService.getPersistentRoadblockPathPreview /
// addPersistentRoadblockByCoordinates + Path.fromCoordinates + map paths) is
// identical to the web demo; only the host and chrome differ: the web demo
// appends a DOM view and HTML buttons, while here the map is the <GLView>
// component and the controls are a React Native overlay.

import React, {useRef, useState} from 'react';
import {View, Text, StyleSheet, StatusBar, TouchableOpacity} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {
  Coordinates,
  TrafficService,
  GemError,
  RouteTransportMode,
  Path,
  UserRoadblockPathPreviewCoordinate,
  Color,
} from '@magiclane/maps-sdk';
import {GLView} from '@magiclane/maps-sdk-react-native';

// Optional: a token from https://developer.magiclane.com removes the watermark
// and unlocks full functionality. The map renders without one.
const GEMKIT_TOKEN = '';

export default function App() {
  const [gemMap, setGemMap] = useState<any>(null);
  const [status, setStatus] = useState('Loading map…');
  const [drawMode, setDrawMode] = useState(false);

  // Drawing state (mutable, not rendered directly - kept in refs).
  const mapRef = useRef<any>(null);
  const drawModeRef = useRef(false);
  const permanentCoords = useRef<Coordinates[]>([]);
  const previewCoordsList = useRef<Coordinates[]>([]);
  const previewCursor = useRef<UserRoadblockPathPreviewCoordinate | null>(null);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showMessage = (message: string) => setStatus(message);

  const redrawPath = () => {
    const map = mapRef.current;
    if (!map) return;
    map.preferences.paths.clear();
    // Green for the preview, red for the locked segments; alpha 255 is opaque.
    // A list with no coordinates yet has nothing to draw.
    if (previewCoordsList.current.length > 0) {
      map.preferences.paths.add(Path.fromCoordinates(previewCoordsList.current), {
        colorInner: new Color(0, 255, 0, 255),
        szInner: 10,
      });
    }
    if (permanentCoords.current.length > 0) {
      map.preferences.paths.add(Path.fromCoordinates(permanentCoords.current), {
        colorInner: new Color(255, 0, 0, 255),
        szInner: 10,
      });
    }
  };

  // Logic aligned with the web/Dart implementation: the map center is the pen.
  const handlePreviewPathUpdate = (allowRecursive: boolean) => {
    const map = mapRef.current;
    if (!map) return;

    const viewport = map.viewport;
    const centerScreen = {
      x: Math.floor(viewport.width / 2),
      y: Math.floor(viewport.height / 2),
    };
    const centerCoord = map.transformScreenToWgs(centerScreen);

    // 1. On first call, seed permanentCoords with the center coordinate.
    if (permanentCoords.current.length === 0) {
      permanentCoords.current.push(centerCoord);
    }

    // 2. If the preview cursor is null, set it from the center and return.
    if (!previewCursor.current) {
      previewCursor.current = UserRoadblockPathPreviewCoordinate.fromCoordinates(centerCoord);
      return;
    }

    // 3. Compute the road-snapped path from the previous to the new coordinate.
    const result = TrafficService.getPersistentRoadblockPathPreview({
      from: previewCursor.current,
      to: centerCoord,
      transportMode: RouteTransportMode.car,
    });

    const [newCoords, newCursor, error] = result;

    if (error !== GemError.success) {
      showMessage('No road under the pen. Pan it onto a road.');
      resetPreviewPathOnError(allowRecursive);
      return;
    }

    showMessage("Pan map to draw. Press 'Add' to lock segments.");
    updatePreviewPath(newCoords, newCursor);
  };

  const resetPreviewPathOnError = (allowRecursive: boolean) => {
    previewCoordsList.current = [];
    if (permanentCoords.current.length > 0) {
      previewCursor.current = UserRoadblockPathPreviewCoordinate.fromCoordinates(
        permanentCoords.current[permanentCoords.current.length - 1],
      );
    }
    redrawPath();
    if (allowRecursive) {
      handlePreviewPathUpdate(false);
    }
  };

  const updatePreviewPath = (
    from: Coordinates[],
    to: UserRoadblockPathPreviewCoordinate,
  ) => {
    previewCoordsList.current = [...previewCoordsList.current, ...from];
    previewCursor.current = to;
    redrawPath();
  };

  const onAddBtnPressed = () => {
    if (previewCoordsList.current.length === 0) {
      showMessage('Nothing to add yet. Pan along a road first.');
      return;
    }
    permanentCoords.current = [...permanentCoords.current, ...previewCoordsList.current];
    previewCoordsList.current = [];
    redrawPath();
    showMessage('Segment added. Pan to continue drawing.');
  };

  const onDrawBtnPressed = () => {
    drawModeRef.current = true;
    setDrawMode(true);
    permanentCoords.current = [];
    previewCursor.current = null;
    previewCoordsList.current = [];

    // Initialize drawing immediately.
    handlePreviewPathUpdate(false);
    showMessage("Pan map to draw. Press 'Add' to lock segments.");
  };

  const onCheckBtnPressed = () => {
    const now = new Date();
    const expire = new Date(now.getTime() + 24 * 60 * 60 * 1000); // 1 day

    // The engine routes between consecutive points, so it gets the road matches
    // only: not the pen's first, free position, and no point twice in a row.
    const coords = permanentCoords.current
      .slice(1)
      .filter((c, i, all) => i === 0 || !c.equals(all[i - 1]));
    if (coords.length < 2) {
      showMessage("Nothing to add yet. Pan along a road and press 'Add'.");
      return;
    }

    const result = TrafficService.addPersistentRoadblockByCoordinates({
      coords,
      startTime: now,
      expireTime: expire,
      transportMode: RouteTransportMode.car,
      id: now.toISOString(),
    });

    // Reset state.
    drawModeRef.current = false;
    setDrawMode(false);
    permanentCoords.current = [];
    previewCursor.current = null;
    previewCoordsList.current = [];

    const error = result.second;
    if (error === GemError.exist) {
      showMessage('This road is already blocked.');
    } else if (error !== GemError.success) {
      showMessage(`Error ${error} when adding roadblock.`);
    } else {
      showMessage('Roadblock added successfully!');
    }

    redrawPath();
  };

  const onCancelBtnPressed = () => {
    drawModeRef.current = false;
    setDrawMode(false);
    permanentCoords.current = [];
    previewCoordsList.current = [];
    previewCursor.current = null;
    redrawPath();
    showMessage('Drawing cancelled.');
  };

  const onMapReady = (map: any) => {
    mapRef.current = map;
    setGemMap(map);
    setStatus('Map Ready');

    // Start on a street: the pen has to be within 10 m of a road the transport
    // mode may use, which takes a street-level view.
    map.centerOnCoordinates(Coordinates.fromLatLong(42.50705, 1.52131), {zoomLevel: 85});

    // Use the native cursor.
    map.preferences.enableCursor = true;
    map.preferences.enableCursorRender = true;

    // Debounced preview update as the map is panned.
    map.registerMoveCallback(() => {
      if (!drawModeRef.current) return;
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
      debounceTimer.current = setTimeout(() => {
        handlePreviewPathUpdate(true);
      }, 100);
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
            onMapReady(event.gemMap);
          }
        }}
      />
      {/* Center crosshair marks the "pen" while drawing. */}
      {drawMode ? (
        <View style={styles.crosshairWrap} pointerEvents="none">
          <View style={styles.crosshair} />
        </View>
      ) : null}
      <SafeAreaView style={styles.safeOverlay} pointerEvents="box-none">
        <View style={styles.card}>
          <Text style={styles.header}>Draw Roadblock</Text>
          {!drawMode ? (
            <TouchableOpacity
              style={[styles.btn, styles.btnPurple, !gemMap && styles.btnDisabled]}
              onPress={onDrawBtnPressed}
              disabled={!gemMap}>
              <Text style={styles.btnText}>Draw Roadblock</Text>
            </TouchableOpacity>
          ) : (
            <View style={styles.row}>
              <TouchableOpacity style={[styles.btn, styles.btnRed]} onPress={onCancelBtnPressed}>
                <Text style={styles.btnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.btn, styles.btnBlue]} onPress={onAddBtnPressed}>
                <Text style={styles.btnText}>Add</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.btn, styles.btnGreen]} onPress={onCheckBtnPressed}>
                <Text style={styles.btnText}>Finish</Text>
              </TouchableOpacity>
            </View>
          )}
          {status ? <Text style={styles.status}>{status}</Text> : null}
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
  row: {flexDirection: 'row', gap: 8},
  btn: {paddingHorizontal: 14, paddingVertical: 10, borderRadius: 8},
  btnDisabled: {opacity: 0.5},
  btnText: {color: '#fff', fontWeight: '600'},
  btnPurple: {backgroundColor: '#673ab7'},
  btnBlue: {backgroundColor: '#2196f3'},
  btnGreen: {backgroundColor: '#4caf50'},
  btnRed: {backgroundColor: '#f44336'},
  status: {marginTop: 10, color: '#333', textAlign: 'center'},
  crosshairWrap: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  crosshair: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: '#f44336',
    backgroundColor: 'rgba(244,67,54,0.3)',
  },
});
