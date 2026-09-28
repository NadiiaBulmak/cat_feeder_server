export const LOG_MESSAGES = {
  cameraSnapshotRequested: (deviceId: string) =>
    `Snapshot requested for device [${deviceId}]`,
  cameraSnapshotDelivered: (deviceId: string) =>
    `Snapshot from [${deviceId}] delivered to the frontend`,
  cameraSnapshotUnclaimed: (deviceId: string) =>
    `Received an unsolicited snapshot from [${deviceId}]`,
  cloudPhotoSaveStarted: (deviceId: string) =>
    `Starting cloud photo save for [${deviceId}]`,
  autoSnapshotSkippedCooldown: (deviceId: string, seconds: number) =>
    `Skipped automatic snapshot for [${deviceId}]; retry in ${seconds} seconds`,
  automaticSnapshotStarted: (deviceId: string) =>
    `Taking automatic snapshot for device [${deviceId}]`,
  automaticSnapshotSaved: (photoUrl: string) =>
    `Automatic snapshot saved to the database and R2: ${photoUrl}`,
  automaticSnapshotFailed: (deviceId: string) =>
    `Failed to create automatic snapshot for [${deviceId}]`,
  emailSendFailed: 'Failed to send email',
  nightActivityDetected: 'Night activity detected; sending email',
  nightEmailSent: (email: string) => `Night notification email sent to ${email}`,
  cameraPhotoReceiveFailed: 'Failed to receive photo from camera',
  feederUpdateRequested: (id: string, action: string) =>
    `Feeder update requested: [${id}], action [${action}]`,
  snapshotCommandSent: (deviceId: string) =>
    `Snapshot command sent to camera [${deviceId}]`,
  snapshotRequestFailed: 'Failed to complete snapshot request',
  snapshotReceived: (deviceId: string, bytes: number) =>
    `Received snapshot from camera [${deviceId}], size: ${bytes} bytes`,
  feederStateChanged: (state: string) => `Feeder state: ${state}`,
  photoIntervalStopped: (deviceId: string) =>
    `Stopped periodic snapshots for [${deviceId}]`,
  photoIntervalStarted: (deviceId: string) =>
    `Started periodic snapshots every 10 seconds for [${deviceId}]`,
  photoIntervalTick: (deviceId: string) =>
    `Taking periodic snapshot of [${deviceId}]`,
  deviceConnected: (deviceId: string) =>
    `Device connected to WebSocket: [${deviceId}]`,
  deviceSyncRequested: (deviceId: string, command: string) =>
    `Device [${deviceId}] requested state sync; sent [${command}]`,
  feederOpened: (deviceId: string) => `Feeder [${deviceId}] fully opened`,
  feederClosed: (deviceId: string) => `Feeder [${deviceId}] fully closed`,
  feederStateConfirmed: (deviceId: string, state: string) =>
    `Feeder [${deviceId}] confirmed state: ${state}`,
  catApproached: (deviceId: string, distance: string | number) =>
    `Cat approached feeder [${deviceId}], distance: ${distance} mm`,
  catLeft: (deviceId: string) => `Cat left feeder [${deviceId}]`,
  jsonMessageProcessingFailed: (deviceId: string) =>
    `Failed to process JSON message from [${deviceId}]`,
  deviceConnectionFailed: 'Failed to connect device',
  deviceDisconnected: (deviceId: string) =>
    `Device disconnected from WebSocket: [${deviceId}]`,
  commandRequested: (command: string, deviceId: string) =>
    `Command [${command}] requested for [${deviceId}]`,
  commandSent: (payload: string, deviceId: string) =>
    `Sent ${payload} to device [${deviceId}]`,
  deviceUnavailable: (deviceId: string) =>
    `Device [${deviceId}] was not found or is offline`,
  databaseConnectionSucceeded: 'Connected to PostgreSQL database',
  databaseConnectionFailed: 'Failed to connect to the database',
  embeddingModelLoading: 'Loading image model (ResNet-50, ~98MB)',
  embeddingModelLoaded: 'Image model loaded successfully',
  embeddingGenerationStarted: (imagePath: string) =>
    `Generating image embedding with ResNet-50: ${imagePath}`,
  embeddingGenerationFailed: 'Failed to generate image embedding',
  photoComparisonStarted: (newPath: string, referencePath: string) =>
    `Comparing image [${newPath}] with reference [${referencePath}]`,
  aiSimulationStarted: 'Simulating AI processing for 1 second',
  similarityCalculated: (percent: number) =>
    `AI similarity score: ${percent}%`,
  catRecognitionFailed: 'Failed to recognize cat',
  catMatchFound: (percent: string) => `Cat match found; similarity: ${percent}%`,
  catMatchesFound: (count: number) => `Found ${count} cat matches`,
  cloudPhotoSaved: (url: string) => `Photo saved to R2: ${url}`,
  cloudPhotoUploadFailed: 'Failed to upload photo to cloud storage',
  cloudPhotoListFailed: (deviceId: string) =>
    `Failed to retrieve photo list for [${deviceId}]`,
} as const;