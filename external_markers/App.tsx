// SPDX-FileCopyrightText: 2025-2026 Magic Lane International B.V. <info@magiclane.com>
// SPDX-License-Identifier: Apache-2.0
//
// Contact Magic Lane at <info@magiclane.com> for SDK licensing options.

// Charging stations are fetched from OpenChargeMap, converted to GeoJSON, added
// to the map as an externally-rendered marker collection, and drawn as
// app-owned pins that track the map as it pans/zooms.
//
// The SDK logic (addGeoJsonAsMarkerCollection + ExternalRendererMarkers) is
// identical to the web demo. The web demo positions DOM pins over the map
// container; here we position React Native pins over the full-window <GLView>
// using the same normalized screen coordinates the renderer reports (the RN
// equivalent of the web PinManager).

import React, {useRef, useState} from 'react';
import {
  View,
  Text,
  StyleSheet,
  StatusBar,
  TouchableOpacity,
  LayoutChangeEvent,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {
  ExternalRendererMarkers,
  MarkerCollectionRenderSettings,
} from '@magiclane/maps-sdk';
import {GLView} from '@magiclane/maps-sdk-react-native';

// Optional: a token from https://developer.magiclane.com removes the watermark
// and unlocks full functionality. The map renders without one.
const GEMKIT_TOKEN = '';

// Required for the charging stations: the Open Charge Map API needs an API key
// (https://openchargemap.org/site/develop). Without one the map still works, but
// no stations are loaded.
const OPENCHARGEMAP_API_KEY = '';

// A pin positioned on screen (normalized [0,1] coordinates reported by the
// external renderer, scaled to the current view size at render time).
type Pin = {id: number; nx: number; ny: number; title?: string};

type OpenChargeMapEntry = {
  ID: number;
  AddressInfo: {
    Latitude: number;
    Longitude: number;
    Title?: string;
    AddressLine1?: string;
    Town?: string;
  };
};

type GeoJsonFeatureCollection = {
  type: 'FeatureCollection';
  features: Array<{
    type: 'Feature';
    geometry: {type: 'Point'; coordinates: [number, number]};
    properties: {id: number; title: string; town: string};
  }>;
};

async function fetchAndConvertToGeoJSON(): Promise<GeoJsonFeatureCollection> {
  const url =
    'https://api.openchargemap.io/v3/poi/?output=json&latitude=45.75&longitude=3.15&distance=10&distanceunit=KM' +
    `&key=${encodeURIComponent(OPENCHARGEMAP_API_KEY)}`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`OpenChargeMap request failed (HTTP ${response.status})`);
  }
  const data: OpenChargeMapEntry[] = await response.json();
  return {
    type: 'FeatureCollection',
    features: data
      .filter(entry => entry.AddressInfo?.Latitude && entry.AddressInfo?.Longitude)
      .map(entry => ({
        type: 'Feature' as const,
        geometry: {
          type: 'Point' as const,
          coordinates: [entry.AddressInfo.Longitude, entry.AddressInfo.Latitude] as [
            number,
            number,
          ],
        },
        properties: {
          id: entry.ID,
          title: entry.AddressInfo.Title || '',
          town: entry.AddressInfo.Town || '',
        },
      })),
  };
}

export default function App() {
  const [gemMap, setGemMap] = useState<any>(null);
  const [status, setStatus] = useState('Loading map…');
  const [pins, setPins] = useState<Pin[]>([]);
  // 'loading' and 'added' disable the button so repeated presses don't add the
  // collection again.
  const [markersState, setMarkersState] = useState<'idle' | 'loading' | 'added'>(
    'idle',
  );
  const externalRender = useRef<ExternalRendererMarkers | null>(null);
  const size = useRef({width: 0, height: 0});

  const showMessage = (message: string) => setStatus(message);

  const onLayout = (e: LayoutChangeEvent) => {
    size.current = {
      width: e.nativeEvent.layout.width,
      height: e.nativeEvent.layout.height,
    };
  };

  // RN equivalent of PinManager.updatePins: snapshot the renderer's visible
  // points into state so React re-renders the pins.
  const updatePins = () => {
    const render = externalRender.current;
    if (!render) return;
    const next: Pin[] = [];
    render.visiblePoints.forEach((value, key) => {
      next.push({
        id: key,
        nx: value.screenCoordinates.x, // [0, 1]
        ny: value.screenCoordinates.y, // [0, 1]
        title: (value.info?.title as string) || undefined,
      });
    });
    setPins(next);
  };

  const addMarkers = () => {
    if (!gemMap || markersState !== 'idle') return;
    if (!OPENCHARGEMAP_API_KEY) {
      showMessage('Set OPENCHARGEMAP_API_KEY in App.tsx to load charging stations.');
      return;
    }
    setMarkersState('loading');
    showMessage('Fetching charging stations...');

    fetchAndConvertToGeoJSON()
      .then(data => {
        const geoJsonString = JSON.stringify(data);
        const response = gemMap.addGeoJsonAsMarkerCollection(geoJsonString, 'markers');

        if (!response || response.length === 0) {
          setMarkersState('idle');
          showMessage('No markers found.');
          return;
        }

        const ms = new MarkerCollectionRenderSettings();
        gemMap.preferences.markers.add(response[0], {
          settings: ms,
          externalRender: externalRender.current!,
        });
        gemMap.centerOnArea(response[0].area);

        if (externalRender.current) {
          externalRender.current.onNotifyCustom = data2 => {
            if (data2 === 2) {
              updatePins();
            }
          };
        }
        setMarkersState('added');
        showMessage('Markers added successfully!');
      })
      .catch(err => {
        console.error(err);
        setMarkersState('idle');
        showMessage('Error loading markers.');
      });
  };

  return (
    <View style={styles.root} onLayout={onLayout}>
      <StatusBar barStyle="dark-content" />
      <GLView
        style={StyleSheet.absoluteFill}
        apiToken={GEMKIT_TOKEN || undefined}
        onMapReady={event => {
          if (event.gemMap) {
            setGemMap(event.gemMap);
            externalRender.current = new ExternalRendererMarkers();
            setStatus('Map Ready');
          }
        }}
      />
      {/* App-owned pins tracking the map (the RN PinManager). */}
      {pins.map(pin => (
        <View
          key={pin.id}
          pointerEvents="none"
          style={[
            styles.pin,
            {
              left: pin.nx * size.current.width,
              top: pin.ny * size.current.height,
            },
          ]}>
          <Text style={styles.pinGlyph}>📍</Text>
        </View>
      ))}
      <SafeAreaView style={styles.safeOverlay} pointerEvents="box-none">
        <View style={styles.card}>
          <Text style={styles.header}>External Markers</Text>
          <TouchableOpacity
            style={[
              styles.btn,
              styles.btnBlue,
              (!gemMap || markersState !== 'idle') && styles.btnDisabled,
            ]}
            onPress={addMarkers}
            disabled={!gemMap || markersState !== 'idle'}>
            <Text style={styles.btnText}>Add Markers</Text>
          </TouchableOpacity>
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
  btn: {paddingHorizontal: 16, paddingVertical: 10, borderRadius: 8},
  btnDisabled: {opacity: 0.5},
  btnText: {color: '#fff', fontWeight: '600'},
  btnBlue: {backgroundColor: '#007bff'},
  status: {marginTop: 10, color: '#333', textAlign: 'center'},
  pin: {
    position: 'absolute',
    width: 40,
    height: 40,
    // Anchor the glyph at its bottom-center on the reported point.
    marginLeft: -20,
    marginTop: -40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pinGlyph: {fontSize: 30},
});
