import {
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { FeedersGateway } from '../feeders/feeders.gateway.js';
import { StorageService } from '../storage/storage.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { EventType } from '@prisma/client';

@Injectable()
export class CameraService {
  private readonly logger = new Logger(CameraService.name);

  private readonly cameraUrl = process.env.CAMERA_URL!;
  private pendingSnapshots = new Map<string, (image: Buffer) => void>();

  private lastAutoSnapshotTime = new Map<string, number>();
  private readonly AUTO_SNAPSHOT_COOLDOWN_MS = 5000;

  constructor(
    private readonly feedersGateway: FeedersGateway,
    private readonly storageService: StorageService,
    private readonly prisma: PrismaService,
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

  async captureAndSaveToCloud(
    deviceId: string,
    folder: string = 'reference',
  ): Promise<string> {
    this.logger.log(
      `☁️ Початок процесу збереження фото в хмару для [${deviceId}]`,
    );

    const imageBuffer = await this.getLiveSnapshotBuffer(deviceId);

    const publicUrl = await this.storageService.uploadImage(
      imageBuffer,
      deviceId,
    );

    return publicUrl;
  }
  async triggerAutoSnapshot(deviceId: string): Promise<string | null> {
    const cleanId = deviceId.trim();
    const now = Date.now();
    const lastTime = this.lastAutoSnapshotTime.get(cleanId) || 0;

    if (now - lastTime < this.AUTO_SNAPSHOT_COOLDOWN_MS) {
      const remaining = Math.ceil(
        (this.AUTO_SNAPSHOT_COOLDOWN_MS - (now - lastTime)) / 1000,
      );
      this.logger.warn(
        `⏳ [${cleanId}] Пропущено авто-знімок: зачекайте ще ${remaining} сек.`,
      );
      return null;
    }

    this.lastAutoSnapshotTime.set(cleanId, now);

    try {
      this.logger.log(`📸 Автоматичний знімок для пристрою [${cleanId}]...`);

      const imageBuffer = await this.getLiveSnapshotBuffer(cleanId);
      const folderName = `auto-snapshots/${cleanId}`;
      const photoUrl = await this.storageService.uploadImage(
        imageBuffer,
        folderName,
      );

      const feeder = await this.prisma.feeder.findUnique({
        where: { deviceId: cleanId },
      });

      if (feeder) {
        await this.prisma.feedingEvent.create({
          data: {
            feederId: feeder.id,
            eventType: EventType.CAT_DETECTED,
            metadata: { photoUrl, trigger: 'IR_SENSOR' },
          },
        });
      }

      this.logger.log(
        `✅ Авто-знімок успішно збережено в БД та R2: ${photoUrl}`,
      );
      return photoUrl;
    } catch (error) {
      this.logger.error(
        `❌ Помилка створення авто-знімка для [${cleanId}]:`,
        error,
      );
      return null;
    }
  }
}
