// SPDX-FileCopyrightText: 2025-2026 Magic Lane International B.V. <info@magiclane.com>
// SPDX-License-Identifier: Apache-2.0
//
// Contact Magic Lane at <info@magiclane.com> for SDK licensing options.

// Calculates a route, simulates navigation along it and plays the turn-by-turn
// instructions with the first human voice found on the device.

import React, { useState, useCallback, useRef } from 'react';
import {
	View,
	Text,
	StyleSheet,
	StatusBar,
	TouchableOpacity,
	Image,
	ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
	SdkSettings,
	ContentStore,
	ContentType,
	Landmark,
	Route,
	RoutePreferences,
	RoutingService,
	NavigationService,
	NavigationInstruction,
	GemError,
	SoundPlayingService,
} from '@magiclane/maps-sdk';
import { GLView, MagicLaneReactNativeSDK } from '@magiclane/maps-sdk-react-native';


// A token from https://developer.magiclane.com is required for online routing
// and to download human voices. Paste yours here (or wire it in from a local,
// gitignored file) - never commit a real token to source.
const GEMKIT_TOKEN = '';

const DEPARTURE = { latitude: 48.87586, longitude: 2.30311 };
const INTERMEDIARY = { latitude: 48.87422, longitude: 2.29952 };
const DESTINATION = { latitude: 48.87361, longitude: 2.29513 };

const HumanVoicesDemo: React.FC = () => {
	const [gemMap, setGemMap] = useState<any>(null);
	const [routes, setRoutes] = useState<Route[] | null>(null);
	const [routingHandler, setRoutingHandler] = useState<any>(null);
	const [currentInstruction, setCurrentInstruction] = useState<NavigationInstruction | null>(null);
	const [areRoutesBuilt, setAreRoutesBuilt] = useState(false);
	const [isSimulationActive, setIsSimulationActive] = useState(false);
	const [statusMsg, setStatusMsg] = useState('');
	const [initialized, setInitialized] = useState(false);
	const [initError, setInitError] = useState<string | null>(null);
	// Routing needs current map data, which the SDK updates right after
	// start-up. Set once the map is shown and that data is ready.
	const [mapDataReady, setMapDataReady] = useState(false);
	React.useEffect(() => {
		if (!gemMap) {
			return;
		}
		let active = true;
		SdkSettings.whenMapDataReady().then((ready) => {
			if (active && ready) {
				setMapDataReady(true);
			}
		});
		return () => {
			active = false;
		};
	}, [gemMap]);
	// Refs, not state: the navigation callbacks are created once per start and
	// must see the current handler when they fire later.
	const navigationHandlerRef = useRef<any>(null);
	const messageTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	React.useEffect(() => {
		let mounted = true;
		// One-call SDK init (idempotent; <GLView> calls it too).
		MagicLaneReactNativeSDK.init({ authorization: GEMKIT_TOKEN || undefined })
			.then(() => {
				const voices = ContentStore.getLocalContentList(ContentType.humanVoice);
				if (voices && voices.length > 0) {
					SdkSettings.setVoiceByPath(voices[0].fileName);
				}
				if (mounted) setInitialized(true);
			})
			.catch((e) => {
				console.error(e);
				if (mounted) setInitError('Failed to initialize GemKit.');
			});
		return () => {
			mounted = false;
			if (messageTimerRef.current) clearTimeout(messageTimerRef.current);
			if (navigationHandlerRef.current) {
				NavigationService.cancelNavigation(navigationHandlerRef.current);
				navigationHandlerRef.current = null;
			}
		};
	}, []);

	const showMessage = useCallback((message: string, duration = 3000) => {
		setStatusMsg(message);
		if (messageTimerRef.current) clearTimeout(messageTimerRef.current);
		messageTimerRef.current = setTimeout(() => setStatusMsg(''), duration);
	}, []);

	const convertDistance = useCallback((meters: number): string => {
		if (meters >= 1000) {
			const kilometers = meters / 1000;
			return `${kilometers.toFixed(1)} km`;
		}
		return `${Math.round(meters)} m`;
	}, []);

	const convertDuration = useCallback((seconds: number): string => {
		const hours = Math.floor(seconds / 3600);
		const minutes = Math.floor((seconds % 3600) / 60);
		const hoursText = hours > 0 ? `${hours} h ` : '';
		const minutesText = `${minutes} min`;
		return hoursText + minutesText;
	}, []);

	const getCurrentTime = useCallback(
		({ additionalHours = 0, additionalMinutes = 0, additionalSeconds = 0 } = {}): string => {
			const now = new Date();
			const updatedTime = new Date(
				now.getTime() +
					additionalHours * 3600000 +
					additionalMinutes * 60000 +
					additionalSeconds * 1000
			);
			return updatedTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
		},
		[]
	);

	const getRouteLabel = useCallback(
		(route: Route): string => {
			const timeDistance = route.getTimeDistance();
			const totalDistance =
				timeDistance.unrestrictedDistanceM + timeDistance.restrictedDistanceM;
			const totalDuration =
				timeDistance.unrestrictedTimeS + timeDistance.restrictedTimeS;
			return `${convertDistance(totalDistance)}\n${convertDuration(totalDuration)}`;
		},
		[convertDistance, convertDuration]
	);

	const getFormattedDistanceToNextTurn = (instruction: NavigationInstruction): string => {
		const td = instruction.timeDistanceToNextTurn;
		const totalDistance = td.unrestrictedDistanceM + td.restrictedDistanceM;
		return convertDistance(totalDistance);
	};

	const getFormattedRemainingDistance = (instruction: NavigationInstruction): string => {
		const td = instruction.remainingTravelTimeDistance;
		const totalDistance = td.unrestrictedDistanceM + td.restrictedDistanceM;
		return convertDistance(totalDistance);
	};

	const getFormattedRemainingDuration = (instruction: NavigationInstruction): string => {
		const td = instruction.remainingTravelTimeDistance;
		const totalDuration = td.unrestrictedTimeS + td.restrictedTimeS;
		return convertDuration(totalDuration);
	};

	const getFormattedETA = (instruction: NavigationInstruction): string => {
		const td = instruction.remainingTravelTimeDistance;
		const totalDuration = td.unrestrictedTimeS + td.restrictedTimeS;
		return getCurrentTime({ additionalSeconds: totalDuration });
	};

	const buildRoute = useCallback(() => {
		if (!gemMap || routingHandler) return;
		try {
			const departureLandmark = Landmark.withLatLng(DEPARTURE);
			const intermediaryLandmark = Landmark.withLatLng(INTERMEDIARY);
			const destinationLandmark = Landmark.withLatLng(DESTINATION);
			const routePreferences = new RoutePreferences({});

			showMessage('The route is calculating.');
			const handler = RoutingService.calculateRoute(
				[departureLandmark, intermediaryLandmark, destinationLandmark],
				routePreferences,
				(err: GemError, calculatedRoutes: Route[]) => {
					setRoutingHandler(null);
					if (err === GemError.success && calculatedRoutes && calculatedRoutes.length > 0) {
						setRoutes(calculatedRoutes);
						const routesMap = gemMap.preferences.routes;
						calculatedRoutes.forEach((route, index) => {
							routesMap.add(route, index === 0, { label: getRouteLabel(route) });
						});
						gemMap.centerOnRoutes({ routes: calculatedRoutes });
						setAreRoutesBuilt(true);
						showMessage('Route calculated successfully');
					} else {
						showMessage('Failed to calculate route');
					}
				}
			);
			setRoutingHandler(handler);
		} catch {
			showMessage('Failed to start route calculation');
		}
	}, [gemMap, routingHandler, showMessage, getRouteLabel]);

	const cancelRoute = useCallback(() => {
		if (gemMap?.preferences?.routes) {
			gemMap.preferences.routes.clear();
		}
		setRoutes(null);
		setAreRoutesBuilt(false);
		setCurrentInstruction(null);
	}, [gemMap]);

	const stopSimulation = useCallback(() => {
		if (navigationHandlerRef.current) {
			NavigationService.cancelNavigation(navigationHandlerRef.current);
			navigationHandlerRef.current = null;
		}
		cancelRoute();
		setIsSimulationActive(false);
	}, [cancelRoute]);

	const startSimulation = useCallback(async () => {
		if (!gemMap || !routes || !routes[0]) return;

		await gemMap.preferences.routes.clearAllButMainRoute();
		const routesMap = gemMap.preferences.routes;
		// first throws on an empty collection.
		if (routesMap.isEmpty) {
			showMessage('No main route available');
			return;
		}

		SoundPlayingService.canPlaySounds = true;

		const handler = NavigationService.startSimulation(routesMap.first, undefined, {
			onNavigationInstruction: (instruction: NavigationInstruction) => {
				setIsSimulationActive(true);
				setCurrentInstruction(instruction);
			},
			onError: (error: GemError) => {
				setIsSimulationActive(false);
				cancelRoute();
				if (error !== GemError.cancel) {
					stopSimulation();
				}
			},
		});

		navigationHandlerRef.current = handler;
		setIsSimulationActive(true);
		gemMap.startFollowingPosition();
	}, [gemMap, routes, showMessage, cancelRoute, stopSimulation]);

	const recenter = useCallback(() => {
		gemMap?.startFollowingPosition?.();
	}, [gemMap]);

	function renderInstructionPanel(instruction: NavigationInstruction) {
		let turnImage = null;
		if (instruction.getNextTurnImage) {
			const turnImageData = instruction.getNextTurnImage({ size: { width: 200, height: 200 } });
			if (!turnImageData) {
				turnImage = null;
			} else if (typeof turnImageData === 'string') {
				const strData = turnImageData as string;
				const uri = strData.startsWith('data:') ? strData : `data:image/png;base64,${strData}`;
				turnImage = <Image source={{ uri }} style={styles.turnIcon} resizeMode="contain" />;
			} else {
				let binary = '';
				const bytes = new Uint8Array(turnImageData);
				for (let i = 0; i < bytes.byteLength; i++) {
					binary += String.fromCharCode(bytes[i]);
				}
				let base64 = '';
				if ((globalThis as any).btoa) {
					base64 = (globalThis as any).btoa(binary);
				} else if ((globalThis as any).Buffer) {
					base64 = (globalThis as any).Buffer.from(bytes).toString('base64');
				} else {
					console.warn('No base64 encoding available');
				}
				if (base64) {
					turnImage = (
						<Image
							source={{ uri: `data:image/png;base64,${base64}` }}
							style={styles.turnIcon}
							resizeMode="contain"
						/>
					);
				}
			}
		}

		return (
			<View style={styles.instructionPanel}>
				<View style={styles.iconContainer}>{turnImage}</View>
				<View style={styles.infoContainer}>
					<Text style={styles.distanceText}>
						{getFormattedDistanceToNextTurn(instruction)}
					</Text>
					<Text style={styles.streetText}>
						{instruction.nextStreetName || 'Continue'}
					</Text>
				</View>
			</View>
		);
	}

	function renderBottomPanel(instruction: NavigationInstruction) {
		return (
			<View style={styles.bottomPanel}>
				<Text style={styles.panelText}>{getFormattedRemainingDuration(instruction)}</Text>
				<Text style={styles.panelText}>{getFormattedETA(instruction)}</Text>
				<Text style={styles.panelText}>{getFormattedRemainingDistance(instruction)}</Text>
			</View>
		);
	}

	return (
		<View style={styles.root}>
			<StatusBar barStyle="dark-content" />
			<GLView
				style={StyleSheet.absoluteFill}
				apiToken={GEMKIT_TOKEN || undefined}
				onMapReady={(event) => {
					if (event.gemMap) {
						setGemMap(event.gemMap);
					}
				}}
			/>
			{/* The panels are positioned within the safe area, clear of the status
			    bar and the home indicator. Absolutely positioned children ignore the
			    padding of the SafeAreaView, so they go into a view inside it. */}
			<SafeAreaView style={StyleSheet.absoluteFill} pointerEvents="box-none">
				<View style={styles.safeArea} pointerEvents="box-none">
					{isSimulationActive && (
						<View style={styles.topOverlay}>
							{currentInstruction && renderInstructionPanel(currentInstruction)}
							{/* Below the instruction panel, so they never cover it. */}
							<View style={styles.navigationButtons}>
								<TouchableOpacity style={styles.recenterButton} onPress={recenter}>
									<Text style={styles.recenterIcon}>C</Text>
									<Text style={styles.recenterText}>Recenter</Text>
								</TouchableOpacity>
								<TouchableOpacity
									style={[styles.actionButton, styles.stopButton]}
									onPress={stopSimulation}
								>
									<Text style={[styles.actionButtonText, { color: '#fff' }]}>
										Stop Navigation
									</Text>
								</TouchableOpacity>
							</View>
						</View>
					)}

					{isSimulationActive && currentInstruction && (
						<View style={styles.bottomOverlay}>
							{renderBottomPanel(currentInstruction)}
						</View>
					)}

					{!isSimulationActive && (
						<View style={styles.controlOverlay}>
							<Text style={styles.header}>Human Voices</Text>
							{!initialized && !initError && (
								<Text style={styles.subtitle}>Initializing...</Text>
							)}
							{initError && <Text style={styles.error}>{initError}</Text>}
							{initialized && (
								<Text style={styles.subtitle}>
									Build a route and start navigation to hear voice instructions
								</Text>
							)}
							{statusMsg && <Text style={styles.statusText}>{statusMsg}</Text>}

							<ScrollView style={styles.buttonContainer} showsVerticalScrollIndicator={false}>
								{!areRoutesBuilt && (
									<TouchableOpacity
										style={[
											styles.actionButton,
											styles.buildButton,
											!mapDataReady && styles.disabledButton,
										]}
										onPress={buildRoute}
										disabled={!initialized || !mapDataReady || !!routingHandler}
									>
										<Text style={[styles.actionButtonText, { color: '#fff' }]}>
											{routingHandler ? 'Calculating...' : 'Build Route'}
										</Text>
									</TouchableOpacity>
								)}

								{areRoutesBuilt && (
									<TouchableOpacity
										style={[styles.actionButton, styles.startButton]}
										onPress={startSimulation}
										disabled={!initialized}
									>
										<Text style={[styles.actionButtonText, { color: '#fff' }]}>
											Start Navigation
										</Text>
									</TouchableOpacity>
								)}
							</ScrollView>
						</View>
					)}
				</View>
			</SafeAreaView>
		</View>
	);
};

const styles = StyleSheet.create({
	root: {
		flex: 1,
		backgroundColor: '#e8e8e8',
	},
	safeArea: {
		flex: 1,
	},
	controlOverlay: {
		position: 'absolute',
		top: 20,
		left: 12,
		right: 12,
		backgroundColor: '#fff',
		borderRadius: 12,
		padding: 16,
		shadowColor: '#000',
		shadowOpacity: 0.15,
		shadowRadius: 8,
		elevation: 5,
		zIndex: 1000,
		maxHeight: '40%',
	},
	topOverlay: {
		position: 'absolute',
		top: 10,
		left: 10,
		right: 10,
		zIndex: 1000,
	},
	bottomOverlay: {
		position: 'absolute',
		bottom: 10,
		left: 10,
		right: 10,
		zIndex: 1000,
	},
	navigationButtons: {
		flexDirection: 'row',
		justifyContent: 'space-between',
		alignItems: 'center',
		marginTop: 10,
	},
	header: {
		fontSize: 18,
		fontWeight: '700',
		marginBottom: 4,
		textAlign: 'center',
		color: '#333',
	},
	subtitle: {
		fontSize: 14,
		color: '#666',
		textAlign: 'center',
		marginBottom: 12,
		fontStyle: 'italic',
	},
	error: {
		color: 'red',
		marginBottom: 8,
		textAlign: 'center',
	},
	statusText: {
		fontSize: 14,
		color: '#333',
		textAlign: 'center',
		marginBottom: 12,
		fontWeight: '500',
		backgroundColor: '#f8f9fa',
		padding: 8,
		borderRadius: 6,
	},
	buttonContainer: {
		maxHeight: 120,
		marginBottom: 12,
	},
	actionButton: {
		paddingVertical: 14,
		paddingHorizontal: 20,
		borderRadius: 8,
		marginBottom: 8,
		alignItems: 'center',
	},
	buildButton: {
		backgroundColor: '#4a148c',
	},
	disabledButton: {
		opacity: 0.5,
	},
	startButton: {
		backgroundColor: '#ff9800',
	},
	stopButton: {
		backgroundColor: '#e91e63',
		marginBottom: 0,
	},
	recenterButton: {
		backgroundColor: '#fff',
		borderRadius: 20,
		padding: 10,
		paddingHorizontal: 15,
		flexDirection: 'row',
		alignItems: 'center',
		shadowColor: '#000',
		shadowOpacity: 0.3,
		shadowRadius: 4,
		elevation: 3,
	},
	recenterIcon: {
		fontSize: 20,
		marginRight: 8,
	},
	recenterText: {
		fontSize: 16,
		fontWeight: '600',
		color: '#000',
	},
	actionButtonText: {
		color: '#333',
		fontSize: 16,
		fontWeight: '600',
	},
	instructionPanel: {
		backgroundColor: '#000',
		borderRadius: 15,
		padding: 10,
		flexDirection: 'row',
		alignItems: 'center',
		shadowColor: '#000',
		shadowOpacity: 0.5,
		shadowRadius: 7,
		elevation: 5,
	},
	iconContainer: {
		width: 100,
		height: 100,
		alignItems: 'center',
		justifyContent: 'center',
		padding: 20,
	},
	turnIcon: {
		width: 80,
		height: 80,
	},
	infoContainer: {
		marginLeft: 20,
		flex: 1,
	},
	distanceText: {
		fontSize: 25,
		fontWeight: '600',
		color: '#fff',
	},
	streetText: {
		fontSize: 20,
		fontWeight: '600',
		color: '#fff',
	},
	bottomPanel: {
		backgroundColor: '#fff',
		borderRadius: 20,
		paddingHorizontal: 15,
		paddingVertical: 10,
		flexDirection: 'row',
		alignItems: 'center',
		justifyContent: 'space-between',
		shadowColor: '#000',
		shadowOpacity: 0.3,
		shadowRadius: 7,
		elevation: 5,
	},
	panelText: {
		color: '#000',
		fontSize: 24,
		fontWeight: '500',
	},
});

export default HumanVoicesDemo;
