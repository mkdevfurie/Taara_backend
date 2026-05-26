import { Injectable, InternalServerErrorException, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  v2 as cloudinary,
  type UploadApiOptions,
  type UploadApiResponse,
} from 'cloudinary';
import { Readable } from 'node:stream';

export interface UploadResult {
  url: string;
  publicId: string;
  width?: number;
  height?: number;
  format?: string;
  bytes?: number;
}

@Injectable()
export class CloudinaryService implements OnModuleInit {
  private readonly logger = new Logger(CloudinaryService.name);
  private configured = false;

  constructor(private readonly config: ConfigService) {}

  onModuleInit() {
    const cloud_name = this.config.get<string>('CLOUDINARY_CLOUD_NAME');
    const api_key = this.config.get<string>('CLOUDINARY_API_KEY');
    const api_secret = this.config.get<string>('CLOUDINARY_API_SECRET');

    if (!cloud_name || !api_key || !api_secret) {
      this.logger.warn(
        'Cloudinary non configuré (CLOUDINARY_* manquant) — uploads désactivés en mode dev',
      );
      return;
    }
    cloudinary.config({ cloud_name, api_key, api_secret, secure: true });
    this.configured = true;
    this.logger.log('Cloudinary configuré');
  }

  isConfigured(): boolean {
    return this.configured;
  }

  async uploadBuffer(
    buffer: Buffer,
    options: { folder?: string; publicId?: string; tags?: string[] } = {},
  ): Promise<UploadResult> {
    if (!this.configured) {
      throw new InternalServerErrorException(
        'Cloudinary non configuré (CLOUDINARY_CLOUD_NAME/API_KEY/API_SECRET manquants)',
      );
    }

    const baseFolder = this.config.get<string>('CLOUDINARY_FOLDER') ?? 'taara';
    const folder = options.folder ? `${baseFolder}/${options.folder}` : baseFolder;

    const opts: UploadApiOptions = {
      folder,
      public_id: options.publicId,
      tags: options.tags,
      resource_type: 'auto',
      overwrite: true,
    };

    const result = await new Promise<UploadApiResponse>((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(opts, (err, res) => {
        if (err || !res) return reject(err ?? new Error('Cloudinary: upload empty result'));
        resolve(res);
      });
      Readable.from(buffer).pipe(stream);
    });

    return {
      url: result.secure_url,
      publicId: result.public_id,
      width: result.width,
      height: result.height,
      format: result.format,
      bytes: result.bytes,
    };
  }

  async destroy(publicId: string): Promise<void> {
    if (!this.configured) return;
    try {
      await cloudinary.uploader.destroy(publicId);
    } catch (e) {
      this.logger.warn(`destroy(${publicId}) failed: ${(e as Error).message}`);
    }
  }
}
