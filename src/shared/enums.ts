export enum FeederState {
  OPEN = 'OPEN',
  CLOSED = 'CLOSED',
}

export enum FeederAction {
  OPEN = 'open',
  CLOSE = 'close',
}

export enum EventType {
  UNKNOWN_CAT = 'UNKNOWN_CAT',
  IDENTIFICATION_FAILED = 'IDENTIFICATION_FAILED',
  CAT_IDENTIFIED='CAT_IDENTIFIED'
}