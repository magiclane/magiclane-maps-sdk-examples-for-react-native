// SPDX-FileCopyrightText: 2025-2026 Magic Lane International B.V. <info@magiclane.com>
// SPDX-License-Identifier: Apache-2.0
//
// Contact Magic Lane at <info@magiclane.com> for SDK licensing options.

// This app follows the live GPS position, records a DriverBehaviour analysis
// over a live data source, and then shows the recorded trip analyses (distance,
// speeding, harsh events, risk scores) in a modal.

import React, {useCallback, useRef, useState} from 'react';
import {
  View,
  Text,
  StyleSheet,
  StatusBar,
  Modal,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {
  PositionService,
  DataSource,
  DriverBehaviour,
  DriverBehaviourAnalysis,
  GemAnimation,
  AnimationType,
  GemError,
} from '@magiclane/maps-sdk';
import {GLView} from '@magiclane/maps-sdk-react-native';

// A token from https://developer.magiclane.com removes the watermark and unlocks
// full functionality. The map renders without one.
const GEMKIT_TOKEN = '';

export default function DriverBehaviourDemo() {
  const [gemMap, setGemMap] = useState<any>(null);
  const [status, setStatus] = useState('Map loading…');
  const [hasLiveDataSource, setHasLiveDataSource] = useState(false);
  const [isAnalysing, setIsAnalysing] = useState(false);
  const [analyses, setAnalyses] = useState<DriverBehaviourAnalysis[]>([]);
  const [modalVisible, setModalVisible] = useState(false);
  const driverBehaviour = useRef<DriverBehaviour | null>(null);

  const onFollowPosition = useCallback(async () => {
    if (!gemMap) {
      setStatus('Map not ready yet');
      return;
    }
    // Shows the Android/iOS location-permission dialog (only the first time);
    // the live data source, and so the analysis, needs the permission.
    const permission = await PositionService.requestLocationPermission();
    if (!permission) {
      setStatus('Location permission denied. Allow it in the system settings.');
      return;
    }
    if (!hasLiveDataSource) {
      // GemError.exist: the live data source is already the current one.
      const err = PositionService.instance.setLiveDataSource();
      if (err !== GemError.success && err !== GemError.exist) {
        setStatus(`Could not start the live position (error ${err}).`);
        return;
      }
      setHasLiveDataSource(true);
    }
    const animation = new GemAnimation({type: AnimationType.linear});
    gemMap.startFollowingPosition({animation});
    setStatus('Following position…');
  }, [gemMap, hasLiveDataSource]);

  const onStartAnalysis = useCallback(() => {
    const liveDataSource = DataSource.createLiveDataSource();
    if (!liveDataSource) {
      setStatus('Creating a data source failed.');
      return;
    }
    driverBehaviour.current = new DriverBehaviour(liveDataSource, true);
    const ok = driverBehaviour.current.startAnalysis();
    if (!ok) {
      setStatus('Starting analysis failed.');
    } else {
      setIsAnalysing(true);
      setStatus('Recording driver behaviour…');
    }
  }, []);

  const onStopAnalysis = useCallback(() => {
    if (!driverBehaviour.current) {
      return;
    }
    driverBehaviour.current.stopAnalysis();
    setAnalyses(driverBehaviour.current.getAllDriverBehaviourAnalyses());
    setIsAnalysing(false);
    setStatus('Analysis stopped.');
  }, []);

  return (
    <View style={styles.root}>
      <StatusBar barStyle="dark-content" />
      <GLView
        style={StyleSheet.absoluteFill}
        apiToken={GEMKIT_TOKEN || undefined}
        onMapReady={event => {
          if (event.gemMap) {
            setGemMap(event.gemMap);
            setStatus('Map ready');
          }
        }}
      />
      <SafeAreaView style={styles.safeOverlay} pointerEvents="box-none">
        <View style={styles.card}>
          <Text style={styles.header}>Driver Behaviour</Text>
          <View style={styles.row}>
            <TouchableOpacity style={styles.btnPurple} onPress={onFollowPosition}>
              <Text style={styles.btnText}>Follow Position</Text>
            </TouchableOpacity>
            {hasLiveDataSource && !isAnalysing && (
              <TouchableOpacity style={styles.btnRed} onPress={onStartAnalysis}>
                <Text style={styles.btnText}>Start Analysis</Text>
              </TouchableOpacity>
            )}
            {isAnalysing && (
              <TouchableOpacity style={styles.btnAmber} onPress={onStopAnalysis}>
                <Text style={styles.btnText}>Stop Analysis</Text>
              </TouchableOpacity>
            )}
          </View>
          {analyses.length > 0 && (
            <TouchableOpacity style={styles.btnBlue} onPress={() => setModalVisible(true)}>
              <Text style={styles.btnText}>View Analysis ({analyses.length})</Text>
            </TouchableOpacity>
          )}
          <Text style={styles.status}>{status}</Text>
        </View>
      </SafeAreaView>

      <Modal
        visible={modalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setModalVisible(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Analyses</Text>
              <TouchableOpacity onPress={() => setModalVisible(false)}>
                <Text style={styles.closeText}>✕</Text>
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.list}>
              {analyses.length === 0 ? (
                <Text style={styles.empty}>No analyses recorded</Text>
              ) : (
                analyses.map((a, i) => {
                  if (!a.isValid) {
                    return (
                      <View style={styles.trip} key={i}>
                        <Text style={styles.tripTitle}>Trip {i + 1}: invalid analysis</Text>
                      </View>
                    );
                  }
                  const dur = ((a.finishTime - a.startTime) / 1000 / 60).toFixed(1);
                  return (
                    <View style={styles.trip} key={i}>
                      <Text style={styles.tripTitle}>Trip {i + 1}</Text>
                      <Text style={styles.tripLine}>Duration: {dur} min</Text>
                      <Text style={styles.tripLine}>
                        Distance: {a.kilometersDriven?.toFixed(2)} km
                      </Text>
                      <Text style={styles.tripLine}>
                        Driving time: {a.minutesDriven?.toFixed(1)} min
                      </Text>
                      <Text style={styles.tripLine}>
                        Speeding: {a.minutesSpeeding?.toFixed(1)} min
                      </Text>
                      <Text style={styles.tripLine}>
                        Risk (mean speed): {Math.round(a.riskRelatedToMeanSpeed * 100)}%
                      </Text>
                      <Text style={styles.tripLine}>
                        Risk (speed var): {Math.round(a.riskRelatedToSpeedVariation * 100)}%
                      </Text>
                      <Text style={styles.tripLine}>
                        Harsh accel: {a.numberOfHarshAccelerationEvents}
                      </Text>
                      <Text style={styles.tripLine}>
                        Harsh braking: {a.numberOfHarshBrakingEvents}
                      </Text>
                      <Text style={styles.tripLine}>Cornering: {a.numberOfCorneringEvents}</Text>
                      <Text style={styles.tripLine}>Swerving: {a.numberOfSwervingEvents}</Text>
                      <Text style={styles.tripLine}>
                        Ignored stops: {a.numberOfIgnoredStopSigns}
                      </Text>
                      <Text style={styles.tripLine}>
                        Stop signs: {a.numberOfEncounteredStopSigns}
                      </Text>
                    </View>
                  );
                })
              )}
            </ScrollView>
            <TouchableOpacity style={styles.closeBtn} onPress={() => setModalVisible(false)}>
              <Text style={styles.btnText}>Close</Text>
            </TouchableOpacity>
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
  row: {flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center'},
  status: {marginTop: 10, color: '#333', textAlign: 'center'},
  btnText: {color: '#fff', fontWeight: '600'},
  btnPurple: {backgroundColor: '#673ab7', paddingHorizontal: 14, paddingVertical: 10, borderRadius: 8},
  btnRed: {backgroundColor: '#e53935', paddingHorizontal: 14, paddingVertical: 10, borderRadius: 8},
  btnAmber: {backgroundColor: '#fbc02d', paddingHorizontal: 14, paddingVertical: 10, borderRadius: 8},
  btnBlue: {backgroundColor: '#2196f3', paddingHorizontal: 14, paddingVertical: 10, borderRadius: 8, marginTop: 10},
  modalBackdrop: {flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 16},
  modalContent: {backgroundColor: '#fff', borderRadius: 12, maxHeight: '80%', padding: 16},
  modalHeader: {flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8},
  modalTitle: {fontSize: 20, fontWeight: '700', color: '#333'},
  closeText: {fontSize: 20, color: '#666'},
  list: {flexGrow: 0},
  empty: {padding: 20, textAlign: 'center', color: '#666'},
  trip: {marginBottom: 16, borderBottomWidth: 1, borderBottomColor: '#eee', paddingBottom: 12},
  tripTitle: {fontWeight: '700', color: '#333', marginBottom: 6},
  tripLine: {color: '#444', fontSize: 13, marginBottom: 2},
  closeBtn: {backgroundColor: '#673ab7', borderRadius: 8, paddingVertical: 10, alignItems: 'center', marginTop: 12},
});
