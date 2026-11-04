// SPDX-FileCopyrightText: 2025-2026 Magic Lane International B.V. <info@magiclane.com>
// SPDX-License-Identifier: Apache-2.0
//
// Contact Magic Lane at <info@magiclane.com> for SDK licensing options.

// Draws a polyline, polygon, or set of points on the map from a
// MarkerCollection.
//
// The SDK logic (MarkerCollection.create + Marker.setCoordinates +
// map.preferences.markers) is identical to the web demo; only the host differs:
// the web demo appends a DOM view and HTML buttons, while here the map is the
// <GLView> component and the controls are a React Native overlay.

import React, {useState} from 'react';
import {View, Text, StyleSheet, StatusBar, TouchableOpacity} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {
  Coordinates,
  Marker,
  MarkerCollection,
  MarkerType,
  MarkerCollectionRenderSettings,
  Color,
} from '@magiclane/maps-sdk';
import {GLView} from '@magiclane/maps-sdk-react-native';

// Optional: a token from https://developer.magiclane.com removes the watermark
// and unlocks full functionality. The map renders without one.
const GEMKIT_TOKEN = '';

export default function App() {
  const [gemMap, setGemMap] = useState<any>(null);
  const [status, setStatus] = useState('Loading map…');

  const showMessage = (message: string) => {
    setStatus(message);
  };

  const showMarkerCollectionOnMap = async (
    markerCollection: MarkerCollection,
    shape: string,
  ) => {
    // Without a fill color the engine draws polygons solid black.
    const settings = new MarkerCollectionRenderSettings({
      polygonFillColor: new Color(103, 58, 183, 102),
    });
    try {
      // Clear previous markers from the map.
      await gemMap?.preferences.markers.clear();

      // Show the current marker on map and center on it.
      gemMap?.preferences.markers.add(markerCollection, {settings});
      gemMap?.centerOnArea(markerCollection.area, {zoomLevel: 50});
      showMessage(`${shape} drawn`);
    } catch (e) {
      console.error(`Drawing the ${shape.toLowerCase()} failed:`, e);
      showMessage(`Could not draw the ${shape.toLowerCase()}.`);
    }
  };

  const onPolylineButtonPressed = () => {
    const markerCollection = MarkerCollection.create(
      MarkerType.Polyline,
      'Polyline marker collection',
    );

    const marker = new Marker();
    marker.setCoordinates([
      new Coordinates({latitude: 52.360495, longitude: 4.936882}),
      new Coordinates({latitude: 52.360495, longitude: 4.836882}),
    ]);
    markerCollection.add(marker);

    showMarkerCollectionOnMap(markerCollection, 'Polyline');
  };

  const onPolygonButtonPressed = () => {
    const markerCollection = MarkerCollection.create(
      MarkerType.Polygon,
      'Polygon marker collection',
    );

    const marker = new Marker();
    marker.setCoordinates([
      new Coordinates({latitude: 52.340234, longitude: 4.886882}),
      new Coordinates({latitude: 52.300495, longitude: 4.936882}),
      new Coordinates({latitude: 52.300495, longitude: 4.836882}),
    ]);
    markerCollection.add(marker);

    showMarkerCollectionOnMap(markerCollection, 'Polygon');
  };

  const onPointsButtonPressed = () => {
    const markerCollection = MarkerCollection.create(
      MarkerType.Point,
      'Points marker collection',
    );

    const marker = new Marker();
    marker.setCoordinates([
      new Coordinates({latitude: 52.380495, longitude: 4.930882}),
      new Coordinates({latitude: 52.380495, longitude: 4.900882}),
      new Coordinates({latitude: 52.380495, longitude: 4.870882}),
      new Coordinates({latitude: 52.380495, longitude: 4.840882}),
    ]);
    markerCollection.add(marker);

    showMarkerCollectionOnMap(markerCollection, 'Points');
  };

  // The map must fill the whole window (see center_coordinates): GLView is an
  // absolute full-screen layer and the controls float on top in a SafeAreaView.
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
          <Text style={styles.header}>Draw Shapes</Text>
          <View style={styles.row}>
            <TouchableOpacity
              style={[styles.btn, styles.btnPurple, !gemMap && styles.btnDisabled]}
              onPress={onPolylineButtonPressed}
              disabled={!gemMap}>
              <Text style={styles.btnText}>Polyline</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.btn, styles.btnBlue, !gemMap && styles.btnDisabled]}
              onPress={onPolygonButtonPressed}
              disabled={!gemMap}>
              <Text style={styles.btnText}>Polygon</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.btn, styles.btnGreen, !gemMap && styles.btnDisabled]}
              onPress={onPointsButtonPressed}
              disabled={!gemMap}>
              <Text style={styles.btnText}>Points</Text>
            </TouchableOpacity>
          </View>
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
  status: {marginTop: 10, color: '#333', textAlign: 'center'},
});
