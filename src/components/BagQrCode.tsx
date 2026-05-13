'use client';

import { useEffect, useMemo, useState } from 'react';
import { Check, Copy, Download, Printer, QrCode } from 'lucide-react';
import Image from 'next/image';
import * as QRCode from 'qrcode';

interface BagQrCodeProps {
  bagId: string;
  bagName: string;
}

export default function BagQrCode({ bagId, bagName }: BagQrCodeProps) {
  const [origin] = useState(() => typeof window === 'undefined' ? '' : window.location.origin);
  const [shareData, setShareData] = useState('');
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [copied, setCopied] = useState(false);

  const bagUrl = useMemo(() => {
    if (!origin || !shareData) return '';
    const url = new URL(origin);
    url.searchParams.set('share', shareData);
    return url.toString();
  }, [shareData, origin]);

  useEffect(() => {
    const generateShareData = async () => {
      const { packBagForSharing } = await import('@/lib/sync');
      const data = await packBagForSharing(bagId, bagName);
      setShareData(data);
    };
    generateShareData();
  }, [bagId, bagName]);

  useEffect(() => {
    let cancelled = false;
    if (!bagUrl) return;

    QRCode.toDataURL(bagUrl, {
      errorCorrectionLevel: 'M',
      margin: 2,
      scale: 8,
      color: {
        dark: '#111318',
        light: '#ffffff',
      },
    }).then(dataUrl => {
      if (!cancelled) setQrDataUrl(dataUrl);
    }).catch(error => {
      console.error('Error generating bag QR code:', error);
    });

    return () => {
      cancelled = true;
    };
  }, [bagUrl]);

  const copyLink = async () => {
    if (!bagUrl) return;
    await navigator.clipboard.writeText(bagUrl);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  };

  const downloadQr = () => {
    if (!qrDataUrl) return;
    const link = document.createElement('a');
    link.href = qrDataUrl;
    link.download = `${bagName.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase() || 'bag'}-qr.png`;
    link.click();
  };

  const printQr = () => {
    if (!qrDataUrl) return;
    const printWindow = window.open('', '_blank', 'width=420,height=520');
    if (!printWindow) return;

    printWindow.document.write(`
      <!doctype html>
      <html>
        <head>
          <title>${bagName} QR</title>
          <style>
            body {
              align-items: center;
              display: flex;
              font-family: Arial, sans-serif;
              justify-content: center;
              margin: 0;
              min-height: 100vh;
            }
            .label {
              align-items: center;
              border: 1px solid #d1d5db;
              border-radius: 12px;
              display: flex;
              flex-direction: column;
              gap: 12px;
              padding: 20px;
              text-align: center;
              width: 260px;
            }
            img { height: 180px; width: 180px; }
            h1 { font-size: 20px; margin: 0; }
            p { color: #4b5563; font-size: 12px; margin: 0; word-break: break-all; }
            @media print {
              body { min-height: auto; }
            }
          </style>
        </head>
        <body>
          <div class="label">
            <img src="${qrDataUrl}" alt="${bagName} QR code" />
            <h1>${bagName}</h1>
            <p>${bagUrl}</p>
          </div>
          <script>
            window.onload = () => {
              window.print();
              window.close();
            };
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  return (
    <div className="card !p-6 flex flex-col md:flex-row gap-6 items-center md:items-start bg-[var(--surface-2)]">
      <div className="flex shrink-0 items-center justify-center rounded-[24px] bg-white p-3 shadow-md">
        {qrDataUrl ? (
          <Image
            src={qrDataUrl}
            alt={`${bagName} QR code`}
            width={140}
            height={140}
            unoptimized
            className="h-[140px] w-[140px]"
          />
        ) : (
          <div className="h-[140px] w-[140px] flex items-center justify-center">
            <QrCode size={48} className="text-gray-300 animate-pulse" />
          </div>
        )}
      </div>

      <div className="flex-1 text-center md:text-left">
        <div className="flex items-center justify-center md:justify-start gap-2 mb-2">
          <QrCode size={20} className="text-[var(--primary)]" />
          <h4 className="text-lg font-bold text-[var(--text-primary)]">Share Bag</h4>
        </div>
        <p className="text-sm text-[var(--text-muted)] leading-relaxed mb-4">
          Scan this code to instantly view or import this bag on another device.
        </p>

        <div className="flex flex-wrap justify-center md:justify-start gap-2">
          <button
            onClick={copyLink}
            disabled={!bagUrl}
            className={`flex h-11 items-center gap-2 rounded-full px-5 text-sm font-semibold transition-all ${
              copied ? 'bg-[var(--success-bg)] text-[var(--success-fg)]' : 'bg-[var(--primary-tonal)] text-[var(--primary)] hover:bg-[var(--primary)] hover:text-[var(--on-primary)]'
            }`}
          >
            {copied ? <Check size={18} /> : <Copy size={18} />}
            {copied ? 'Copied Link' : 'Copy Link'}
          </button>

          <button
            onClick={downloadQr}
            disabled={!qrDataUrl}
            className="flex h-11 items-center gap-2 rounded-full bg-[var(--surface-3)] px-5 text-sm font-semibold text-[var(--text-primary)] hover:bg-[var(--surface-highlight)]"
          >
            <Download size={18} />
            Save Image
          </button>

          <button
            onClick={printQr}
            disabled={!qrDataUrl}
            className="flex h-11 items-center gap-2 rounded-full bg-[var(--surface-3)] px-5 text-sm font-semibold text-[var(--text-primary)] hover:bg-[var(--surface-highlight)]"
          >
            <Printer size={18} />
            Print
          </button>
        </div>
      </div>
    </div>
  );
}
