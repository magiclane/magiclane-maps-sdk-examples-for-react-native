// SPDX-FileCopyrightText: 2025-2026 Magic Lane International B.V. <info@magiclane.com>
// SPDX-License-Identifier: Apache-2.0
//
// Contact Magic Lane at <info@magiclane.com> for SDK licensing options.

// This app searches around a user-entered latitude/longitude with
// SearchService.searchAroundPosition and lists the results; tapping one
// highlights and centers the map on it.

import React, {useState} from 'react';
import {
  View,
  Text,
  StyleSheet,
  StatusBar,
  TextInput,
  TouchableOpacity,
  FlatList,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {
  Coordinates,
  Landmark,
  SearchPreferences,
  SearchService,
  GemError,
  HighlightRenderSettings,
  HighlightOptions,
  AddressField,
  GemIcon,
} from '@magiclane/maps-sdk';
import {GLView} from '@magiclane/maps-sdk-react-native';

// Optional: a token from https://developer.magiclane.com removes the watermark
// and unlocks full functionality. The map renders without one.
const GEMKIT_TOKEN = '';

function getAddress(landmark: Landmark): string {
  try {
    const addressInfo = landmark.address;
    const street = addressInfo.getField(AddressField.streetName) || '';
    const city = addressInfo.getField(AddressField.city) || '';
    if (!street && !city) {
      return 'Address not available';
    }
    return [street, city].filter(Boolean).join(', ');
  } catch {
    return '';
  }
}

function formatDistance(landmark: Landmark, center: Coordinates): string {
  try {
    if (landmark.coordinates) {
      const km = center.distance(landmark.coordinates) / 1000;
      return `${km.toFixed(1)} km`;
    }
  } catch {}
  return '';
}

export default function App() {
  const [gemMap, setGemMap] = useState<any>(null);
  const [status, setStatus] = useState('Loading map…');
  const [lat, setLat] = useState('48.85');
  const [lng, setLng] = useState('2.35');
  const [results, setResults] = useState<Landmark[]>([]);
  const [center, setCenter] = useState<Coordinates | null>(null);

  const performSearch = () => {
    if (!gemMap) {
      return;
    }
    const latitude = parseFloat(lat);
    const longitude = parseFloat(lng);
    if (isNaN(latitude) || isNaN(longitude)) {
      setStatus('Invalid latitude or longitude');
      return;
    }

    setStatus('Searching…');
    const coords = Coordinates.fromLatLong(latitude, longitude);
    setCenter(coords);

    const preferences = SearchPreferences.create({
      maxMatches: 40,
      allowFuzzyResults: true,
    });

    SearchService.searchAroundPosition({
      position: coords,
      preferences,
      onCompleteCallback: (err: GemError, found: Landmark[]) => {
        if (err !== GemError.success && err !== GemError.reducedResult) {
          setResults([]);
          setStatus('No results found');
          return;
        }
        setResults(found);
        setStatus(`${found.length} results`);
      },
    });
  };

  const selectResult = (landmark: Landmark) => {
    if (!gemMap) {
      return;
    }
    try {
      const renderSettings = new HighlightRenderSettings({
        options: new Set([HighlightOptions.showLandmark]),
      });
      try {
        landmark.setImageFromIcon(GemIcon.searchResultsPin);
      } catch {}
      gemMap.activateHighlight([landmark], {renderSettings});
    } catch {
      gemMap.activateHighlight([landmark]);
    }
    if (landmark.coordinates) {
      gemMap.centerOnCoordinates(landmark.coordinates, {zoomLevel: 70});
    }
    setStatus(`Selected: ${landmark.name}`);
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
            setStatus('Map Ready');
          }
        }}
      />
      <SafeAreaView style={styles.safeOverlay} pointerEvents="box-none">
        <View style={styles.card}>
          <Text style={styles.header}>Search Location</Text>
          <View style={styles.row}>
            <TextInput
              style={styles.input}
              placeholder="Latitude"
              placeholderTextColor="#999"
              keyboardType="numbers-and-punctuation"
              value={lat}
              onChangeText={setLat}
            />
            <TextInput
              style={styles.input}
              placeholder="Longitude"
              placeholderTextColor="#999"
              keyboardType="numbers-and-punctuation"
              value={lng}
              onChangeText={setLng}
            />
          </View>
          <TouchableOpacity
            style={[styles.btnPurple, !gemMap && styles.btnDisabled]}
            onPress={performSearch}
            disabled={!gemMap}>
            <Text style={styles.btnText}>Search</Text>
          </TouchableOpacity>
          <Text style={styles.status}>{status}</Text>
          {results.length > 0 ? (
            <FlatList
              style={styles.list}
              data={results}
              keyExtractor={(_, i) => String(i)}
              renderItem={({item}) => (
                <TouchableOpacity
                  style={styles.resultItem}
                  onPress={() => selectResult(item)}>
                  <Text style={styles.resultName} numberOfLines={1}>
                    {item.name || 'Unknown Location'}
                  </Text>
                  <Text style={styles.resultAddr} numberOfLines={1}>
                    {center ? `${formatDistance(item, center)} • ` : ''}
                    {getAddress(item)}
                  </Text>
                </TouchableOpacity>
              )}
            />
          ) : null}
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {flex: 1, backgroundColor: '#000'},
  safeOverlay: {position: 'absolute', top: 0, left: 0, right: 0, bottom: 0},
  card: {
    margin: 12,
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    elevation: 5,
    maxHeight: '80%',
  },
  header: {fontSize: 18, fontWeight: '700', marginBottom: 12, color: '#333'},
  row: {flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8},
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 15,
    color: '#333',
  },
  list: {marginTop: 12},
  resultItem: {
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#eee',
  },
  resultName: {fontSize: 14, fontWeight: '600', color: '#333'},
  resultAddr: {fontSize: 12, color: '#666', marginTop: 2},
  status: {marginTop: 10, color: '#333'},
  btnText: {color: '#fff', fontWeight: '600', textAlign: 'center'},
  btnPurple: {
    backgroundColor: '#673ab7',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
  },
  btnDisabled: {opacity: 0.5},
});
