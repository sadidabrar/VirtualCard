import { generateQrDataUrl, generateQrPngBuffer, generateQrSvgString } from '../lib/qr.js';

export class QrService {
  constructor(private readonly baseDomain: string) {}

  getQrDataUrl(username: string, size = 256): Promise<string> {
    return generateQrDataUrl(username, this.baseDomain, size);
  }

  getQrPng(username: string, size = 2048): Promise<Buffer> {
    return generateQrPngBuffer(username, this.baseDomain, size);
  }

  getQrSvg(username: string): Promise<string> {
    return generateQrSvgString(username, this.baseDomain);
  }
}
