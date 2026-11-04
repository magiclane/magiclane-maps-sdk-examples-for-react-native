// SPDX-FileCopyrightText: 2025-2026 Magic Lane International B.V. <info@magiclane.com>
// SPDX-License-Identifier: Apache-2.0
//
// Contact Magic Lane at <info@magiclane.com> for SDK licensing options.

// This app lists the human voices available in the content store and lets you
// download, pause, resume and delete them
// (ContentStore.asyncGetStoreContentList + ContentStoreItem.asyncDownload /
// pauseDownload / deleteContent). A finished download becomes the current voice
// (SdkSettings.setVoiceByPath).

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
	View,
	Text,
	StyleSheet,
	StatusBar,
	TouchableOpacity,
	ScrollView,
	Alert,
	Image,
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
	MapDetails,
} from '@magiclane/maps-sdk';
import {
	GLView,
	MagicLaneHelper,
	MagicLaneReactNativeSDK,
} from '@magiclane/maps-sdk-react-native';

// A token from https://developer.magiclane.com is required to download voices.
// The map renders without one.
const GEMKIT_TOKEN = '';

// Statuses of an item whose download is running or queued.
const ACTIVE_DOWNLOAD_STATUSES = [
	ContentStoreItemStatus.downloadQueued,
	ContentStoreItemStatus.downloadRunning,
	ContentStoreItemStatus.downloadWaitingNetwork,
	ContentStoreItemStatus.downloadWaitingFreeNetwork,
];

const isDownloadingOrWaiting = (item: ContentStoreItem) => {
	return ACTIVE_DOWNLOAD_STATUSES.includes(item.status);
};

interface VoiceItemProps {
	voiceItem: ContentStoreItem;
	onUpdate: () => void;
}

const VoiceItem: React.FC<VoiceItemProps> = ({ voiceItem, onUpdate }) => {
	const [progress, setProgress] = useState(voiceItem.downloadProgress);
	const [isDownloaded, setIsDownloaded] = useState(voiceItem.isCompleted);
	// Download callbacks can still arrive after the item has unmounted.
	const mounted = useRef(true);

	useEffect(() => {
		mounted.current = true;
		return () => {
			mounted.current = false;
		};
	}, []);

	useEffect(() => {
		setProgress(voiceItem.downloadProgress);
		setIsDownloaded(voiceItem.isCompleted);
	}, [voiceItem.downloadProgress, voiceItem.isCompleted]);

	const downloadVoice = (item: ContentStoreItem) => {
		item.asyncDownload(
			(err: GemError) => {
				if (err !== GemError.success) return;
				// Make the downloaded voice the current voice.
				const voiceErr = SdkSettings.setVoiceByPath(item.fileName);
				if (voiceErr !== GemError.success) {
					console.error(`Activating the voice ${item.name} failed (${voiceErr})`);
				}
				if (mounted.current) {
					setIsDownloaded(true);
					onUpdate();
				}
			},
			{
				onProgressCallback: (prog: number) => {
					if (mounted.current) {
						setProgress(prog);
					}
				},
				allowChargedNetworks: true,
			}
		);
	};

	// If the voice is already downloading when the item mounts, pause and restart
	// the download so this item receives its progress callbacks. This runs once
	// per item: the list stays mounted across refreshes, so other downloads are
	// not restarted when one finishes.
	useEffect(() => {
		if (isDownloadingOrWaiting(voiceItem)) {
			const err = voiceItem.pauseDownload((pauseErr: GemError) => {
				if (pauseErr === GemError.success) {
					downloadVoice(voiceItem);
				}
			});
			if (err !== GemError.success) {
				console.error(`Pausing the download of ${voiceItem.name} failed (${err})`);
			}
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	const handleTileTap = () => {
		if (isDownloaded) return;

		if (isDownloadingOrWaiting(voiceItem)) {
			voiceItem.pauseDownload(() => {
				onUpdate();
			});
		} else {
			downloadVoice(voiceItem);
		}
	};

	const handleDelete = () => {
		Alert.alert('Delete Voice', `Are you sure you want to delete ${voiceItem.name}?`, [
			{ text: 'Cancel', style: 'cancel' },
			{
				text: 'Delete',
				style: 'destructive',
				onPress: () => {
					if (voiceItem.deleteContent() === GemError.success) {
						setIsDownloaded(false);
						setProgress(0);
						onUpdate();
					}
				},
			},
		]);
	};

	// Build the flag image once per item, not on every progress update.
	const flagUri = useMemo(() => {
		const countryCodes = voiceItem.countryCodes;
		if (countryCodes && countryCodes.length > 0) {
			const flagImg = MapDetails.getCountryFlag(countryCodes[0], { width: 80, height: 80 });
			if (!flagImg) return null;
			const base64 = MagicLaneHelper.convertUint8ArrayToBase64(flagImg);
			return `data:image/png;base64,${base64}`;
		}
		return null;
	}, [voiceItem]);

	const renderStatusIcon = () => {
		if (isDownloaded) {
			return <Text style={styles.iconCompleted}>OK</Text>;
		}
		if (progress > 0 && progress < 100) {
			return (
				<View style={styles.progressContainer}>
					<Text style={styles.progressText}>{Math.round(progress)}%</Text>
				</View>
			);
		}
		if (voiceItem.status === ContentStoreItemStatus.paused) {
			return <Text style={styles.iconPaused}>||</Text>;
		}
		return <Text style={styles.iconDownload}>DL</Text>;
	};

	const sizeMB = (voiceItem.totalSize / (1024 * 1024)).toFixed(2);

	// at() throws past the end of the list, so check its length first.
	const parameters = voiceItem.contentParameters;
	const parameterCount = parameters?.length ?? 0;
	const language = parameterCount > 3 ? parameters?.at(3)?.value || '' : '';
	const gender = parameterCount > 1 ? parameters?.at(1)?.value || '' : '';

	return (
		<View style={styles.voiceItem}>
			<TouchableOpacity style={styles.voiceItemContent} onPress={handleTileTap}>
				{flagUri && (
					<View style={styles.flagContainer}>
						<Image source={{ uri: flagUri }} style={styles.flagImage} resizeMode="contain" />
					</View>
				)}
				<View style={styles.voiceItemInfo}>
					<Text style={styles.voiceItemTitle}>
						{voiceItem.name} ({sizeMB} MB)
					</Text>
					<Text style={styles.voiceItemSubtitle}>
						{language} - {gender}
					</Text>
				</View>
				<View style={styles.voiceItemStatus}>{renderStatusIcon()}</View>
			</TouchableOpacity>
			{isDownloaded && (
				<TouchableOpacity style={styles.deleteButton} onPress={handleDelete}>
					<Text style={styles.deleteButtonText}>DEL</Text>
				</TouchableOpacity>
			)}
		</View>
	);
};

export default function VoiceDownloadDemo() {
	const [initialized, setInitialized] = useState(false);
	const [initError, setInitError] = useState<string | null>(null);
	const [voices, setVoices] = useState<ContentStoreItem[]>([]);
	// `loading` covers only the first fetch. Later refreshes set `refreshing` and
	// keep the list mounted, so items (and their download callbacks) survive.
	const [loading, setLoading] = useState(true);
	const [refreshing, setRefreshing] = useState(false);
	// The store answers noConnection until the SDK is online.
	const [waitingForConnection, setWaitingForConnection] = useState(false);
	const mounted = useRef(true);

	const loadVoices = () => {
		setRefreshing(true);
		try {
			ContentStore.asyncGetStoreContentList(
				ContentType.humanVoice,
				(err: GemError, items: ContentStoreItem[] | null) => {
					if (!mounted.current) return;
					if (err === GemError.success && items) {
						setWaitingForConnection(false);
						setVoices(items);
					} else if (err === GemError.noConnection) {
						// Not online yet: the connection listener loads the list once it is.
						setWaitingForConnection(true);
						setRefreshing(false);
						return;
					} else {
						console.error('Failed to load voices:', err);
						Alert.alert('Error', 'Failed to load voices list');
					}
					setLoading(false);
					setRefreshing(false);
				}
			);
		} catch (e) {
			console.error('Error loading voices:', e);
			setLoading(false);
			setRefreshing(false);
		}
	};

	// Initialize the SDK (the same promise <GLView apiToken> uses), allow content
	// downloads on metered networks, then fetch the voices list. Right after
	// start-up the SDK may not be online yet, so the list is also loaded when
	// the connection comes up.
	useEffect(() => {
		mounted.current = true;
		MagicLaneReactNativeSDK.init({ authorization: GEMKIT_TOKEN || undefined })
			.then(() => {
				if (!mounted.current) return;
				SdkSettings.setAllowOffboardServiceOnExtraChargedNetwork(
					ServiceGroupType.ContentService,
					true
				);
				SdkSettings.setAllowInternetConnection(true);
				setInitialized(true);
				SdkSettings.offBoardListener.registerOnConnectionStatusUpdated((isConnected: boolean) => {
					if (isConnected && mounted.current) loadVoices();
				});
				loadVoices();
			})
			.catch((e: any) => {
				if (mounted.current) {
					setInitError(String(e?.message || e));
					setLoading(false);
				}
			});

		return () => {
			mounted.current = false;
			SdkSettings.offBoardListener.registerOnConnectionStatusUpdated(undefined);
		};
	}, []);

	const handleVoiceUpdate = () => {
		loadVoices();
	};

	return (
		<View style={styles.root}>
			<StatusBar barStyle="dark-content" />
			<GLView style={StyleSheet.absoluteFill} apiToken={GEMKIT_TOKEN || undefined} />
			{/* The map fills the screen; the list stays within the safe area, clear
			    of the status bar and the home indicator. Absolutely positioned
			    children ignore the padding of the SafeAreaView, so the list goes
			    into a view inside it. */}
			<SafeAreaView style={StyleSheet.absoluteFill} pointerEvents="box-none">
				<View style={styles.safeArea} pointerEvents="box-none">
					<View style={styles.overlay}>
						<View style={styles.header}>
							<Text style={styles.headerTitle}>Voice Download</Text>
							<TouchableOpacity
								style={styles.refreshButton}
								onPress={loadVoices}
								disabled={!initialized || refreshing}>
								<Text style={styles.refreshButtonText}>R</Text>
							</TouchableOpacity>
						</View>

						{!initialized && !initError && <Text style={styles.info}>Initializing...</Text>}
						{initError && <Text style={styles.error}>Init failed: {initError}</Text>}

						{loading ? (
							<Text style={styles.info}>
								{waitingForConnection ? 'Waiting for the connection...' : 'Loading voices...'}
							</Text>
						) : (
							<ScrollView style={styles.voicesList} showsVerticalScrollIndicator={false}>
								{voices.length === 0 ? (
									<Text style={styles.emptyText}>No voices available</Text>
								) : (
									voices.map((voiceItem, index) => (
										<VoiceItem
											key={`${voiceItem.id}-${index}`}
											voiceItem={voiceItem}
											onUpdate={handleVoiceUpdate}
										/>
									))
								)}
							</ScrollView>
						)}
					</View>
				</View>
			</SafeAreaView>
		</View>
	);
}

const styles = StyleSheet.create({
	root: {
		flex: 1,
		backgroundColor: '#e8e8e8',
	},
	safeArea: {
		flex: 1,
	},
	overlay: {
		position: 'absolute',
		top: 20,
		left: 12,
		right: 12,
		bottom: 20,
		backgroundColor: '#fff',
		borderRadius: 12,
		padding: 16,
		shadowColor: '#000',
		shadowOpacity: 0.15,
		shadowRadius: 8,
		elevation: 5,
		zIndex: 1000,
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
		color: '#4a148c',
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
	voicesList: {
		flex: 1,
	},
	voiceItem: {
		flexDirection: 'row',
		alignItems: 'center',
		paddingVertical: 12,
		borderBottomWidth: 1,
		borderBottomColor: '#f0f0f0',
	},
	voiceItemContent: {
		flex: 1,
		flexDirection: 'row',
		alignItems: 'center',
	},
	flagContainer: {
		width: 50,
		height: 50,
		marginRight: 12,
		justifyContent: 'center',
		alignItems: 'center',
	},
	flagImage: {
		width: 40,
		height: 40,
	},
	voiceItemInfo: {
		flex: 1,
	},
	voiceItemTitle: {
		fontSize: 16,
		fontWeight: '600',
		color: '#333',
		marginBottom: 4,
	},
	voiceItemSubtitle: {
		fontSize: 14,
		color: '#666',
	},
	voiceItemStatus: {
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
	iconDownload: {
		fontSize: 20,
		color: '#666',
	},
	progressContainer: {
		width: 50,
		height: 50,
		borderRadius: 25,
		backgroundColor: '#e8eaf6',
		alignItems: 'center',
		justifyContent: 'center',
		borderWidth: 2,
		borderColor: '#4a148c',
	},
	progressText: {
		fontSize: 12,
		fontWeight: '600',
		color: '#4a148c',
	},
	deleteButton: {
		padding: 8,
		marginLeft: 8,
	},
	deleteButtonText: {
		fontSize: 16,
	},
});
