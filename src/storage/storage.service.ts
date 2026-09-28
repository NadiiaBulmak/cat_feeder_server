import { Injectable, Logger, InternalServerErrorException } from '@nestjs/common';
import { S3Client, PutObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';
import { ERROR_MESSAGES } from '../shared/error-messages.js';
import { LOG_MESSAGES } from '../shared/log-messages.js';

@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private readonly s3Client: S3Client;
  
  private readonly bucketName = process.env.R2_BUCKET_NAME!;
  private readonly publicUrl = process.env.PUBLIC_R2_URL!;

  constructor() {
    this.s3Client = new S3Client({
      region: 'auto',
      endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID!,
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
      },
    });
  }

  async uploadImage(imageBuffer: Buffer, folder: string = 'cats'): Promise<string> {
    const fileName = `${folder}/snapshot_${Date.now()}.jpg`;
    
    try {
      await this.s3Client.send(
        new PutObjectCommand({
          Bucket: this.bucketName,
          Key: fileName,
          Body: imageBuffer,
          ContentType: 'image/jpeg',
          CacheControl: 'public, max-age=31536000', 
        })
      );
      
      const fileUrl = `${this.publicUrl}/${fileName}`;
      this.logger.log(LOG_MESSAGES.cloudPhotoSaved(fileUrl));
      
      return fileUrl;
    } catch (error) {
      this.logger.error(LOG_MESSAGES.cloudPhotoUploadFailed, error);
      throw new InternalServerErrorException(ERROR_MESSAGES.cloudPhotoUploadFailed);
    }
  }

  async getDeviceSnapshots(deviceId: string): Promise<string[]> {
    const folderPrefix = `${deviceId}/`;

    try {
      const command = new ListObjectsV2Command({
        Bucket: this.bucketName,
        Prefix: folderPrefix,
      });

      const response = await this.s3Client.send(command);

      if (!response.Contents || response.Contents.length === 0) {
        return [];
      }

      return response.Contents
        .sort((a, b) => (b.LastModified?.getTime() || 0) - (a.LastModified?.getTime() || 0))
        .map((file) => `${this.publicUrl}/${file.Key}`);
    } catch (error) {
      this.logger.error(LOG_MESSAGES.cloudPhotoListFailed(deviceId), error);
      throw new InternalServerErrorException(ERROR_MESSAGES.cloudPhotoListFailed);
    }
  }
}