// SPDX-FileCopyrightText: 2025-2026 Magic Lane International B.V. <info@magiclane.com>
// SPDX-License-Identifier: Apache-2.0
//
// Contact Magic Lane at <info@magiclane.com> for SDK licensing options.

// This app runs a free text search around the center of the current map view
// with SearchService, then lists the results; tapping one highlights and
// centers the map on it.

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
  Landmark,
  HighlightRenderSettings,
  SearchService,
  SearchPreferences,
  GemError,
  AddressField,
  HighlightOptions,
  GemIcon,
} from '@magiclane/maps-sdk';
import {GLView} from '@magiclane/maps-sdk-react-native';

// Optional: a token from https://developer.magiclane.com removes the watermark
// and unlocks full functionality. The map renders without one.
const GEMKIT_TOKEN = '';

// Compose a short street/city/country address line from a landmark.
function getAddress(landmark: Landmark): string {
  try {
    const addressInfo = landmark.address;
    const street = addressInfo.getField(AddressField.streetName) || '';
    const city = addressInfo.getField(AddressField.city) || '';
    const country = addressInfo.getField(AddressField.country) || '';
    return [street, city, country].filter(Boolean).join(', ');
  } catch {
    return '';
  }
}

export default function App() {
  const [gemMap, setGemMap] = useState<any>(null);
  const [status, setStatus] = useState('Loading map…');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Landmark[]>([]);
  const [searching, setSearching] = useState(false);

  const performSearch = () => {
    const text = query.trim();
    if (!text || !gemMap) {
      return;
    }

    // Reference position = center of the current map view (physical pixels).
    let coordinates;
    try {
      const {x, y} = gemMap.viewportCenter;
      coordinates = gemMap.transformScreenToWgs({x: Math.floor(x), y: Math.floor(y)});
    } catch {}
    if (!coordinates) {
      setStatus('Map not ready.');
      return;
    }

    setSearching(true);
    setStatus('Searching…');

    const preferences = SearchPreferences.create({
      maxMatches: 40,
      searchAddresses: true,
      searchMapPOIs: true,
    });

    SearchService.search({
      textFilter: text,
      referenceCoordinates: coordinates,
      preferences,
      onCompleteCallback: (err: GemError, found: Landmark[]) => {
        setSearching(false);
        if ((err !== GemError.success && err !== GemError.reducedResult) || !found) {
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
    // Close the list so the map shows the selected place.
    setResults([]);
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
          <Text style={styles.header}>Text Search</Text>
          <View style={styles.row}>
            <TextInput
              style={styles.input}
              placeholder="Search places…"
              placeholderTextColor="#999"
              value={query}
              onChangeText={setQuery}
              onSubmitEditing={performSearch}
              returnKeyType="search"
            />
            <TouchableOpacity
              style={[styles.btnPurple, (!gemMap || searching) && styles.btnDisabled]}
              onPress={performSearch}
              disabled={!gemMap || searching}>
              <Text style={styles.btnText}>Go</Text>
            </TouchableOpacity>
          </View>
          <Text style={styles.status}>{status}</Text>
          {results.length > 0 ? (
            <FlatList
              // A tap on a result selects it even while the keyboard is up
              // (by default the first tap only closes the keyboard).
              keyboardShouldPersistTaps="handled"
              style={styles.list}
              data={results}
              keyExtractor={(_, i) => String(i)}
              renderItem={({item}) => (
                <TouchableOpacity
                  style={styles.resultItem}
                  onPress={() => selectResult(item)}>
                  <Text style={styles.resultName} numberOfLines={1}>
                    {item.name || 'Unnamed location'}
                  </Text>
                  <Text style={styles.resultAddr} numberOfLines={1}>
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
  row: {flexDirection: 'row', alignItems: 'center', gap: 8},
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
  btnText: {color: '#fff', fontWeight: '600'},
  btnPurple: {
    backgroundColor: '#673ab7',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
  },
  btnDisabled: {opacity: 0.5},
});
