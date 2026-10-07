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
  CAT_APPROACHED='CAT_APPROACHED',
  HARDWARE_ERROR='HARDWARE_ERROR',
  FEEDER_OPENED='FEEDER_OPENED',
  FEEDER_CLOSED='FEEDER_CLOSED',
  CAT_LEFT='CAT_LEFT',
  APP_COMMAND='APP_COMMAND',


}