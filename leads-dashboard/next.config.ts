import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // These packages do native/WASM work (OCR, PDF rendering) and should run
  // as plain require()s at runtime rather than being bundled by webpack.
  serverExternalPackages: ['tesseract.js', '@napi-rs/canvas', 'pdfjs-dist'],
  allowedDevOrigins: [
    'localhost:3000',
    '127.0.0.1:3000',
    '192.168.1.3:3000',
    'localhost:3030',
    '127.0.0.1:3030',
    '192.168.1.3:3030',
    '192.168.1.3',
    '*.local',
  ],
};

export default nextConfig;
