import {
  forwardRef,
  Inject,
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { FeedersGateway } from '../feeders/feeders.gateway.js';
import { StorageService } from '../storage/storage.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { EventType } from '@prisma/client';
import nodemailer from 'nodemailer';
import { ERROR_MESSAGES } from '../shared/error-messages.js';
import { LOG_MESSAGES } from '../shared/log-messages.js';

@Injectable()
export class CameraService {
  private readonly logger = new Logger(CameraService.name);

  private readonly cameraUrl = process.env.CAMERA_URL!;
  private pendingSnapshots = new Map<string, (image: Buffer) => void>();

  private lastAutoSnapshotTime = new Map<string, number>();
  private readonly AUTO_SNAPSHOT_COOLDOWN_MS = 5000;

  private transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: Number(process.env.SMTP_PORT) || 587,
    secure: false,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });

  constructor(
    @Inject(forwardRef(() => FeedersGateway))
    private readonly feedersGateway: Pick<
      FeedersGateway,
      'sendCommandToDevice'
    >,
    private readonly storageService: StorageService,
    private readonly prisma: PrismaService,
  ) {}

  private getCameraId(deviceId: string): string {
    return deviceId.endsWith('-camera') ? deviceId : `${deviceId}-camera`;
  }

  async getLiveSnapshotBuffer(deviceId: string): Promise<Buffer> {
    const targetId = this.getCameraId(deviceId);
    this.logger.log(LOG_MESSAGES.cameraSnapshotRequested(targetId));

    // const isSent = this.feedersGateway.sendCommandToDevice(
    //   deviceId,
    //   'TAKE_SNAPSHOT',
    // );

    // if (!isSent) {
    //   throw new InternalServerErrorException(
    //     ERROR_MESSAGES.cameraOffline,
    //   );
    // }

    return new Promise<Buffer>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingSnapshots.delete(targetId);
        reject(new Error(ERROR_MESSAGES.cameraSnapshotTimeout));
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
      this.logger.log(LOG_MESSAGES.cameraSnapshotDelivered(targetId));
    } else {
      this.logger.warn(LOG_MESSAGES.cameraSnapshotUnclaimed(targetId));
    }
  }

  async captureAndSaveToCloud(
    deviceId: string,
    folder: string = 'reference',
  ): Promise<string> {
    this.logger.log(LOG_MESSAGES.cloudPhotoSaveStarted(deviceId));

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
        LOG_MESSAGES.autoSnapshotSkippedCooldown(cleanId, remaining),
      );
      return null;
    }

    this.lastAutoSnapshotTime.set(cleanId, now);

    try {
      this.logger.log(LOG_MESSAGES.automaticSnapshotStarted(cleanId));

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
            eventType: EventType.CAT_APPROACHED,
            metadata: { photoUrl, trigger: 'IR_SENSOR' },
          },
        });
      }

      this.logger.log(LOG_MESSAGES.automaticSnapshotSaved(photoUrl));

      // if (this.isNightTime()) {
      //   this.logger.log(LOG_MESSAGES.nightActivityDetected);
      //   void this.sendNightPhotoEmail(cleanId, photoUrl);
      // }

      return photoUrl;
    } catch (error) {
      this.logger.error(LOG_MESSAGES.automaticSnapshotFailed(cleanId), error);
      return null;
    }
  }

  private isNightTime(): boolean {
    const kyivTimeString = new Date().toLocaleString('en-US', {
      timeZone: 'Europe/Kyiv',
      hour: 'numeric',
      hour12: false,
    });

    const kyivHour = parseInt(kyivTimeString, 10);

    return kyivHour >= 22 || kyivHour < 10;
  }

  private async sendNightPhotoEmail(deviceId: string, photoUrl: string) {
    const recipientEmail = process.env.NOTIFY_EMAIL || 'your-email@gmail.com';

    try {
      await this.transporter.sendMail({
        from: `"Feeder Watcher" <${process.env.SMTP_USER}>`,
        to: recipientEmail,
        subject: `🌙 Нічна фіксація кота [${deviceId}]`,
        html: `
          <h3>🐾 Кіт біля миски в нічний час!</h3>
          <p>Пристрій: <b>${deviceId}</b></p>
          <p>Час фіксації: <b>${new Date().toLocaleString('uk-UA')}</b></p>
          <p>Переглянути фото: <a href="${photoUrl}" target="_blank">${photoUrl}</a></p>
          <br />
          <img src="${photoUrl}" alt="Cat Snapshot" style="max-width: 500px; border-radius: 8px;" />
        `,
      });
      this.logger.log(LOG_MESSAGES.nightEmailSent(recipientEmail));
    } catch (err) {
      this.logger.error(LOG_MESSAGES.emailSendFailed, err);
    }
  }
}
