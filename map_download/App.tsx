// SPDX-FileCopyrightText: 2025-2026 Magic Lane International B.V. <info@magiclane.com>
// SPDX-License-Identifier: Apache-2.0
//
// Contact Magic Lane at <info@magiclane.com> for SDK licensing options.

// Lists the road maps in the content store and downloads, pauses or deletes
// them for offline use.

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
	View,
	Text,
	StyleSheet,
	StatusBar,
	TouchableOpacity,
	ScrollView,
	Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
	SdkSettings,
	ContentStore,
	ContentType,
	ContentStoreItem,
	GemError,
	ContentStoreItemStatus,
	ServiceGroupType,
} from '@magiclane/maps-sdk';
import { GLView, MagicLaneReactNativeSDK } from '@magiclane/maps-sdk-react-native';

// A token from https://developer.magiclane.com is required to list and download
// content. Paste yours here (or wire it in from a local, gitignored file) -
// never commit a real token to source.
const GEMKIT_TOKEN = '';

// How often loadMaps asks again, one second apart, while the store answers busy.
const MAX_BUSY_RETRIES = 10;

interface MapItemProps {
	mapItem: ContentStoreItem;
	onUpdate: () => void;
}

const MapItem: React.FC<MapItemProps> = ({ mapItem, onUpdate }) => {
	const [progress, setProgress] = useState(mapItem.downloadProgress);
	const [status, setStatus] = useState(mapItem.status);
	const [isDownloading, setIsDownloading] = useState(false);
	// The item unmounts when the downloads panel is hidden while its download
	// keeps running; its callbacks must then stop touching this component.
	const mountedRef = useRef(true);

	useEffect(() => {
		mountedRef.current = true;
		return () => {
			mountedRef.current = false;
		};
	}, []);

	useEffect(() => {
		setProgress(mapItem.downloadProgress);
		setStatus(mapItem.status);
	}, [mapItem.downloadProgress, mapItem.status]);

	const downloadMap = (item: ContentStoreItem) => {
		if (item.isCompleted) return;
		setIsDownloading(true);
		setStatus(ContentStoreItemStatus.downloadRunning);
		item.asyncDownload(
			(err: GemError) => {
				if (!mountedRef.current) return;
				if (err === GemError.success) {
					setProgress(100);
					setStatus(ContentStoreItemStatus.completed);
					setIsDownloading(false);
					setTimeout(() => {
						if (mountedRef.current) onUpdate();
					}, 500);
				} else {
					setStatus(ContentStoreItemStatus.paused);
					setIsDownloading(false);
					console.log(`Download interrupted: ${err}`);
				}
			},
			{
				onProgressCallback: (prog: number) => {
					if (!mountedRef.current) return;
					setProgress(prog);
					setStatus(ContentStoreItemStatus.downloadRunning);
				},
				allowChargedNetworks: true,
			}
		);
	};

	const handlePause = async () => {
		await mapItem.pauseDownload(() => {
			if (mountedRef.current) setStatus(mapItem.status);
		});
	};

	const handleTileTap = () => {
		if (mapItem.isCompleted) return;
		if (status === ContentStoreItemStatus.downloadRunning || isDownloading) {
			handlePause();
		} else {
			downloadMap(mapItem);
		}
	};

	const handleDelete = () => {
		Alert.alert('Delete Map', `Are you sure you want to delete ${mapItem.name}?`, [
			{ text: 'Cancel', style: 'cancel' },
			{
				text: 'Delete',
				style: 'destructive',
				onPress: () => {
					mapItem.deleteContent();
					setStatus(ContentStoreItemStatus.unavailable);
					setProgress(0);
					onUpdate();
				},
			},
		]);
	};

	const renderStatusIcon = () => {
		if (mapItem.isCompleted) {
			return <Text style={styles.iconCompleted}>OK</Text>;
		}
		if (progress > 0 && progress < 100) {
			return (
				<View style={styles.progressContainer}>
					<Text style={styles.progressText}>{Math.round(progress)}%</Text>
				</View>
			);
		}
		if (status === ContentStoreItemStatus.paused) {
			return <Text style={styles.iconPaused}>||</Text>;
		}
		return <Text style={styles.iconPaused}>DL</Text>;
	};

	const sizeMB = (mapItem.totalSize / (1024 * 1024)).toFixed(2);

	return (
		<View style={styles.mapItem}>
			<TouchableOpacity style={styles.mapItemContent} onPress={handleTileTap}>
				<View style={styles.mapItemInfo}>
					<Text style={styles.mapItemTitle}>{mapItem.name}</Text>
					<Text style={styles.mapItemSize}>{sizeMB} MB</Text>
				</View>
				<View style={styles.mapItemStatus}>{renderStatusIcon()}</View>
			</TouchableOpacity>
			{mapItem.isCompleted && (
				<TouchableOpacity style={styles.deleteButton} onPress={handleDelete}>
					<Text style={styles.deleteButtonText}>DEL</Text>
				</TouchableOpacity>
			)}
		</View>
	);
};

export default function MapDownloadDemo() {
	const [initialized, setInitialized] = useState(false);
	const [initError, setInitError] = useState<string | null>(null);
	const [maps, setMaps] = useState<ContentStoreItem[]>([]);
	const [loading, setLoading] = useState(true);
	const [showDownloads, setShowDownloads] = useState(false);
	// The store lists the maps only once the SDK is online and its map data
	// is current, right after start-up. Set once the SDK is initialized and
	// that data is ready.
	const [mapDataReady, setMapDataReady] = useState(false);
	useEffect(() => {
		if (!initialized) {
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
	}, [initialized]);

	useEffect(() => {
		let mounted = true;
		// One-call SDK init (idempotent; <GLView> calls it too).
		MagicLaneReactNativeSDK.init({ authorization: GEMKIT_TOKEN || undefined }).then(() => {
			if (!mounted) return;
			try {
				SdkSettings.setAllowOffboardServiceOnExtraChargedNetwork(
					ServiceGroupType.ContentService,
					true
				);
				SdkSettings.setAllowInternetConnection(true);
				setInitialized(true);
			} catch (e: any) {
				setInitError(String(e?.message || e));
			}
		});
		return () => {
			mounted = false;
		};
	}, []);

	// A pending retry of the list request, cancelled when the panel closes.
	const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
	const cancelRetry = useCallback(() => {
		if (retryTimer.current) {
			clearTimeout(retryTimer.current);
			retryTimer.current = null;
		}
	}, []);

	const loadMaps = useCallback(() => {
		cancelRetry();
		setLoading(true);
		const request = (attempt: number) => {
			try {
				ContentStore.asyncGetStoreContentList(
					ContentType.roadMap,
					(err: GemError, items: ContentStoreItem[] | null) => {
						if (err === GemError.success && items) {
							setMaps(items);
						} else if (err === GemError.busy && attempt < MAX_BUSY_RETRIES) {
							// Right after start-up the store can answer busy: ask again
							// shortly, and keep showing "Loading maps..." meanwhile.
							retryTimer.current = setTimeout(() => request(attempt + 1), 1000);
							return;
						} else {
							console.error('Failed to load maps:', err);
							Alert.alert('Error', 'Failed to load maps list');
						}
						setLoading(false);
					}
				);
			} catch (e) {
				console.error('Error loading maps:', e);
				setLoading(false);
			}
		};
		request(0);
	}, [cancelRetry]);

	// Load the list while the panel is open, and reload it when the connection
	// comes back. The listener lives only as long as the panel is shown.
	useEffect(() => {
		if (!initialized || !showDownloads) return;
		loadMaps();
		SdkSettings.offBoardListener.registerOnConnectionStatusUpdated((isConnected: boolean) => {
			if (isConnected) loadMaps();
		});
		return () => {
			cancelRetry();
			SdkSettings.offBoardListener.registerOnConnectionStatusUpdated(undefined);
		};
	}, [initialized, showDownloads, loadMaps, cancelRetry]);

	const handleMapUpdate = () => {
		loadMaps();
	};

	return (
		<View style={styles.root}>
			<StatusBar barStyle="dark-content" />
			<GLView style={StyleSheet.absoluteFill} apiToken={GEMKIT_TOKEN || undefined} />
			{/* The map fills the screen; the controls stay within the safe area,
			    clear of the status bar and the home indicator. */}
			<SafeAreaView style={StyleSheet.absoluteFill} pointerEvents="box-none">
				<TouchableOpacity
					style={[styles.toggleButton, !mapDataReady && styles.toggleButtonDisabled]}
					disabled={!mapDataReady}
					onPress={() => setShowDownloads((prev) => !prev)}
				>
					<Text style={styles.toggleButtonText}>
						{showDownloads ? 'Hide Downloads' : 'Show Downloads'}
					</Text>
				</TouchableOpacity>
				{showDownloads && (
					<View style={styles.overlay}>
					<View style={styles.header}>
						<Text style={styles.headerTitle}>Map Download</Text>
						<TouchableOpacity style={styles.refreshButton} onPress={loadMaps}>
							<Text style={styles.refreshButtonText}>R</Text>
						</TouchableOpacity>
					</View>

					{!initialized && !initError && <Text style={styles.info}>Initializing...</Text>}
					{initError && <Text style={styles.error}>Init failed: {initError}</Text>}

					{loading ? (
						<Text style={styles.info}>Loading maps...</Text>
					) : (
						<ScrollView style={styles.mapsList} showsVerticalScrollIndicator={false}>
							{maps.length === 0 ? (
								<Text style={styles.emptyText}>No maps available</Text>
							) : (
								maps.map((mapItem, index) => (
									<MapItem
										key={`${mapItem.id}-${index}`}
										mapItem={mapItem}
										onUpdate={handleMapUpdate}
									/>
								))
							)}
						</ScrollView>
					)}
					</View>
				)}
			</SafeAreaView>
		</View>
	);
}

const styles = StyleSheet.create({
	root: {
		flex: 1,
		backgroundColor: '#e8e8e8',
	},
	overlay: {
		flex: 1,
		marginTop: 10,
		marginHorizontal: 12,
		marginBottom: 20,
		backgroundColor: '#fff',
		borderRadius: 12,
		padding: 16,
		shadowColor: '#000',
		shadowOpacity: 0.15,
		shadowRadius: 8,
		elevation: 5,
	},
	toggleButton: {
		alignSelf: 'flex-end',
		marginTop: 20,
		marginRight: 12,
		backgroundColor: '#111',
		paddingHorizontal: 12,
		paddingVertical: 8,
		borderRadius: 18,
	},
	toggleButtonDisabled: {
		opacity: 0.5,
	},
	toggleButtonText: {
		color: '#fff',
		fontSize: 12,
		fontWeight: '600',
	},
	header: {
		flexDirection: 'row',
		justifyContent: 'space-between',
		alignItems: 'center',
		marginBottom: 16,
		paddingBottom: 12,
		borderBottomWidth: 1,
		borderBottomColor: '#e0e0e0',
	},
	headerTitle: {
		fontSize: 18,
		fontWeight: '700',
		color: '#333',
	},
	refreshButton: {
		padding: 4,
	},
	refreshButtonText: {
		fontSize: 24,
		color: '#6200ee',
	},
	info: {
		color: '#666',
		marginBottom: 8,
		textAlign: 'center',
		fontSize: 14,
	},
	error: {
		color: '#e74c3c',
		marginBottom: 8,
		textAlign: 'center',
		fontSize: 14,
	},
	emptyText: {
		textAlign: 'center',
		color: '#999',
		fontSize: 14,
		marginTop: 20,
	},
	mapsList: {
		flex: 1,
	},
	mapItem: {
		flexDirection: 'row',
		alignItems: 'center',
		paddingVertical: 12,
		borderBottomWidth: 1,
		borderBottomColor: '#f0f0f0',
	},
	mapItemContent: {
		flex: 1,
		flexDirection: 'row',
		alignItems: 'center',
		justifyContent: 'space-between',
	},
	mapItemInfo: {
		flex: 1,
	},
	mapItemTitle: {
		fontSize: 16,
		fontWeight: '600',
		color: '#333',
		marginBottom: 4,
	},
	mapItemSize: {
		fontSize: 14,
		color: '#666',
	},
	mapItemStatus: {
		width: 60,
		alignItems: 'center',
		justifyContent: 'center',
	},
	iconCompleted: {
		fontSize: 20,
		color: '#4caf50',
	},
	iconPaused: {
		fontSize: 20,
		color: '#ff9800',
	},
	progressContainer: {
		width: 50,
		height: 50,
		borderRadius: 25,
		backgroundColor: '#e3f2fd',
		alignItems: 'center',
		justifyContent: 'center',
		borderWidth: 2,
		borderColor: '#2196f3',
	},
	progressText: {
		fontSize: 12,
		fontWeight: '600',
		color: '#2196f3',
	},
	deleteButton: {
		padding: 8,
		marginLeft: 8,
	},
	deleteButtonText: {
		fontSize: 16,
	},
});
