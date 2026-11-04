// SPDX-FileCopyrightText: 2025-2026 Magic Lane International B.V. <info@magiclane.com>
// SPDX-License-Identifier: Apache-2.0
//
// Contact Magic Lane at <info@magiclane.com> for SDK licensing options.

// Taps the map, then converts the WGS84 point to UTM, MGRS, LAM, GK and BNG
// projections.

import React, {useEffect, useState} from 'react';
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
  Coordinates,
  ProjectionService,
  ProjectionType,
  WGS84Projection,
  GemError,
  Hemisphere,
} from '@magiclane/maps-sdk';
import {GLView} from '@magiclane/maps-sdk-react-native';

// Optional: a token from https://developer.magiclane.com removes the watermark
// and unlocks full functionality. The map renders without one.
const GEMKIT_TOKEN = '';

type Projections = {
  wgs?: any;
  utm?: any;
  mgrs?: any;
  lam?: any;
  gk?: any;
  bng?: any;
};

function convertProjection(
  projection: any,
  type: ProjectionType,
): Promise<any | null> {
  return new Promise(resolve => {
    ProjectionService.convert(projection, type, (err: GemError, converted: any) => {
      resolve(err !== GemError.success ? null : converted);
    });
  });
}

export default function App() {
  const [gemMap, setGemMap] = useState<any>(null);
  const [projections, setProjections] = useState<Projections | null>(null);

  // Center on Milan, enable the cursor, then convert on every tap.
  useEffect(() => {
    if (!gemMap) return;
    gemMap.centerOnCoordinates(
      new Coordinates({latitude: 45.472358, longitude: 9.184945}),
      {zoomLevel: 80},
    );
    gemMap.preferences.enableCursor = true;
    gemMap.preferences.enableCursorRender = true;
    gemMap.registerTouchCallback(async (point: {x: number; y: number}) => {
      const coords = gemMap.transformScreenToWgs(point);
      gemMap.setCursorScreenPosition(point);
      const wgs = new WGS84Projection(coords);
      const [utm, mgrs, lam, gk, bng] = await Promise.all([
        convertProjection(wgs, ProjectionType.utm),
        convertProjection(wgs, ProjectionType.mgrs),
        convertProjection(wgs, ProjectionType.lam),
        convertProjection(wgs, ProjectionType.gk),
        convertProjection(wgs, ProjectionType.bng),
      ]);
      setProjections({wgs, utm, mgrs, lam, gk, bng});
    });
    return () => {
      gemMap.registerTouchCallback(null);
    };
  }, [gemMap]);

  const rows: Array<[string, string]> = [];
  if (projections) {
    const p = projections;
    rows.push([
      'WGS84',
      p.wgs?.coordinates
        ? `${p.wgs.coordinates.latitude.toFixed(6)}, ${p.wgs.coordinates.longitude.toFixed(6)}`
        : 'Not available',
    ]);
    rows.push([
      'BNG',
      p.bng ? `${p.bng.easting.toFixed(4)}, ${p.bng.northing.toFixed(4)}` : 'Not available',
    ]);
    rows.push([
      'UTM',
      p.utm
        ? `${p.utm.x.toFixed(2)}, ${p.utm.y.toFixed(2)} (Zone ${p.utm.zone}${
            p.utm.hemisphere === Hemisphere.north ? 'N' : 'S'
          })`
        : 'Not available',
    ]);
    rows.push([
      'MGRS',
      p.mgrs
        ? `${p.mgrs.zone}${p.mgrs.letters} ${p.mgrs.easting.toFixed(2)} ${p.mgrs.northing.toFixed(2)}`
        : 'Not available',
    ]);
    rows.push([
      'LAM',
      p.lam ? `${p.lam.x.toFixed(2)}, ${p.lam.y.toFixed(2)}` : 'Not available',
    ]);
    rows.push([
      'GK',
      p.gk
        ? `${p.gk.easting.toFixed(2)}, ${p.gk.northing.toFixed(2)} (Zone ${p.gk.zone})`
        : 'Not available',
    ]);
  }

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
        <View style={styles.overlay}>
          <Text style={styles.header}>Projections</Text>
          <Text style={styles.hint}>
            {gemMap ? 'Tap the map to convert a point' : 'Loading map…'}
          </Text>
        </View>
      </SafeAreaView>
      {projections ? (
        <SafeAreaView style={styles.bottomOverlay} pointerEvents="box-none">
          <View style={styles.panel}>
            <View style={styles.panelHead}>
              <Text style={styles.panelTitle}>Coordinates</Text>
              <TouchableOpacity onPress={() => setProjections(null)} style={styles.close}>
                <Text style={styles.closeText}>✕</Text>
              </TouchableOpacity>
            </View>
            <ScrollView>
              {rows.map(([label, value]) => (
                <View key={label} style={styles.row}>
                  <Text style={styles.rowLabel}>{label}</Text>
                  <Text style={styles.rowValue}>{value}</Text>
                </View>
              ))}
            </ScrollView>
          </View>
        </SafeAreaView>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {flex: 1, backgroundColor: '#000'},
  safeOverlay: {position: 'absolute', top: 0, left: 0, right: 0},
  bottomOverlay: {position: 'absolute', bottom: 0, left: 0, right: 0, alignItems: 'center'},
  overlay: {
    margin: 12,
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    elevation: 5,
    alignItems: 'center',
  },
  header: {fontSize: 18, fontWeight: '700', marginBottom: 4, color: '#333'},
  hint: {color: '#666'},
  panel: {
    margin: 16,
    marginBottom: 30,
    width: '90%',
    maxWidth: 500,
    maxHeight: 360,
    backgroundColor: 'rgba(255,255,255,0.97)',
    borderRadius: 20,
    padding: 20,
    elevation: 6,
  },
  panelHead: {flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8},
  panelTitle: {fontSize: 18, fontWeight: '700', color: '#111'},
  close: {padding: 4},
  closeText: {fontSize: 18, color: '#666'},
  row: {borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#ddd', paddingVertical: 8},
  rowLabel: {fontSize: 11, fontWeight: '700', color: '#666', textTransform: 'uppercase', letterSpacing: 0.5},
  rowValue: {fontSize: 13, color: '#111', marginTop: 2, fontVariant: ['tabular-nums']},
});
