import QRCode from 'qrcode';
import { getCanonicalTenantUrl } from './url.js';

export async function generateQrDataUrl(
  username: string,
  baseDomain: string,
  size = 256
): Promise<string> {
  const url = getCanonicalTenantUrl(username, baseDomain);
  return QRCode.toDataURL(url, {
    errorCorrectionLevel: 'H',
    margin: 2,
    width: size,
    color: {
      dark: '#000000',
      light: '#ffffff',
    },
  });
}

export async function generateQrPngBuffer(
  username: string,
  baseDomain: string,
  size = 2048
): Promise<Buffer> {
  const safeSize = Math.min(Math.max(Number(size) || 2048, 128), 4096);
  const url = getCanonicalTenantUrl(username, baseDomain);
  return QRCode.toBuffer(url, {
    type: 'png',
    errorCorrectionLevel: 'H',
    margin: 2,
    width: safeSize,
    color: {
      dark: '#000000',
      light: '#ffffff',
    },
  });
}

export async function generateQrSvgString(username: string, baseDomain: string): Promise<string> {
  const url = getCanonicalTenantUrl(username, baseDomain);
  return QRCode.toString(url, {
    type: 'svg',
    errorCorrectionLevel: 'H',
    margin: 2,
    color: {
      dark: '#000000',
      light: '#ffffff',
    },
  });
}
