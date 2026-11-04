// SPDX-FileCopyrightText: 2025-2026 Magic Lane International B.V. <info@magiclane.com>
// SPDX-License-Identifier: Apache-2.0
//
// Contact Magic Lane at <info@magiclane.com> for SDK licensing options.

// This app filters a POI search around the center of the current map view by
// one or more generic categories (restaurant, hotel, …) and an optional text
// filter, then lists the results; tapping one highlights and centers the map on
// it.

import React, {useState} from 'react';
import {
  View,
  Text,
  StyleSheet,
  StatusBar,
  TextInput,
  TouchableOpacity,
  FlatList,
  ScrollView,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {
  Landmark,
  LandmarkCategory,
  SearchPreferences,
  SearchService,
  GemError,
  HighlightRenderSettings,
  HighlightOptions,
  AddressField,
  GemIcon,
  GenericCategories,
  Coordinates,
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
      return '';
    }
    return [street, city].filter(Boolean).join(', ');
  } catch {
    return '';
  }
}

function formatDistance(landmark: Landmark, center: Coordinates | null): string {
  try {
    if (center && landmark.coordinates) {
      const km = center.distance(landmark.coordinates) / 1000;
      return `${km.toFixed(1)} km`;
    }
  } catch {}
  return '';
}

export default function App() {
  const [gemMap, setGemMap] = useState<any>(null);
  const [status, setStatus] = useState('Loading map…');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Landmark[]>([]);
  const [center, setCenter] = useState<Coordinates | null>(null);
  const [categories, setCategories] = useState<LandmarkCategory[]>([]);
  const [selected, setSelected] = useState<LandmarkCategory[]>([]);

  const loadCategories = () => {
    try {
      setCategories(GenericCategories.categories || []);
    } catch {
      setCategories([]);
    }
  };

  const toggleCategory = (cat: LandmarkCategory) => {
    setSelected(prev =>
      prev.includes(cat) ? prev.filter(c => c !== cat) : [...prev, cat],
    );
  };

  const performSearch = () => {
    if (!gemMap) {
      return;
    }

    // Reference position = center of the current map view (physical pixels).
    let coords;
    try {
      const {x, y} = gemMap.viewportCenter;
      coords = gemMap.transformScreenToWgs({x: Math.floor(x), y: Math.floor(y)});
    } catch {}
    if (!coords) {
      setStatus('Map not ready.');
      return;
    }
    setCenter(coords);
    setStatus('Searching…');

    const preferences = SearchPreferences.create({
      maxMatches: 40,
      allowFuzzyResults: true,
      searchMapPOIs: true,
      searchAddresses: false,
    });

    // Restrict the search to the selected generic categories. A category that
    // cannot be added would silently widen the search, so stop and say so.
    const notAdded = selected.filter(
      cat =>
        preferences.landmarks.addStoreCategoryId(cat.landmarkStoreId, cat.id) !==
        GemError.success,
    );
    if (notAdded.length > 0) {
      setStatus(`Could not filter by ${notAdded.map(c => c.name).join(', ')}.`);
      return;
    }

    SearchService.searchAroundPosition({
      position: coords,
      preferences,
      textFilter: query.trim(),
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
            loadCategories();
          }
        }}
      />
      <SafeAreaView style={styles.safeOverlay} pointerEvents="box-none">
        <View style={styles.card}>
          <Text style={styles.header}>Search Category</Text>
          <View style={styles.row}>
            <TextInput
              style={styles.input}
              placeholder="e.g. restaurant, hotel…"
              placeholderTextColor="#999"
              value={query}
              onChangeText={setQuery}
              onSubmitEditing={performSearch}
              returnKeyType="search"
            />
            <TouchableOpacity
              style={[styles.btnPurple, !gemMap && styles.btnDisabled]}
              onPress={performSearch}
              disabled={!gemMap}>
              <Text style={styles.btnText}>Search</Text>
            </TouchableOpacity>
          </View>

          {categories.length > 0 ? (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.chips}
              contentContainerStyle={styles.chipsContent}>
              {categories.map(cat => {
                const active = selected.includes(cat);
                return (
                  <TouchableOpacity
                    key={cat.id}
                    style={[styles.chip, active && styles.chipActive]}
                    onPress={() => toggleCategory(cat)}>
                    <Text
                      style={[styles.chipText, active && styles.chipTextActive]}>
                      {cat.name}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          ) : null}

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
                    {item.name || 'Unknown'}
                  </Text>
                  <Text style={styles.resultAddr} numberOfLines={1}>
                    {formatDistance(item, center)}
                    {getAddress(item) ? ` • ${getAddress(item)}` : ''}
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
    maxHeight: '85%',
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
  // The row keeps its own height: a horizontal ScrollView may otherwise shrink
  // under the results list until the chips are cut in half.
  chips: {marginTop: 12, flexGrow: 0, flexShrink: 0},
  chipsContent: {gap: 8, alignItems: 'center'},
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#ddd',
    backgroundColor: '#fff',
  },
  chipActive: {borderColor: '#673ab7', backgroundColor: '#ede7f6'},
  chipText: {fontSize: 13, color: '#555'},
  chipTextActive: {color: '#673ab7', fontWeight: '600'},
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
