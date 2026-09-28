export const ERROR_MESSAGES = {
  invalidCredentials: 'Invalid email or password',
  userAlreadyExists: 'User already exists',
  snapshotRequestFailed: 'Failed to retrieve snapshot',
  cameraOffline: 'Camera is offline',
  cameraSnapshotTimeout: 'Camera did not send a snapshot in time',
  deviceIdRequired: 'Device ID is required',
  cameraPhotoProcessingFailed: 'Failed to process photo',
  captureAndSaveFailed: 'Failed to capture and save photo',
  snapshotSaveFailed: 'Failed to save snapshot',
  fileNotProvided: 'File not provided',
  feederNotFound: 'Feeder not found',
  feederDeviceOffline: 'Feeder device is offline',
  feederUpdateDataEmpty: 'Update data cannot be empty',
  feederByDeviceIdNotFound: (deviceId: string) =>
    `Feeder with device ID [${deviceId}] was not found`,
  fileNotFound: 'File not found',
  catAccessDenied: (catName: string) =>
    `Hello, ${catName}, but you are not allowed to eat from this feeder.`,
  catNotRecognized: 'Unknown cat or poor camera angle.',
  cloudPhotoUploadFailed: 'Failed to upload photo to cloud storage',
  cloudPhotoListFailed: 'Failed to retrieve photo list from cloud storage',
} as const;