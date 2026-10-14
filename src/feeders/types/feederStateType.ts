import { FeederState } from "@prisma/client";
import { BleState } from "../interfaces/bleState.js";

export type FeederStateType = {
    name: string;
    id: string;
    deviceId: string;
    desiredState: FeederState;
    actualState: FeederState;
    lastPing: Date;
    createdAt: Date;
    updatedAt: Date;
    lastDistance: number | null;
    bleState: BleState;
    connectedDevices: string[];
  }