import {
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { FeedersGateway } from '../feeders/feeders.gateway.js';
import { StorageService } from '../storage/storage.service.js';

@Injectable()
export class CameraService {
  private readonly logger = new Logger(CameraService.name);

  private readonly cameraUrl = process.env.CAMERA_URL!;
  private pendingSnapshots = new Map<string, (image: Buffer) => void>();

  constructor(
    private readonly feedersGateway: FeedersGateway,
    private readonly storageService: StorageService,
  ) {}

  private getCameraId(deviceId: string): string {
    return deviceId.endsWith('-camera') ? deviceId : `${deviceId}-camera`;
  }

  async getLiveSnapshotBuffer(deviceId: string): Promise<Buffer> {
    const targetId = this.getCameraId(deviceId);
    this.logger.log(`📸 Запит фотографії для пристрою: [${targetId}]`);

    const isSent = this.feedersGateway.sendCommandToDevice(
      deviceId,
      'TAKE_SNAPSHOT',
    );

    if (!isSent) {
      throw new InternalServerErrorException(
        'Камера не в мережі (не підключена до сокетів)',
      );
    }

    return new Promise<Buffer>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingSnapshots.delete(targetId);
        reject(new Error('Камера не надіслала фото вчасно'));
      }, 15000);

      this.pendingSnapshots.set(targetId, (buffer) => {
        clearTimeout(timeout);
        resolve(buffer);
      });
    });
  }

  resolveSnapshot(deviceId: string, imageBuffer: Buffer) {
    const targetId = this.getCameraId(deviceId);
    const resolveWaitingRequest = this.pendingSnapshots.get(targetId);

    if (resolveWaitingRequest) {
      resolveWaitingRequest(imageBuffer);
      this.pendingSnapshots.delete(targetId);
      this.logger.log(`✅ Фото від [${targetId}] успішно передано на фронтенд`);
    } else {
      this.logger.warn(
        `⚠️ Отримано фото від [${targetId}], але його ніхто не чекав (Можливо, фронтенд відключився по таймауту?)`,
      );
    }
  }

  async captureAndSaveToCloud(deviceId: string, folder: string = 'reference'): Promise<string> {
    this.logger.log(`☁️ Початок процесу збереження фото в хмару для [${deviceId}]`);
    
    const imageBuffer = await this.getLiveSnapshotBuffer(deviceId);
    
    const publicUrl = await this.storageService.uploadImage(imageBuffer, deviceId);
    
    return publicUrl;
  }
  
}
