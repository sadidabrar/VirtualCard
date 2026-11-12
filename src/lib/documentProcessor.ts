import type { Request, Response, NextFunction } from 'express';
import multer from 'multer';
import sharp from 'sharp';
import eng from '@tesseract.js-data/eng';
import { createWorker, type Worker } from 'tesseract.js';
import { extractText, getDocumentProxy, renderPageAsImage } from 'unpdf';
import {
  compressImageToWebp,
  hasValidImageMagicBytes,
  hasValidPdfMagicBytes,
} from './avatar.js';
import { ValidationError } from '../types/errors.js';

const ALLOWED_DOC_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'application/pdf',
]);
const MAX_VAULT_DOC_BYTES = 15 * 1024 * 1024;
const MAX_OCR_PDF_PAGES = 4;
const IDLE_TERMINATE_MS = 45_000;

export interface ProcessedVaultFileResult {
  processedBuffer: Buffer;
  mimeType: 'image/webp' | 'application/pdf';
  originalSize: number;
  compressedSize: number;
  ocrText: string;
  ocrStatus: 'completed' | 'empty' | 'error';
  ocrConfidence: number;
}

export const vaultDocumentUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_VAULT_DOC_BYTES,
    files: 1,
  },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_DOC_MIME_TYPES.has(file.mimetype)) {
      return cb(
        new ValidationError(
          'Only JPEG, PNG, WebP, GIF images and PDF documents are supported.',
          'INVALID_DOC_TYPE',
          'file'
        )
      );
    }
    cb(null, true);
  },
});

export function parseVaultDocumentUpload(req: Request, res: Response, next: NextFunction): void {
  vaultDocumentUpload.single('file')(req, res, (err: unknown) => {
    if (err) {
      req.multerError = err instanceof Error ? err.message : 'Invalid document upload.';
    }
    next();
  });
}

let ocrWorkerPromise: Promise<Worker> | null = null;
let idleTimer: NodeJS.Timeout | null = null;
let ocrQueue: Promise<unknown> = Promise.resolve();

function scheduleIdleTerminate(): void {
  if (idleTimer) clearTimeout(idleTimer);
  idleTimer = setTimeout(() => {
    void terminateOcrWorker();
  }, IDLE_TERMINATE_MS);
  idleTimer.unref();
}

async function getOcrWorker(): Promise<Worker> {
  if (!ocrWorkerPromise) {
    ocrWorkerPromise = createWorker('eng', 1, {
      langPath: eng.langPath,
      gzip: eng.gzip,
      cacheMethod: 'none',
    }).catch((err) => {
      ocrWorkerPromise = null;
      throw err;
    });
  }
  return ocrWorkerPromise;
}

export async function terminateOcrWorker(): Promise<void> {
  if (idleTimer) {
    clearTimeout(idleTimer);
    idleTimer = null;
  }
  const current = ocrWorkerPromise;
  ocrWorkerPromise = null;
  if (current) {
    try {
      const worker = await current;
      await worker.terminate();
    } catch {
      // non-fatal cleanup
    }
  }
}

function enqueueOcrTask<T>(fn: () => Promise<T>): Promise<T> {
  const next = ocrQueue.then(fn, fn);
  ocrQueue = next.then(
    () => undefined,
    () => undefined
  );
  return next;
}

async function recognizeImageText(imageBuffer: Buffer): Promise<{
  text: string;
  confidence: number;
}> {
  return enqueueOcrTask(async () => {
    const worker = await getOcrWorker();
    try {
      const { data } = await worker.recognize(imageBuffer);
      return {
        text: (data.text || '').replace(/\r\n/g, '\n').trim().slice(0, 100_000),
        confidence: Math.round(Number(data.confidence) || 0),
      };
    } finally {
      scheduleIdleTerminate();
    }
  });
}

async function extractOcrFromPdfBuffer(pdfBuffer: Buffer): Promise<{
  ocrText: string;
  ocrStatus: 'completed' | 'empty' | 'error';
  ocrConfidence: number;
}> {
  const pdfProxy = await getDocumentProxy(new Uint8Array(pdfBuffer));
  try {
    const extracted = await extractText(pdfProxy, { mergePages: true });
    const rawSelectable = typeof extracted.text === 'string' ? extracted.text.trim() : '';
    const nonSpaceLen = rawSelectable.replace(/\s+/g, '').length;

    if (nonSpaceLen >= 30) {
      return {
        ocrText: rawSelectable.slice(0, 100_000),
        ocrStatus: 'completed',
        ocrConfidence: 100,
      };
    }

    // Scanned / image-only PDF: rasterize up to first MAX_OCR_PDF_PAGES pages & run OCR
    const pagesToScan = Math.min(pdfProxy.numPages || 1, MAX_OCR_PDF_PAGES);
    const pageTexts: string[] = [];
    let totalConfidence = 0;
    let scannedPages = 0;

    for (let pageNum = 1; pageNum <= pagesToScan; pageNum += 1) {
      const rendered = await renderPageAsImage(pdfProxy, pageNum, {
        canvasImport: () => import('@napi-rs/canvas'),
        scale: 2,
        format: 'png',
      });
      const pagePng = Buffer.from(rendered);
      const ocrPagePng = await sharp(pagePng).grayscale().normalise().png().toBuffer();
      const ocr = await recognizeImageText(ocrPagePng);
      if (ocr.text) {
        pageTexts.push(ocr.text);
        totalConfidence += ocr.confidence;
        scannedPages += 1;
      }
    }

    const mergedText = pageTexts.join('\n\n').trim().slice(0, 100_000);
    if (!mergedText && rawSelectable) {
      return {
        ocrText: rawSelectable.slice(0, 100_000),
        ocrStatus: 'completed',
        ocrConfidence: 100,
      };
    }

    return {
      ocrText: mergedText,
      ocrStatus: mergedText ? 'completed' : 'empty',
      ocrConfidence: scannedPages > 0 ? Math.round(totalConfidence / scannedPages) : 0,
    };
  } catch {
    return {
      ocrText: '',
      ocrStatus: 'error',
      ocrConfidence: 0,
    };
  } finally {
    try {
      const cleanupFn = (pdfProxy as unknown as { cleanup?: () => Promise<void> }).cleanup;
      const destroyFn = (pdfProxy as unknown as { destroy?: () => Promise<void> }).destroy;
      if (typeof destroyFn === 'function') {
        await destroyFn.call(pdfProxy);
      } else if (typeof cleanupFn === 'function') {
        await cleanupFn.call(pdfProxy);
      }
    } catch {
      // non-fatal PDF proxy cleanup
    }
  }
}

export async function processVaultDocumentFile(
  file: Express.Multer.File
): Promise<ProcessedVaultFileResult> {
  const originalSize = file.buffer.length;

  if (file.mimetype === 'application/pdf') {
    if (!hasValidPdfMagicBytes(file.buffer)) {
      throw new ValidationError(
        'Invalid PDF file signature. Please upload a valid PDF document.',
        'INVALID_PDF_BYTES',
        'file'
      );
    }

    const ocrResult = await extractOcrFromPdfBuffer(file.buffer);
    return {
      processedBuffer: file.buffer,
      mimeType: 'application/pdf',
      originalSize,
      compressedSize: file.buffer.length,
      ...ocrResult,
    };
  }

  if (!hasValidImageMagicBytes(file.buffer)) {
    throw new ValidationError(
      'Invalid image file signature. File content does not match a valid image.',
      'INVALID_IMAGE_BYTES',
      'file'
    );
  }

  // Generate crisp high-contrast PNG for accurate OCR before aggressive archival compression
  const ocrReadyPng = await sharp(file.buffer)
    .rotate()
    .resize(2200, 2200, { fit: 'inside', withoutEnlargement: true })
    .grayscale()
    .normalise()
    .png()
    .toBuffer();

  let ocrText = '';
  let ocrStatus: 'completed' | 'empty' | 'error';
  let ocrConfidence: number;

  try {
    const ocr = await recognizeImageText(ocrReadyPng);
    ocrText = ocr.text;
    ocrConfidence = ocr.confidence;
    ocrStatus = ocrText ? 'completed' : 'empty';
  } catch {
    ocrStatus = 'error';
    ocrConfidence = 0;
  }

  const compressedWebp = await compressImageToWebp(file.buffer, {
    width: 1800,
    height: 1800,
    fit: 'inside',
    quality: 78,
  });

  return {
    processedBuffer: compressedWebp,
    mimeType: 'image/webp',
    originalSize,
    compressedSize: compressedWebp.length,
    ocrText,
    ocrStatus,
    ocrConfidence,
  };
}

export async function rerunOcrOnDecryptedBuffer(
  plainBuffer: Buffer,
  mimeType: string
): Promise<{
  ocrText: string;
  ocrStatus: 'completed' | 'empty' | 'error';
  ocrConfidence: number;
}> {
  if (mimeType === 'application/pdf') {
    return extractOcrFromPdfBuffer(plainBuffer);
  }
  const ocrReadyPng = await sharp(plainBuffer)
    .rotate()
    .resize(2200, 2200, { fit: 'inside', withoutEnlargement: true })
    .grayscale()
    .normalise()
    .png()
    .toBuffer();

  try {
    const ocr = await recognizeImageText(ocrReadyPng);
    return {
      ocrText: ocr.text,
      ocrStatus: ocr.text ? 'completed' : 'empty',
      ocrConfidence: ocr.confidence,
    };
  } catch {
    return {
      ocrText: '',
      ocrStatus: 'error',
      ocrConfidence: 0,
    };
  }
}
