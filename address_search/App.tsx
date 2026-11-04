// SPDX-FileCopyrightText: 2025-2026 Magic Lane International B.V. <info@magiclane.com>
// SPDX-License-Identifier: Apache-2.0
//
// Contact Magic Lane at <info@magiclane.com> for SDK licensing options.

// This app performs a hierarchical guided address search (country -> city ->
// street -> house number) with GuidedAddressSearchService, then highlights and
// centers on the result.

import React, {useState} from 'react';
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
  Landmark,
  AddressDetailLevel,
  GemError,
  AnimationType,
  GuidedAddressSearchService,
  GemAnimation,
} from '@magiclane/maps-sdk';
import {GLView} from '@magiclane/maps-sdk-react-native';

// Optional: a token from https://developer.magiclane.com removes the watermark
// and unlocks full functionality. The map renders without one.
const GEMKIT_TOKEN = '';

type Step = {label: string; value: string};

// Address search helper: resolves one detail level under a parent landmark.
function searchAddress(
  text: string,
  landmark: Landmark,
  detailLevel: AddressDetailLevel,
): Promise<Landmark | null> {
  return new Promise(resolve => {
    GuidedAddressSearchService.search(
      text,
      landmark,
      detailLevel,
      (err: GemError, results: Landmark[]) => {
        if (
          (err !== GemError.success && err !== GemError.reducedResult) ||
          !results ||
          results.length === 0
        ) {
          resolve(null);
        } else {
          resolve(results[0]);
        }
      },
    );
  });
}

export default function App() {
  const [gemMap, setGemMap] = useState<any>(null);
  const [status, setStatus] = useState('Loading map…');
  const [steps, setSteps] = useState<Step[]>([]);
  const [busy, setBusy] = useState(false);

  // Highlight and center on a landmark (same SDK calls as the web demo).
  const presentLandmark = (landmark: Landmark) => {
    if (!gemMap) {
      return;
    }
    gemMap.activateHighlight([landmark]);
    const animation = new GemAnimation({type: AnimationType.linear});
    gemMap.centerOnCoordinates(landmark.coordinates, {zoomLevel: 50, animation});
  };

  // Main search logic: Spain -> Barcelona -> Carrer de Mallorca -> 401.
  const onSearch = async () => {
    if (!gemMap || busy) {
      return;
    }
    setBusy(true);
    setSteps([]);
    setStatus('Search is in progress…');

    // 1. Country: Spain
    const countryLandmark = GuidedAddressSearchService.getCountryLevelItem('ESP');
    if (!countryLandmark) {
      setStatus('Country not found.');
      setBusy(false);
      return;
    }
    const found: Step[] = [{label: 'Country', value: countryLandmark.name}];
    setSteps([...found]);

    // 2. City: Barcelona
    const cityLandmark = await searchAddress(
      'Barcelona',
      countryLandmark,
      AddressDetailLevel.city,
    );
    if (!cityLandmark) {
      setStatus('City not found.');
      setBusy(false);
      return;
    }
    found.push({label: 'City', value: cityLandmark.name});
    setSteps([...found]);

    // 3. Street: Carrer de Mallorca
    const streetLandmark = await searchAddress(
      'Carrer de Mallorca',
      cityLandmark,
      AddressDetailLevel.street,
    );
    if (!streetLandmark) {
      setStatus('Street not found.');
      setBusy(false);
      return;
    }
    found.push({label: 'Street', value: streetLandmark.name});
    setSteps([...found]);

    // 4. House number: 401
    const houseNumberLandmark = await searchAddress(
      '401',
      streetLandmark,
      AddressDetailLevel.houseNumber,
    );
    if (!houseNumberLandmark) {
      setStatus('House number not found.');
      setBusy(false);
      return;
    }
    found.push({label: 'House number', value: houseNumberLandmark.name});
    setSteps([...found]);

    presentLandmark(houseNumberLandmark);
    setStatus('Search complete!');
    setBusy(false);
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
          <Text style={styles.header}>Address Search</Text>
          <TouchableOpacity
            style={[styles.btnPurple, (!gemMap || busy) && styles.btnDisabled]}
            onPress={onSearch}
            disabled={!gemMap || busy}>
            <Text style={styles.btnText}>Search Address</Text>
          </TouchableOpacity>
          {steps.length > 0 ? (
            <ScrollView style={styles.list}>
              {steps.map(s => (
                <View key={s.label} style={styles.resultItem}>
                  <Text style={styles.resultLabel}>{s.label}</Text>
                  <Text style={styles.resultValue}>{s.value}</Text>
                </View>
              ))}
            </ScrollView>
          ) : null}
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
    alignItems: 'stretch',
  },
  header: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 12,
    color: '#333',
    textAlign: 'center',
  },
  list: {marginTop: 12, maxHeight: 200},
  resultItem: {
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#eee',
  },
  resultLabel: {
    fontSize: 11,
    textTransform: 'uppercase',
    color: '#888',
    fontWeight: '600',
  },
  resultValue: {fontSize: 15, color: '#333', fontWeight: '600'},
  status: {marginTop: 10, color: '#333', textAlign: 'center'},
  btnText: {color: '#fff', fontWeight: '600', textAlign: 'center'},
  btnPurple: {
    backgroundColor: '#673ab7',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
  },
  btnDisabled: {opacity: 0.5},
});
